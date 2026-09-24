const { prisma } = require('../db');
const config = require('../config');
const cache = require('../utils/cache');
const realtime = require('../services/realtime');
const mailer = require('../services/mailer');
const {
  asyncHandler,
  badRequest,
  notFound,
  conflict,
  forbidden,
} = require('../utils/errors');
const { endForStart, isEligibleStart, isRealDate, DATE_RE, TIME_RE } = require('../utils/slots');
const { isUuid } = require('../utils/ids');
const { STATUSES, canTransition } = require('../domain/appointment');
const { appointmentSummary } = require('../utils/serialize');

const LIVE = ['Pending', 'Confirmed'];
const INCLUDE_DOCTOR = { doctor: { include: { user: true } } };
const INCLUDE_FULL = { doctor: { include: { user: true } }, patient: true };

function parseDate(dateStr) {
  if (!DATE_RE.test(dateStr || '')) {
    throw badRequest('date must be a valid YYYY-MM-DD value');
  }
  if (!isRealDate(dateStr)) throw badRequest('date is not a real calendar day');
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

async function loadBookingContext({ doctorId, date, time }) {
  parseDate(date);
  if (!TIME_RE.test(time || '')) throw badRequest('time must be in HH:MM (24-hour) format');

  const doctor = await prisma.doctor.findFirst({ where: { id: doctorId, isActive: true } });
  if (!doctor) throw notFound('Doctor not found');
  if (!doctor.isAvailable) throw badRequest('This doctor is currently on leave / not available');

  if (!isEligibleStart(doctor, date, time)) {
    throw badRequest('Selected time is not one of the doctor\'s bookable slots for this date');
  }

  const endTime = endForStart(doctor, date, time);
  return { doctor, endTime };
}

async function assertSlotFree({ doctorId, date, startTime, excludeId = null }) {
  const where = {
    doctorId,
    date,
    startTime,
    status: { in: LIVE },
  };
  if (excludeId) where.id = { not: excludeId };
  const clash = await prisma.appointment.findFirst({ where });
  if (clash) throw conflict('This slot has already been booked');
}

function cutoffCutoffMs() {
  return config.policies.cancelCutoffHours * 60 * 60 * 1000;
}

/** Load the doctor profile linked to a doctor-role session (or null). */
async function findDoctorProfile(actor) {
  if (!actor || actor.role !== 'doctor') return null;
  return prisma.doctor.findFirst({ where: { userId: actor.id } });
}

/**
 * POST /api/appointments  (patient)
 * Book an appointment for an eligible future slot.
 */
const createAppointment = asyncHandler(async (req, res) => {
  const { doctorId, date, time, symptoms = '' } = req.body;
  if (!doctorId) throw badRequest('doctorId is required');
  if (!isUuid(doctorId)) throw badRequest('Invalid doctorId');

  const { doctor, endTime } = await loadBookingContext({ doctorId, date, time });

  // Must book a future slot (no same-day-past times).
  const slotDate = new Date(`${date}T${time}:00`);
  if (slotDate.getTime() <= Date.now()) {
    throw badRequest('Cannot book a slot in the past');
  }

  await assertSlotFree({ doctorId, date, startTime: time });

  // A simultaneous booking of the same slot is rejected by the partial
  // unique index (P2002 -> 409 in the central error handler).
  const created = await prisma.appointment.create({
    data: {
      patientId: req.user.id,
      doctorId: doctor.id,
      date,
      startTime: time,
      endTime,
      dateTime: slotDate,
      status: 'Pending',
      symptoms: String(symptoms).trim(),
    },
  });

  const full = await prisma.appointment.findUnique({
    where: { id: created.id },
    include: INCLUDE_DOCTOR,
  });
  const serialized = appointmentSummary(full);

  // A new booking consumes a slot: drop the cached slot grid for this doctor
  // and push a lightweight "something changed" trigger over the socket layer.
  await cache.delPrefix(`slots:${doctor.id}`);
  realtime.slotsChanged(doctor.id);
  realtime.emitAppointment('appointment:created', full);

  // Booking confirmation e-mail (no-op unless SMTP is configured).
  mailer.sendBookingCreated({
    patientName: req.user.name,
    patientEmail: req.user.email,
    doctorName: serialized.doctorName,
    date,
    time,
    symptoms: String(symptoms).trim(),
  });

  res.status(201).json({ data: serialized });
});

/**
 * GET /api/appointments/my?status=&from=&to=  (patient)
 * Patient's own appointment history.
 */
const listMine = asyncHandler(async (req, res) => {
  const { status = '', from = '', to = '' } = req.query;
  const where = { patientId: req.user.id };
  if (status) where.status = STATUSES.includes(status) ? status : { in: [] };
  if (isRealDate(from) || isRealDate(to)) {
    where.dateTime = {};
    if (isRealDate(from)) where.dateTime.gte = new Date(`${from}T00:00:00`);
    if (isRealDate(to)) where.dateTime.lte = new Date(`${to}T23:59:59`);
  }

  const rows = await prisma.appointment.findMany({
    where,
    include: INCLUDE_DOCTOR,
    orderBy: { dateTime: 'asc' },
  });

  res.json({ count: rows.length, data: rows.map(appointmentSummary) });
});

/**
 * GET /api/appointments/doctor?date=&status=&from=&to=  (doctor)
 * A doctor's schedule/queue. `date` pins a single day; `from`/`to` return an
 * inclusive range, which backs the weekly and monthly dashboard views.
 */
const listForDoctor = asyncHandler(async (req, res) => {
  const doctorProfile = await prisma.doctor.findFirst({ where: { userId: req.user.id } });
  if (!doctorProfile) throw forbidden('No doctor profile linked to this account');

  const { date = '', status = '', from = '', to = '' } = req.query;
  const where = { doctorId: doctorProfile.id };
  if (status) where.status = STATUSES.includes(status) ? status : { in: [] };

  // `date` is stored as "YYYY-MM-DD", so a lexicographic range is also a
  // chronological one and stays on the doctorId+date index.
  if (isRealDate(date)) {
    where.date = date;
  } else if (isRealDate(from) || isRealDate(to)) {
    where.date = {};
    if (isRealDate(from)) where.date.gte = from;
    if (isRealDate(to)) where.date.lte = to;
  }

  const rows = await prisma.appointment.findMany({
    where,
    include: { patient: true },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  res.json({ count: rows.length, data: rows.map(appointmentSummary) });
});

/**
 * GET /api/appointments?status=&doctorId=&patientId=&from=&to=  (admin)
 * Global appointment ledger with filters.
 */
const listAll = asyncHandler(async (req, res) => {
  const { status = '', doctorId = '', patientId = '', from = '', to = '' } = req.query;
  const where = {};
  if (status) where.status = STATUSES.includes(status) ? status : { in: [] };
  if (isUuid(doctorId)) where.doctorId = doctorId;
  if (isUuid(patientId)) where.patientId = patientId;
  if (isRealDate(from) || isRealDate(to)) {
    where.dateTime = {};
    if (isRealDate(from)) where.dateTime.gte = new Date(`${from}T00:00:00`);
    if (isRealDate(to)) where.dateTime.lte = new Date(`${to}T23:59:59`);
  }

  const rows = await prisma.appointment.findMany({
    where,
    include: INCLUDE_FULL,
    orderBy: { dateTime: 'desc' },
  });

  res.json({ count: rows.length, data: rows.map(appointmentSummary) });
});

/** GET /api/appointments/:id — visibility scoped to owner/doctor/admin. */
const getOne = asyncHandler(async (req, res) => {
  const a = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: INCLUDE_FULL,
  });
  if (!a) throw notFound('Appointment not found');

  const isOwner = req.user.role === 'patient' && req.user.id === a.patientId;
  const doctorProfile = req.user.role === 'doctor' ? await findDoctorProfile(req.user) : null;
  const isTheirDoctor = Boolean(doctorProfile && doctorProfile.id === a.doctorId);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isTheirDoctor && !isAdmin) throw forbidden('You cannot view this appointment');

  res.json({ data: appointmentSummary(a) });
});

