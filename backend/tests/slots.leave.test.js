const test = require('node:test');
const assert = require('node:assert/strict');

const { slotsForDate } = require('../src/utils/slots');

const starts = (rows) => rows.map((r) => r.startTime);

test('weekday helper stays consistent with the environment calendar', () => {
  const { weekdayOf } = require('../src/utils/slots');
  assert.equal(weekdayOf('2026-09-05'), 'Saturday');
  assert.equal(weekdayOf('2026-09-06'), 'Sunday');
});

test('weekly grid expansion ignores the leave flag (enforced at controller level)', () => {
  // Pure slot math must not silently hide a doctor's schedule just because the
  // account-level availability flag is off; the controllers decide availability.
  const doctor = {
    isAvailable: false,
    availableSlots: [{ day: 'Monday', startTime: '09:00', endTime: '11:00', slotDurationMins: 30 }],
  };
  const grid = slotsForDate(doctor, '2026-09-07'); // Monday
  assert.deepEqual(starts(grid), ['09:00', '09:30', '10:00', '10:30']);
});
