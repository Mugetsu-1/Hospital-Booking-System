/**
 * Pure time-slot helpers (kept free of Mongo so they can be unit tested).
 * All wall-clock times are "HH:MM" 24-hour strings.
 */

const WEEKDAY_ORDER = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a "YYYY-MM-DD" string that names a day that actually exists.
 * The shape check alone is not enough: `weekdayOf('2026-13-40')` silently
 * rolls over into a real (but completely different) date, so a purely
 * pattern-based guard would let impossible dates reach the slot grid.
 */
function isRealDate(dateStr) {
  if (!DATE_RE.test(dateStr || '')) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/** "09:30" -> 570 (minutes since midnight). */
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 570 -> "09:30". */
function toHM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * "YYYY-MM-DD" -> weekday name. Parsed in UTC so the result never shifts
 * with the server timezone.
 */
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAY_ORDER[day];
}

/**
 * Expand one working block into slot start/end pairs.
 * e.g. 09:00-12:00 @ 30m -> 09:00..11:30 (final slot must finish <= end).
 */
function expandBlock({ startTime, endTime, slotDurationMins }) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const step = slotDurationMins;
  const slots = [];
  for (let t = start; t + step <= end; t += step) {
    slots.push({ startTime: toHM(t), endTime: toHM(t + step) });
  }
  return slots;
}

/**
 * All raw slot pairs the doctor offers on a given date, or [] if the date
 * falls outside their weekly schedule.
 */
function slotsForDate(doctor, dateStr) {
  const weekday = weekdayOf(dateStr);
  const blocks = (doctor.availableSlots || []).filter((b) => b.day === weekday);
  return blocks.flatMap(expandBlock);
}

/**
 * Available slots for a doctor/date after removing:
 *  - slots already held by live (Pending/Confirmed) appointments
 *  - (optionally) start times that have already passed for today
 */
function availableSlots({ doctor, dateStr, bookedTimes = [], dropPast = true, nowOverride }) {
  const today = nowOverride ? new Date(nowOverride) : new Date();
  const slots = slotsForDate(doctor, dateStr);
  return slots.filter((s) => {
    if (bookedTimes.includes(s.startTime)) return false;
    if (dropPast) {
      const slotDateTime = new Date(`${dateStr}T${s.startTime}:00`);
      if (slotDateTime.getTime() < today.getTime()) return false;
    }
    return true;
  });
}

/**
 * True when `startTime` is an exact start of one of the doctor's generated
 * slots for `dateStr`. Used to reject free-text times that don't align with
 * the configured grid (black-box / boundary validation).
 */
function isEligibleStart(doctor, dateStr, startTime) {
  return slotsForDate(doctor, dateStr).some((s) => s.startTime === startTime);
}

/**
 * Given an eligible start time, return the matching end time or null.
 */
function endForStart(doctor, dateStr, startTime) {
  const slot = slotsForDate(doctor, dateStr).find((s) => s.startTime === startTime);
  return slot ? slot.endTime : null;
}

module.exports = {
  WEEKDAY_ORDER,
  DATE_RE,
  isRealDate,
  toMinutes,
  toHM,
  weekdayOf,
  expandBlock,
  slotsForDate,
  availableSlots,
  isEligibleStart,
  endForStart,
};
