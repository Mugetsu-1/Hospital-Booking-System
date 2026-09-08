const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toMinutes,
  toHM,
  weekdayOf,
  isRealDate,
  expandBlock,
  slotsForDate,
  availableSlots,
  isEligibleStart,
  endForStart,
} = require('../src/utils/slots');

const starts = (rows) => rows.map((r) => r.startTime);

test('toMinutes / toHM round trip', () => {
  assert.equal(toMinutes('09:30'), 570);
  assert.equal(toMinutes('00:00'), 0);
  assert.equal(toMinutes('23:59'), 1439);
  assert.equal(toHM(570), '09:30');
  assert.equal(toHM(0), '00:00');
  assert.equal(toHM(1439), '23:59');
});

test('weekdayOf parses YYYY-MM-DD in UTC', () => {
  assert.equal(weekdayOf('2026-09-07'), 'Monday'); // chosen known date
  assert.equal(weekdayOf('2026-09-13'), 'Sunday');
  assert.equal(weekdayOf('2026-09-05'), 'Saturday'); // "today" from environment
});

test('isRealDate accepts only days that exist on the calendar', () => {
  assert.equal(isRealDate('2026-09-07'), true);
  assert.equal(isRealDate('2024-02-29'), true); // leap year
  assert.equal(isRealDate('2026-02-29'), false); // not a leap year
  assert.equal(isRealDate('2026-02-30'), false);
  assert.equal(isRealDate('2026-13-40'), false); // shape is valid, the day is not
  assert.equal(isRealDate('2026-04-31'), false);
  assert.equal(isRealDate('2026-9-7'), false); // must be zero padded
  assert.equal(isRealDate('07/09/2026'), false);
  assert.equal(isRealDate(''), false);
  assert.equal(isRealDate(undefined), false);
});

test('expandBlock emits whole slot starts that fit inside the block', () => {
  // 10:00 - 11:00 in 15m -> 10:00,10:15,10:30,10:45 (11:00 is end, not a start)
  const slots = expandBlock({ startTime: '10:00', endTime: '11:00', slotDurationMins: 15 });
  assert.deepEqual(starts(slots), ['10:00', '10:15', '10:30', '10:45']);
  assert.equal(slots[0].endTime, '10:15'); // each slot carries an end
});

test('expandBlock drops trailing ragged slot', () => {
  // 10:00 - 11:05 in 30m -> only 10:00,10:30 (10:30+30=11:00 ok; nothing at 11:00+)
  const slots = expandBlock({ startTime: '10:00', endTime: '11:05', slotDurationMins: 30 });
  assert.deepEqual(starts(slots), ['10:00', '10:30']);
});

test('expandBlock allows durations that divide the hour unevenly', () => {
  const slots = expandBlock({ startTime: '09:00', endTime: '10:00', slotDurationMins: 20 });
  assert.deepEqual(starts(slots), ['09:00', '09:20', '09:40']);
});

test('slotsForDate returns [] when the day is not scheduled', () => {
  const doctor = {
    availableSlots: [{ day: 'Monday', startTime: '09:00', endTime: '13:00', slotDurationMins: 30 }],
  };
  assert.deepEqual(slotsForDate(doctor, '2026-09-05'), []); // Saturday
});

test('slotsForDate expands matching blocks for the date weekday', () => {
  const doctor = {
    availableSlots: [
      { day: 'Monday', startTime: '09:00', endTime: '10:00', slotDurationMins: 30 },
      { day: 'Monday', startTime: '14:00', endTime: '15:00', slotDurationMins: 30 },
    ],
  };
  const out = slotsForDate(doctor, '2026-09-07'); // Monday
  assert.deepEqual(starts(out), ['09:00', '09:30', '14:00', '14:30']);
});

test('availableSlots excludes booked starts', () => {
  const doctor = {
    isAvailable: true,
    availableSlots: [{ day: 'Monday', startTime: '09:00', endTime: '11:00', slotDurationMins: 30 }],
  };
  const free = availableSlots({
    doctor,
    dateStr: '2026-09-07',
    bookedTimes: ['09:30', '10:00'],
    dropPast: false,
  });
  assert.deepEqual(starts(free), ['09:00', '10:30']);
});

test('availableSlots drops past start times when dropPast=true', () => {
  const doctor = {
    isAvailable: true,
    availableSlots: [{ day: 'Friday', startTime: '09:00', endTime: '13:00', slotDurationMins: 30 }],
  };
  // Friday 2026-09-04 10:15 as "now" -> earlier starts must vanish.
  const free = availableSlots({
    doctor,
    dateStr: '2026-09-04',
    bookedTimes: [],
    dropPast: true,
    nowOverride: new Date('2026-09-04T10:15:00'),
  });
  assert.ok(starts(free).length > 0);
  assert.ok(starts(free).every((t) => toMinutes(t) > toMinutes('10:15')));
});

test('isEligibleStart accepts a generated start and rejects an off-grid time', () => {
  const doctor = {
    availableSlots: [{ day: 'Monday', startTime: '09:00', endTime: '11:00', slotDurationMins: 30 }],
  };
  assert.equal(isEligibleStart(doctor, '2026-09-07', '10:30'), true);
  assert.equal(isEligibleStart(doctor, '2026-09-07', '10:45'), false); // off grid
  assert.equal(isEligibleStart(doctor, '2026-09-05', '09:00'), false); // wrong weekday
  assert.equal(isEligibleStart(doctor, '2026-09-07', '11:00'), false); // block end, not a start
});

test('endForStart returns the next grid point within the block', () => {
  const doctor = {
    availableSlots: [{ day: 'Monday', startTime: '09:00', endTime: '11:00', slotDurationMins: 30 }],
  };
  assert.equal(endForStart(doctor, '2026-09-07', '10:30'), '11:00');
});