/** Shared guard for reschedule/cancel. */
async function canMutate(a, actor, { adminBypass = false, allowDoctor = false } = {}) {
  if (!a) throw notFound('Appointment not found');
  if (a.status === 'Cancelled') throw badRequest('This appointment was already cancelled');
  if (a.status === 'Completed') throw badRequest('Completed appointments cannot be changed');

  if (adminBypass || actor.role === 'admin') return;

  if (actor.role === 'patient') {
    if (actor.id !== a.patientId) {
      throw forbidden('You can only change your own appointments');
    }
    // Patients cannot cancel/reschedule inside the cutoff window.
    const cutoff = a.dateTime.getTime() - cutoffCutoffMs();
    if (Date.now() >= cutoff) {
      throw badRequest(
        `Appointments can only be changed until ${config.policies.cancelCutoffHours} hours before start time`
      );
    }
    return;
  }

  // A doctor may only act on appointments assigned to them, and only where the
  // operation is meaningful for their role (cancelling, not rescheduling).
  if (actor.role === 'doctor' && allowDoctor) {
    const doctorProfile = await findDoctorProfile(actor);
    if (!doctorProfile || doctorProfile.id !== a.doctorId) {
      throw forbidden('You can only change appointments assigned to you');
    }
    return;
  }

  throw forbidden('You are not allowed to change this appointment');
}

