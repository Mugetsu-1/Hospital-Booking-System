const bcrypt = require('bcryptjs');
const { prisma } = require('../db');
const cache = require('../utils/cache');
const realtime = require('../services/realtime');
const {
  asyncHandler,
  badRequest,
  notFound,
  conflict,
  forbidden,
} = require('../utils/errors');
const { availableSlots, isRealDate, validateSlotBlocks } = require('../utils/slots');
const { doctorSummary } = require('../utils/serialize');

const LIVE = ['Pending', 'Confirmed'];
const USER_FIELDS = { name: true, phone: true, email: true };
const INCLUDE_USER = { user: { select: USER_FIELDS } };

/** Stable, order-independent cache key fragment for a query-string object. */
function qsKey(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/**
 * GET /api/doctors?specialization=&q=&day=&maxFee=
 * Public read: patients search the doctor directory. Deactivated doctors and
 * doctors who set themselves away are excluded unless the caller is an admin.
 */
const listDoctors = asyncHandler(async (req, res) => {
  const { q = '', specialization = '', day = '', maxFee = '', includeInactive = 'false' } = req.query;
  const isAdmin = req.user && req.user.role === 'admin';

  const userFilter = { role: 'doctor' };
  if (q.trim()) userFilter.name = { contains: q.trim(), mode: 'insensitive' };
  if (!isAdmin || includeInactive !== 'true') userFilter.isActive = true;

  const where = { user: userFilter };
  if (specialization.trim()) {
    where.specialization = { contains: specialization.trim(), mode: 'insensitive' };
  }
  if (maxFee !== '' && !Number.isNaN(Number(maxFee))) {
    where.consultationFee = { lte: Number(maxFee) };
  }
  if (!isAdmin || includeInactive !== 'true') {
    where.isActive = true;
    where.isAvailable = true;
  }

  let doctors = await prisma.doctor.findMany({
    where,
    include: INCLUDE_USER,
    orderBy: { createdAt: 'asc' },
  });

  // The weekly schedule lives in a JSON column; matching a weekday is a
  // small in-memory filter (the directory is a bounded, cached list).
  if (day.trim()) {
    doctors = doctors.filter(
      (d) => Array.isArray(d.availableSlots) && d.availableSlots.some((b) => b && b.day === day)
    );
  }

  const payload = { count: doctors.length, data: doctors.map(doctorSummary) };
  await cache.setJSON(`doctors:list:${qsKey(req.query)}`, payload);
  res.json(payload);
});

/** GET /api/doctors/me — the doctor profile linked to the authenticated account. */
const getMyProfile = asyncHandler(async (req, res) => {
  const doctor = await prisma.doctor.findFirst({
    where: { userId: req.user.id },
    include: { user: { select: { name: true, email: true, phone: true } } },
  });
  if (!doctor) throw notFound('No doctor profile is linked to this account');
  res.json({ data: doctorSummary(doctor) });
});

/** GET /api/doctors/:id — full public profile of one doctor. */
const getDoctor = asyncHandler(async (req, res) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { name: true, email: true, phone: true } } },
  });
  if (!doctor) throw notFound('Doctor not found');
  res.json({ data: doctorSummary(doctor) });
});

/**
 * GET /api/doctors/:id/slots?date=YYYY-MM-DD
 * Slot availability for a date. Any slot currently held by a Pending or
 * Confirmed appointment is removed from the list.
 */
const getSlots = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!isRealDate(date)) throw badRequest('A date query param (a real YYYY-MM-DD day) is required');

  // Read-through cache: this endpoint is hit every time a patient opens the
  // slot picker, so repeat reads are served straight from Redis when enabled.
  const slotKey = `slots:${req.params.id}:${date}`;
  const cached = await cache.getJSON(slotKey);
  if (cached) return res.json(cached);

  const doctor = await prisma.doctor.findFirst({
    where: { id: req.params.id, isActive: true },
  });
  if (!doctor) throw notFound('Doctor not found');

  let payload;
  if (!doctor.isAvailable) {
    payload = { date, slots: [], bookedTimes: [], onLeave: true };
  } else {
    const booked = await prisma.appointment.findMany({
      where: { doctorId: doctor.id, date, status: { in: LIVE } },
      select: { startTime: true },
      orderBy: { startTime: 'asc' },
    });

    const bookedTimes = booked.map((a) => a.startTime);
    const slots = availableSlots({ doctor, dateStr: date, bookedTimes });
    payload = { date, slots, bookedTimes, onLeave: false };
  }

  await cache.setJSON(slotKey, payload);
  res.json(payload);
});

/**
 * POST /api/doctors — admin creates a doctor: creates the auth User
 * (role='doctor') plus the Doctor directory/schedule profile atomically.
 */
