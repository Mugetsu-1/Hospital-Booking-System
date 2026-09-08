const mongoose = require('mongoose');

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const slotSchema = new mongoose.Schema(
  {
    day: { type: String, enum: DAYS, required: true },
    startTime: { type: String, required: true, match: TIME_RE }, // "09:00"
    endTime: { type: String, required: true, match: TIME_RE }, // "12:00"
    slotDurationMins: { type: Number, required: true, min: 5, max: 240 },
  },
  { _id: false }
);

/**
 * One Doctors document per medical practitioner. The user's credentials and
 * name live in the Users collection (role = 'doctor'); this document holds
 * the schedule and professional directory data.
 */
const doctorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    specialization: { type: String, required: true, trim: true },
    qualification: { type: String, trim: true, default: '' },
    consultationFee: { type: Number, required: true, min: 0 },
    availableSlots: { type: [slotSchema], default: [] },
    // "Away / on leave" toggle controlled by the doctor.
    isAvailable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { transform(_doc, ret) { delete ret.__v; return ret; } },
  }
);

module.exports = mongoose.model('Doctor', doctorSchema);
module.exports.DAYS = DAYS;
module.exports.TIME_RE = TIME_RE;