/**
 * POST /api/appointments/:id/reschedule  (patient own / admin)
 */
const reschedule = asyncHandler(async (req, res) => {
  const a = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!a) throw notFound('Appointment not found');

  const admin = req.user.role === 'admin';
  await canMutate(a, req.user, { adminBypass: admin });

  const { date, time } = req.body;
  const { endTime } = await loadBookingContext({ doctorId: a.doctorId, date, time });

  const slotDate = new Date(`${date}T${time}:00`);
  if (slotDate.getTime() <= Date.now()) throw badRequest('Cannot reschedule to a past slot');

  // Prevent the free/busy race for the *new* slot (the old slot is excluded).
  await assertSlotFree({ doctorId: a.doctorId, date, startTime: time, excludeId: a.id });

  const updated = await prisma.appointment.update({
    where: { id: a.id },
    data: { date, startTime: time, endTime, dateTime: slotDate, status: 'Pending' },
  });

  const full = await prisma.appointment.findUnique({
    where: { id: updated.id },
    include: INCLUDE_FULL,
  });
  const serialized = appointmentSummary(full);

  // The old slot is released and the new one consumed.
  await cache.delPrefix(`slots:${a.doctorId}`);
  realtime.slotsChanged(a.doctorId);
  realtime.emitAppointment('appointment:updated', full);
  mailer.sendRescheduled({
    patientName: serialized.patientName,
    patientEmail: full.patient ? full.patient.email : '',
    doctorName: serialized.doctorName,
    date,
    time,
  });

  res.json({ data: serialized });
});

/**
 * POST /api/appointments/:id/cancel  (patient own / assigned doctor / admin)
 */
const cancelAppointment = asyncHandler(async (req, res) => {
  const a = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!a) throw notFound('Appointment not found');

  const admin = req.user.role === 'admin';
  await canMutate(a, req.user, { adminBypass: admin, allowDoctor: true });

  await prisma.appointment.update({
    where: { id: a.id },
    data: { status: 'Cancelled', cancelledBy: req.user.role },
  });

  const full = await prisma.appointment.findUnique({
    where: { id: a.id },
    include: INCLUDE_FULL,
  });
  const serialized = appointmentSummary(full);

  // Cancelling returns the slot to the available pool.
  await cache.delPrefix(`slots:${a.doctorId}`);
  realtime.slotsChanged(a.doctorId);
  realtime.emitAppointment('appointment:updated', full);
  mailer.sendCancelled({
    patientName: serialized.patientName,
    patientEmail: full.patient ? full.patient.email : '',
    doctorName: serialized.doctorName,
    date: a.date,
    time: a.startTime,
  });

  res.json({ message: 'Appointment cancelled. The slot has been released.', data: serialized });
});

/**
 * Consultation record fields (Module 4), mapped from request body keys to
 * database fields. `notes` stays the public name for backwards compatibility.
 */
const RECORD_FIELDS = {
  notes: 'consultationNotes',
  diagnosis: 'diagnosis',
  prescription: 'prescription',
};

/**
 * Collect whichever consultation-record fields the caller supplied.
 * Returns null when none of them are present, so callers can distinguish
 * "not provided" from "provided but blank".
 */