const createDoctor = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    phone = '',
    specialization,
    qualification = '',
    consultationFee,
    availableSlots: slotsInput = [],
    isAvailable = true,
  } = req.body;

  if (!name || !email || !password) throw badRequest('name, email and password are required');
  if (String(password).length < 6) throw badRequest('Password must be at least 6 characters');
  if (!specialization || consultationFee === undefined || Number.isNaN(Number(consultationFee))) {
    throw badRequest('specialization and a numeric consultationFee are required');
  }
  if (!Array.isArray(slotsInput) || slotsInput.length === 0) {
    throw badRequest('At least one availableSlots entry (day/startTime/endTime/slotDurationMins) is required');
  }
  const slotError = validateSlotBlocks(slotsInput);
  if (slotError) throw badRequest(slotError);

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);

  let doctor;
  try {
    // A single transaction: the auth account and the directory profile are
    // created together or not at all (no orphaned users).
    doctor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: String(name).trim(), email: normalizedEmail, passwordHash, role: 'doctor', phone },
      });
      return tx.doctor.create({
        data: {
          userId: user.id,
          specialization,
          qualification,
          consultationFee: Number(consultationFee),
          availableSlots: slotsInput,
          isAvailable,
        },
        include: INCLUDE_USER,
      });
    });
  } catch (err) {
    if (err.code === 'P2002') throw conflict('An account with this email already exists');
    throw err;
  }

  // A new doctor appears in directory searches and slot lookups.
  await cache.delPrefix('doctors:list:');
  await cache.delPrefix('slots:');
  realtime.slotsChanged(doctor.id);
  res.status(201).json({ data: doctorSummary(doctor) });
});

/**
 * PATCH /api/doctors/:id
 * The doctor updates their own availability/schedule/profile; an admin can
 * update anything. Users cannot switch accounts via this route.
 */
const updateDoctor = asyncHandler(async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!doctor) throw notFound('Doctor not found');

  const isSelf = req.user.role === 'doctor' && req.user.id === doctor.userId;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) throw forbidden('You cannot edit this doctor profile');

  const allowed = [
    'specialization',
    'qualification',
    'consultationFee',
    'availableSlots',
    'isAvailable',
  ];
  const data = {};
  for (const key of allowed) {
    if (key in req.body) data[key] = req.body[key];
  }
  if ('availableSlots' in data) {
    const slotError = validateSlotBlocks(data.availableSlots);
    if (slotError) throw badRequest(slotError);
  }
  if ('consultationFee' in data) data.consultationFee = Number(data.consultationFee);

  // Keep the linked auth account in sync. A doctor may correct their own
  // contact number; an administrator may also fix the display name.
  const userPatch = {};
  if (req.body.phone !== undefined) userPatch.phone = String(req.body.phone).trim();
  if (isAdmin && req.body.name !== undefined) {
    const nextName = String(req.body.name).trim();
    if (!nextName) throw badRequest('name cannot be empty');
    userPatch.name = nextName;
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) {
      await tx.doctor.update({ where: { id: doctor.id }, data });
    }
    if (Object.keys(userPatch).length) {
      await tx.user.update({ where: { id: doctor.userId }, data: userPatch });
    }
  });

  const fresh = await prisma.doctor.findUnique({ where: { id: doctor.id }, include: INCLUDE_USER });

  // Schedule/fee/availability changes ripple through the directory and grids.
  await cache.delPrefix('doctors:list:');
  await cache.delPrefix(`slots:${doctor.id}`);
  realtime.slotsChanged(doctor.id);

  res.json({ data: doctorSummary(fresh) });
});

/**
 * PATCH /api/doctors/:id/status — admin deactivates/reactivates (soft delete).
 */
const setDoctorActive = asyncHandler(async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id }, include: INCLUDE_USER });
  if (!doctor) throw notFound('Doctor not found');
  if (typeof req.body.isActive !== 'boolean') throw badRequest('isActive must be a boolean');

  const { isActive } = req.body;
  await prisma.$transaction([
    prisma.doctor.update({ where: { id: doctor.id }, data: { isActive } }),
    // Flip the linked auth account so the doctor can no longer log in.
    prisma.user.update({ where: { id: doctor.userId }, data: { isActive } }),
  ]);

  await cache.delPrefix('doctors:list:');
  await cache.delPrefix(`slots:${doctor.id}`);
  realtime.slotsChanged(doctor.id);

  res.json({
    message: isActive ? 'Doctor account reactivated' : 'Doctor account deactivated',
    data: doctorSummary({ ...doctor, isActive }),
  });
});

module.exports = {
  listDoctors,
  getDoctor,
  getMyProfile,
  getSlots,
  createDoctor,
  updateDoctor,
  setDoctorActive,
};
