const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
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
const { endForStart, isEligibleStart, isRealDate, DATE_RE } = require('../utils/slots');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const LIVE = ['Pending', 'Confirmed'];
const POPULATE_DOCTOR = { path: 'doctorId', populate: { path: 'userId', select: 'name email phone' } };
const POPULATE_PATIENT = { path: 'patientId', select: 'name email phone age gender emergencyContact' };

/**
 * Unwrap a reference so ownership checks work whether the document was loaded
 * plainly (ObjectId) or with .populate() (a sub-document). Comparing an
 * ObjectId against a populated document always yields false, which would
 * silently lock the real owner out of their own record.
 */
function refId(ref) {
  return ref && ref._id ? ref._id : ref;
}

function serialize(a) {
  const obj = a.toObject ? a.toObject() : a;
  const doc = obj.doctorId || {};
  const pat = obj.patientId || {};
  return {
    ...obj,
    doctorName: doc.doctorName || (doc.userId && doc.userId.name) || '',
    doctorSpecialization: doc.specialization || '',
    doctorPhone: doc.userId ? doc.userId.phone : '',
    patientName: pat.name || '',
    patientPhone: pat.phone || '',
  };
}

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

  const doctor = await Doctor.findOne({ _id: doctorId, isActive: true });
  if (!doctor) throw notFound('Doctor not found');
  if (!doctor.isAvailable) throw badRequest('This doctor is currently on leave / not available');

  if (!isEligibleStart(doctor, date, time)) {
    throw badRequest('Selected time is not one of the doctor\'s bookable slots for this date');
  }

  const endTime = endForStart(doctor, date, time);
  return { doctor, endTime };
}

async function assertSlotFree({ doctorId, date, startTime, excludeId = null }) {
  const q = {
    doctorId,
    date,
    startTime,
    status: { $in: LIVE },
  };
  if (excludeId) q._id = { $ne: excludeId };
  const clash = await Appointment.findOne(q);
  if (clash) throw conflict('This slot has already been booked');
}

function cutoffCutoffMs() {
  return config.policies.cancelCutoffHours * 60 * 60 * 1000;
}

/**
 * POST /api/appointments  (patient)
 * Book an appointment for an eligible future slot.
 */
const createAppointment = asyncHandler(async (req, res) => {
  const { doctorId, date, time, symptoms = '' } = req.body;
  if (!doctorId) throw badRequest('doctorId is required');
  if (mongoose.Types.ObjectId.isValid(doctorId) === false) throw badRequest('Invalid doctorId');

  const { doctor, endTime } = await loadBookingContext({ doctorId, date, time });

  // Must book a future slot (no same-day-past times).
  const slotDate = new Date(`${date}T${time}:00`);
  if (slotDate.getTime() <= Date.now()) {
    throw badRequest('Cannot book a slot in the past');
  }

  await assertSlotFree({ doctorId, date, startTime: time });

  const appointment = await Appointment.create({
    patientId: req.user._id,
    doctorId: doctor._id,
    date,
    startTime: time,
    endTime,
    dateTime: slotDate,
    status: 'Pending',
    symptoms: String(symptoms).trim(),
  });

  const full = await Appointment.findById(appointment._id).populate(POPULATE_DOCTOR);
  const serialized = serialize(full);

  // A new booking consumes a slot: drop the cached slot grid for this doctor
  // and push a lightweight "something changed" trigger over the socket layer.
  await cache.delPrefix(`slots:${doctor._id}`);
  realtime.slotsChanged(doctor._id);
  realtime.emitAppointment('appointment:created', {
    _id: appointment._id,
    patientId: req.user._id,
    doctorId: doctor._id,
    status: 'Pending',
    date,
    startTime: time,
  });

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
  const q = { patientId: req.user._id };
  if (status) q.status = status;
  if (isRealDate(from)) q.dateTime = { $gte: new Date(`${from}T00:00:00`) };
  if (isRealDate(to)) q.dateTime = { ...(q.dateTime || {}), $lte: new Date(`${to}T23:59:59`) };

  const rows = await Appointment.find(q)
    .populate(POPULATE_DOCTOR)
    .sort({ dateTime: 1 });

  res.json({ count: rows.length, data: rows.map(serialize) });
});

/**
 * GET /api/appointments/doctor?date=&status=&from=&to=  (doctor)
 * A doctor's schedule/queue. `date` pins a single day; `from`/`to` return an
 * inclusive range, which backs the weekly and monthly dashboard views.
 */
