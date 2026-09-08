const mongoose = require('mongoose');

const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

const appointmentSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },

    // Slot expressed as a calendar date + wall-clock times plus a Date for
    // chronological ordering and policy checks (timezone kept consistent by
    // treating dates as local server time).
    date: { type: String, required: true }, // "YYYY-MM-DD"
    startTime: { type: String, required: true }, // "HH:MM"
    endTime: { type: String, required: true }, // "HH:MM"
    dateTime: { type: Date, required: true },

    status: { type: String, enum: STATUSES, default: 'Pending', index: true },
    symptoms: { type: String, trim: true, default: '' },

    // Consultation record (Module 4). Kept as three fields so a diagnosis and
    // a prescription can be read independently of the free-text notes.
    consultationNotes: { type: String, trim: true, default: '' },
    diagnosis: { type: String, trim: true, default: '' },
    prescription: { type: String, trim: true, default: '' },
    notesLastEditedAt: { type: Date },

    cancelledBy: {
      type: String,
      enum: ['', 'patient', 'doctor', 'admin'],
      default: '',
    },
  },
  { timestamps: true }
);

// ============================================================
// Concurrency control: an appointment "holds" a (doctor, date, slot).
// The partial unique index means two *live* appointments (Pending /
// Confirmed) can never share the same doctor/slot. As soon as an
// appointment is Cancelled it drops out of the index and the slot is
// released back into the available pool.
// ============================================================
appointmentSchema.index(
  { doctorId: 1, date: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['Pending', 'Confirmed'] } } }
);

/**
 * Allowed status transitions (edge TC-04: Cancelled -> Completed is invalid).
 */
const TRANSITIONS = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

appointmentSchema.statics.canTransition = function (from, to) {
  if (!from || !to || from === to) return false;
  return (TRANSITIONS[from] || []).includes(to);
};

appointmentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Appointment', appointmentSchema);
module.exports.STATUSES = STATUSES;
module.exports.TRANSITIONS = TRANSITIONS;
