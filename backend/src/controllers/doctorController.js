const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const cache = require('../utils/cache');
const realtime = require('../services/realtime');
const {
  asyncHandler,
  badRequest,
  notFound,
  conflict,
  forbidden,
} = require('../utils/errors');
const { availableSlots, isRealDate } = require('../utils/slots');

/** Stable, order-independent cache key fragment for a query-string object. */
function qsKey(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

function doctorSummary(doc) {
  const user = doc.userId || {};
  return {
    _id: doc._id,
    doctorName: typeof user === 'object' && user.name ? user.name : '',
    phone: typeof user === 'object' ? user.phone || '' : '',
    email: typeof user === 'object' ? user.email || '' : '',
    specialization: doc.specialization,
    qualification: doc.qualification,
    consultationFee: doc.consultationFee,
    availableSlots: doc.availableSlots,
    isAvailable: doc.isAvailable,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
  };
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
  if (q.trim()) userFilter.name = new RegExp(q.trim(), 'i');
  if (!isAdmin || includeInactive !== 'true') userFilter.isActive = true;

  const users = await User.find(userFilter).select('_id name phone email isActive');
  if (users.length === 0) return res.json({ count: 0, data: [] });

  const doctorFilter = {
    userId: { $in: users.map((u) => u._id) },
  };
  if (specialization.trim()) doctorFilter.specialization = new RegExp(specialization.trim(), 'i');
  if (maxFee !== '' && !Number.isNaN(Number(maxFee))) {
    doctorFilter.consultationFee = { $lte: Number(maxFee) };
  }
  if (day.trim()) doctorFilter.availableSlots = { $elemMatch: { day } };
  if (!isAdmin || includeInactive !== 'true') {
    doctorFilter.isActive = true;
    doctorFilter.isAvailable = true;
  }

  const doctors = await Doctor.find(doctorFilter).populate('userId', 'name phone email');

  // Keep only doctors whose linked user passed the user-level filter.
  const activeUserIds = new Set(users.map((u) => String(u._id)));
  const result = doctors.filter((d) => activeUserIds.has(String(d.userId._id)));

  const payload = { count: result.length, data: result.map(doctorSummary) };
  await cache.setJSON(`doctors:list:${qsKey(req.query)}`, payload);
  res.json(payload);
});

/** GET /api/doctors/me — the doctor profile linked to the authenticated account. */
const getMyProfile = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOne({ userId: req.user._id }).populate(
    'userId',
    'name email phone'
  );
  if (!doctor) throw notFound('No doctor profile is linked to this account');
  res.json({ data: doctorSummary(doctor) });
});

/** GET /api/doctors/:id — full public profile of one doctor. */
const getDoctor = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOne({ _id: req.params.id }).populate('userId', 'name email phone');
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

  const doctor = await Doctor.findOne({ _id: req.params.id, isActive: true });
  if (!doctor) throw notFound('Doctor not found');

  let payload;
  if (!doctor.isAvailable) {
    payload = { date, slots: [], bookedTimes: [], onLeave: true };
  } else {
    const booked = await Appointment.find({
      doctorId: doctor._id,
      date,
      status: { $in: ['Pending', 'Confirmed'] },
    }).select('startTime');

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
    availableSlots = [],
    isAvailable = true,
  } = req.body;

  if (!name || !email || !password) throw badRequest('name, email and password are required');
  if (String(password).length < 6) throw badRequest('Password must be at least 6 characters');
  if (!specialization || consultationFee === undefined || Number.isNaN(Number(consultationFee))) {
    throw badRequest('specialization and a numeric consultationFee are required');
  }
  if (!Array.isArray(availableSlots) || availableSlots.length === 0) {
    throw badRequest('At least one availableSlots entry (day/startTime/endTime/slotDurationMins) is required');
  }

  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) throw conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: String(name).trim(),
    email,
    passwordHash,
    role: 'doctor',
    phone,
  });

  try {
    const doctor = await Doctor.create({
      userId: user._id,
      specialization,
      qualification,
      consultationFee: Number(consultationFee),
      availableSlots,
      isAvailable,
    });
    // Populate the linked account so the response carries the same shape as
    // every other doctor endpoint (name/email/phone), not an empty summary.
    await doctor.populate('userId', 'name email phone');
    // A new doctor appears in directory searches and slot lookups.
    await cache.delPrefix('doctors:list:');
    await cache.delPrefix('slots:');
    realtime.slotsChanged(doctor._id);
    res.status(201).json({ data: doctorSummary(doctor) });
  } catch (err) {
    // Roll back the auth user if the directory profile failed to save.
    await User.deleteOne({ _id: user._id });
    throw err;
  }
});

/**
 * PATCH /api/doctors/:id
 * The doctor updates their own availability/schedule/profile; an admin can
 * update anything. Users cannot switch accounts via this route.
 */
const updateDoctor = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOne({ _id: req.params.id }).populate('userId', 'name email phone');
  if (!doctor) throw notFound('Doctor not found');

  const isSelf =
    req.user.role === 'doctor' && doctor.userId && req.user._id.equals(doctor.userId._id);
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) throw forbidden('You cannot edit this doctor profile');

  const allowed = [
    'specialization',
    'qualification',
    'consultationFee',
    'availableSlots',
    'isAvailable',
  ];
  for (const key of allowed) {
    if (key in req.body) {
      if (key === 'availableSlots' && !Array.isArray(req.body[key])) {
        throw badRequest('availableSlots must be an array');
      }
      doctor[key] = req.body[key];
    }
  }

  // Keep the linked auth account in sync. A doctor may correct their own
  // contact number; an administrator may also fix the display name.
  const userPatch = {};
  if (req.body.phone !== undefined) userPatch.phone = String(req.body.phone).trim();
  if (isAdmin && req.body.name !== undefined) {
    const nextName = String(req.body.name).trim();
    if (!nextName) throw badRequest('name cannot be empty');
    userPatch.name = nextName;
  }
  if (Object.keys(userPatch).length > 0 && doctor.userId) {
    await User.updateOne({ _id: doctor.userId._id }, { $set: userPatch });
  }

  await doctor.save();
  const fresh = await Doctor.findById(doctor._id).populate('userId', 'name email phone');

  // Schedule/fee/availability changes ripple through the directory and grids.
  await cache.delPrefix('doctors:list:');
  await cache.delPrefix(`slots:${doctor._id}`);
  realtime.slotsChanged(doctor._id);

  res.json({ data: doctorSummary(fresh) });
});

/**
 * PATCH /api/doctors/:id/status — admin deactivates/reactivates (soft delete).
 */
const setDoctorActive = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOne({ _id: req.params.id }).populate('userId', 'name email');
  if (!doctor) throw notFound('Doctor not found');
  if (typeof req.body.isActive !== 'boolean') throw badRequest('isActive must be a boolean');

  doctor.isActive = req.body.isActive;
  await doctor.save();

  // Flip the linked auth account so the doctor can no longer log in.
  await User.updateOne({ _id: doctor.userId._id }, { $set: { isActive: req.body.isActive } });

  await cache.delPrefix('doctors:list:');
  await cache.delPrefix(`slots:${doctor._id}`);
  realtime.slotsChanged(doctor._id);

  res.json({
    message: req.body.isActive ? 'Doctor account reactivated' : 'Doctor account deactivated',
    data: doctorSummary(doctor),
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