const listForDoctor = asyncHandler(async (req, res) => {
  const doctorProfile = await Doctor.findOne({ userId: req.user._id });
  if (!doctorProfile) throw forbidden('No doctor profile linked to this account');

  const { date = '', status = '', from = '', to = '' } = req.query;
  const q = { doctorId: doctorProfile._id };
  if (status) q.status = status;

  // `date` is stored as "YYYY-MM-DD", so a lexicographic range is also a
  // chronological one and stays on the doctorId+date index.
  if (isRealDate(date)) {
    q.date = date;
  } else if (isRealDate(from) || isRealDate(to)) {
    q.date = {};
    if (isRealDate(from)) q.date.$gte = from;
    if (isRealDate(to)) q.date.$lte = to;
  }

  const rows = await Appointment.find(q)
    .populate(POPULATE_PATIENT)
    .sort({ date: 1, startTime: 1 });

  res.json({ count: rows.length, data: rows.map(serialize) });
});

/**
 * GET /api/appointments?status=&doctorId=&patientId=&from=&to=  (admin)
 * Global appointment ledger with filters.
 */
const listAll = asyncHandler(async (req, res) => {
  const { status = '', doctorId = '', patientId = '', from = '', to = '' } = req.query;
  const q = {};
  if (status) q.status = status;
  if (mongoose.Types.ObjectId.isValid(doctorId)) q.doctorId = doctorId;
  if (mongoose.Types.ObjectId.isValid(patientId)) q.patientId = patientId;
  if (isRealDate(from)) q.dateTime = { $gte: new Date(`${from}T00:00:00`) };
  if (isRealDate(to)) q.dateTime = { ...(q.dateTime || {}), $lte: new Date(`${to}T23:59:59`) };

  const rows = await Appointment.find(q)
    .populate(POPULATE_DOCTOR)
    .populate(POPULATE_PATIENT)
    .sort({ dateTime: -1 });

  res.json({ count: rows.length, data: rows.map(serialize) });
});

/** GET /api/appointments/:id — visibility scoped to owner/doctor/admin. */
const getOne = asyncHandler(async (req, res) => {
  const a = await Appointment.findById(req.params.id)
    .populate(POPULATE_DOCTOR)
    .populate(POPULATE_PATIENT);
  if (!a) throw notFound('Appointment not found');

  const doctorProfile = await Doctor.findOne({ userId: req.user._id });
  const isOwner = req.user.role === 'patient' && req.user._id.equals(refId(a.patientId));
  const isTheirDoctor =
    req.user.role === 'doctor' && doctorProfile && doctorProfile._id.equals(refId(a.doctorId));
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isTheirDoctor && !isAdmin) throw forbidden('You cannot view this appointment');

  res.json({ data: serialize(a) });
});