function consultationPatch(body = {}) {
  const patch = {};
  for (const [key, field] of Object.entries(RECORD_FIELDS)) {
    const val = body[key];
    if (val === undefined || val === null) continue;
    if (typeof val !== 'string') throw badRequest(`${key} must be a string`);
    patch[field] = val.trim();
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * PATCH /api/appointments/:id/status  (doctor own / admin)
 * body: { status: 'Confirmed' | 'Completed' | 'Cancelled' }
 * Enforces the legal transition graph (TC-04: Cancelled -> Completed is a 400).
 */
const updateStatus = asyncHandler(async (req, res) => {
  const a = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!a) throw notFound('Appointment not found');

  const doctorProfile = await findDoctorProfile(req.user);
  const isTheirDoctor = Boolean(doctorProfile && doctorProfile.id === a.doctorId);
  const isAdmin = req.user.role === 'admin';
  if (!isTheirDoctor && !isAdmin) throw forbidden('Only the assigned doctor or an admin can update status');

  const { status } = req.body;
  if (!canTransition(a.status, status)) {
    throw badRequest(`Invalid status transition: ${a.status} -> ${status || '(none)'}`);
  }

  const data = { status };
  if (status === 'Completed') {
    const patch = consultationPatch(req.body);
    if (patch) {
      Object.assign(data, patch);
      data.notesLastEditedAt = new Date();
    }
  }
  await prisma.appointment.update({ where: { id: a.id }, data });

  const full = await prisma.appointment.findUnique({
    where: { id: a.id },
    include: INCLUDE_FULL,
  });
  const serialized = appointmentSummary(full);

  // Status transitions can consume/release slots (Confirmed <-> Cancelled).
  await cache.delPrefix(`slots:${a.doctorId}`);
  realtime.slotsChanged(a.doctorId);
  realtime.emitAppointment('appointment:status', full);
  mailer.sendStatusChanged({
    patientName: serialized.patientName,
    patientEmail: full.patient ? full.patient.email : '',
    doctorName: serialized.doctorName,
    date: a.date,
    time: a.startTime,
    status: serialized.status,
  });

  res.json({ data: serialized });
});

/**
 * PATCH /api/appointments/:id/notes  (doctor own / admin)
 * body: any of { notes, diagnosis, prescription }
 * The record may be written when completing, or edited within the 24h window
 * after the consultation ends.
 */
const saveNotes = asyncHandler(async (req, res) => {
  const a = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!a) throw notFound('Appointment not found');

  const doctorProfile = await findDoctorProfile(req.user);
  const isTheirDoctor = Boolean(doctorProfile && doctorProfile.id === a.doctorId);
  const isAdmin = req.user.role === 'admin';
  if (!isTheirDoctor && !isAdmin) throw forbidden('Only the assigned doctor or an admin can write notes');

  const patch = consultationPatch(req.body);
  if (!patch) throw badRequest('Provide at least one of notes, diagnosis or prescription');

  if (a.status !== 'Completed') {
    throw badRequest('Consultation notes can only be added to completed appointments');
  }

  const endAt = new Date(`${a.date}T${a.endTime}:00`);
  const deadline = endAt.getTime() + config.policies.notesEditWindowHours * 60 * 60 * 1000;
  if (Date.now() > deadline && !isAdmin) {
    throw badRequest(
      `Notes can only be edited within ${config.policies.notesEditWindowHours} hours after the consultation`
    );
  }

  const merged = {
    consultationNotes: a.consultationNotes,
    diagnosis: a.diagnosis,
    prescription: a.prescription,
    ...patch,
  };
  if (!merged.consultationNotes && !merged.diagnosis && !merged.prescription) {
    throw badRequest('The consultation record cannot be left completely empty');
  }

  await prisma.appointment.update({
    where: { id: a.id },
    data: { ...patch, notesLastEditedAt: new Date() },
  });

  const full = await prisma.appointment.findUnique({
    where: { id: a.id },
    include: INCLUDE_FULL,
  });
  const serialized = appointmentSummary(full);

  // Consultation records don't touch slot availability, but the patient and
  // the admin view should refresh (realtime trigger only, no cache flush).
  realtime.emitAppointment('appointment:notes', full);
  mailer.sendNotesReady({
    patientName: serialized.patientName,
    patientEmail: full.patient ? full.patient.email : '',
    doctorName: serialized.doctorName,
    date: a.date,
  });

  res.json({ data: serialized });
});

/**
 * DELETE /api/appointments/:id  (admin only)
 * Module 4 "Delete": purge an inaccurate or duplicate medical record. The
 * row is removed permanently, so a live (Pending/Confirmed) booking also
 * releases its reserved slot back into the available pool.
 */
const purgeAppointment = asyncHandler(async (req, res) => {
  const a = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: INCLUDE_FULL,
  });
  if (!a) throw notFound('Appointment not found');

  const snapshot = appointmentSummary(a);
  await prisma.appointment.delete({ where: { id: a.id } });

  // Purging a live record releases its slot back into the pool.
  await cache.delPrefix(`slots:${a.doctorId}`);
  realtime.slotsChanged(a.doctorId);
  realtime.emitAppointment('appointment:removed', a);

  res.json({
    message: LIVE.includes(snapshot.status)
      ? 'Appointment record purged. The reserved slot has been released.'
      : 'Appointment record purged.',
    data: snapshot,
  });
});

module.exports = {
  createAppointment,
  listMine,
  listForDoctor,
  listAll,
  getOne,
  reschedule,
  cancelAppointment,
  updateStatus,
  saveNotes,
  purgeAppointment,
};