/** Shared guard for reschedule/cancel. */
async function canMutate(a, actor, { adminBypass = false, allowDoctor = false } = {}) {
  if (!a) throw notFound('Appointment not found');
  if (a.status === 'Cancelled') throw badRequest('This appointment was already cancelled');
  if (a.status === 'Completed') throw badRequest('Completed appointments cannot be changed');

  if (adminBypass || actor.role === 'admin') return;

  if (actor.role === 'patient') {
    if (!actor._id.equals(refId(a.patientId))) {
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
    const doctorProfile = await Doctor.findOne({ userId: actor._id });
    if (!doctorProfile || !doctorProfile._id.equals(refId(a.doctorId))) {
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
  const a = await Appointment.findById(req.params.id);
  if (!a) throw notFound('Appointment not found');

  const admin = req.user.role === 'admin';
  await canMutate(a, req.user, { adminBypass: admin });

  const { date, time } = req.body;
  const { doctor, endTime } = await loadBookingContext({ doctorId: String(a.doctorId), date, time });

  const slotDate = new Date(`${date}T${time}:00`);
  if (slotDate.getTime() <= Date.now()) throw badRequest('Cannot reschedule to a past slot');

  // Prevent the free/busy race for the *new* slot (the old slot is excluded).
  await assertSlotFree({ doctorId: a.doctorId, date, startTime: time, excludeId: a._id });

  a.date = date;
  a.startTime = time;
  a.endTime = endTime;
  a.dateTime = slotDate;
  a.status = 'Pending';
  await a.save();

  const full = await Appointment.findById(a._id).populate(POPULATE_DOCTOR).populate(POPULATE_PATIENT);
  const serialized = serialize(full);

  // The old slot is released and the new one consumed.
  await cache.delPrefix(`slots:${a.doctorId}`);
  realtime.slotsChanged(a.doctorId);
  realtime.emitAppointment('appointment:updated', a);
  mailer.sendRescheduled({
    patientName: serialized.patientName,
    patientEmail: full.patientId ? full.patientId.email : '',
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
  const a = await Appointment.findById(req.params.id);
  if (!a) throw notFound('Appointment not found');

  const admin = req.user.role === 'admin';
  await canMutate(a, req.user, { adminBypass: admin, allowDoctor: true });

  a.status = 'Cancelled';
  a.cancelledBy = req.user.role;
  await a.save();

  const full = await Appointment.findById(a._id).populate(POPULATE_DOCTOR).populate(POPULATE_PATIENT);
  const serialized = serialize(full);

  // Cancelling returns the slot to the available pool.
  await cache.delPrefix(`slots:${a.doctorId}`);
  realtime.slotsChanged(a.doctorId);
  realtime.emitAppointment('appointment:updated', a);
  mailer.sendCancelled({
    patientName: serialized.patientName,
    patientEmail: full.patientId ? full.patientId.email : '',
    doctorName: serialized.doctorName,
    date: a.date,
    time: a.startTime,
  });

  res.json({ message: 'Appointment cancelled. The slot has been released.', data: serialized });
});

/**
 * Consultation record fields (Module 4), mapped from request body keys to
 * document paths. `notes` stays the public name for backwards compatibility.
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
  const a = await Appointment.findById(req.params.id);
  if (!a) throw notFound('Appointment not found');

  const doctorProfile = await Doctor.findOne({ userId: req.user._id });
  const isTheirDoctor =
    req.user.role === 'doctor' && doctorProfile && doctorProfile._id.equals(refId(a.doctorId));
  const isAdmin = req.user.role === 'admin';
  if (!isTheirDoctor && !isAdmin) throw forbidden('Only the assigned doctor or an admin can update status');

  const { status } = req.body;
  if (!Appointment.canTransition(a.status, status)) {
    throw badRequest(`Invalid status transition: ${a.status} -> ${status || '(none)'}`);
  }

  a.status = status;
  if (status === 'Completed') {
    const patch = consultationPatch(req.body);
    if (patch) {
      Object.assign(a, patch);
      a.notesLastEditedAt = new Date();
    }
  }
  await a.save();

  const full = await Appointment.findById(a._id).populate(POPULATE_DOCTOR).populate(POPULATE_PATIENT);
  const serialized = serialize(full);

  // Status transitions can consume/release slots (Confirmed <-> Cancelled).
  await cache.delPrefix(`slots:${a.doctorId}`);
  realtime.slotsChanged(a.doctorId);
  realtime.emitAppointment('appointment:status', a);
  mailer.sendStatusChanged({
    patientName: serialized.patientName,
    patientEmail: full.patientId ? full.patientId.email : '',
    doctorName: serialized.doctorName,
    date: a.date,
    time: a.startTime,
    status: a.status,
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
  const a = await Appointment.findById(req.params.id);
  if (!a) throw notFound('Appointment not found');

  const doctorProfile = await Doctor.findOne({ userId: req.user._id });
  const isTheirDoctor =
    req.user.role === 'doctor' && doctorProfile && doctorProfile._id.equals(refId(a.doctorId));
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

  Object.assign(a, patch);
  if (!a.consultationNotes && !a.diagnosis && !a.prescription) {
    throw badRequest('The consultation record cannot be left completely empty');
  }
  a.notesLastEditedAt = new Date();
  await a.save();

  const full = await Appointment.findById(a._id).populate(POPULATE_DOCTOR).populate(POPULATE_PATIENT);
  const serialized = serialize(full);

  // Consultation records don't touch slot availability, but the patient and
  // the admin view should refresh (realtime trigger only, no cache flush).
  realtime.emitAppointment('appointment:notes', a);
  mailer.sendNotesReady({
    patientName: serialized.patientName,
    patientEmail: full.patientId ? full.patientId.email : '',
    doctorName: serialized.doctorName,
    date: a.date,
  });

  res.json({ data: serialized });
});

/**
 * DELETE /api/appointments/:id  (admin only)
 * Module 4 "Delete": purge an inaccurate or duplicate medical record. The
 * document is removed permanently, so a live (Pending/Confirmed) booking also
 * releases its reserved slot back into the available pool.
 */
const purgeAppointment = asyncHandler(async (req, res) => {
  const a = await Appointment.findById(req.params.id)
    .populate(POPULATE_DOCTOR)
    .populate(POPULATE_PATIENT);
  if (!a) throw notFound('Appointment not found');

  const snapshot = serialize(a);
  await Appointment.deleteOne({ _id: a._id });

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
