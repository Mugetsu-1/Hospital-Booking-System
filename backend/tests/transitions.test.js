const test = require('node:test');
const assert = require('node:assert/strict');

const Appointment = require('../src/models/Appointment');
const { STATUSES, TRANSITIONS } = Appointment;

test('the status vocabulary matches the SRS lifecycle', () => {
  assert.deepEqual(STATUSES, ['Pending', 'Confirmed', 'Completed', 'Cancelled']);
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), [...STATUSES].sort());
});

test('a pending appointment can be confirmed or cancelled', () => {
  assert.equal(Appointment.canTransition('Pending', 'Confirmed'), true);
  assert.equal(Appointment.canTransition('Pending', 'Cancelled'), true);
  // A visit cannot be completed before it is confirmed.
  assert.equal(Appointment.canTransition('Pending', 'Completed'), false);
});

test('a confirmed appointment can be completed or cancelled', () => {
  assert.equal(Appointment.canTransition('Confirmed', 'Completed'), true);
  assert.equal(Appointment.canTransition('Confirmed', 'Cancelled'), true);
  assert.equal(Appointment.canTransition('Confirmed', 'Pending'), false);
});

test('TC-04: a cancelled appointment can never be completed or revived', () => {
  assert.equal(Appointment.canTransition('Cancelled', 'Completed'), false);
  assert.equal(Appointment.canTransition('Cancelled', 'Confirmed'), false);
  assert.equal(Appointment.canTransition('Cancelled', 'Pending'), false);
});

test('Completed and Cancelled are terminal states', () => {
  for (const to of STATUSES) {
    assert.equal(Appointment.canTransition('Completed', to), false);
    assert.equal(Appointment.canTransition('Cancelled', to), false);
  }
});

test('a no-op transition is rejected so the audit trail stays meaningful', () => {
  for (const s of STATUSES) {
    assert.equal(Appointment.canTransition(s, s), false);
  }
});

test('unknown or missing states are rejected instead of throwing', () => {
  assert.equal(Appointment.canTransition('', 'Confirmed'), false);
  assert.equal(Appointment.canTransition(undefined, 'Confirmed'), false);
  assert.equal(Appointment.canTransition('Pending', undefined), false);
  assert.equal(Appointment.canTransition('Archived', 'Confirmed'), false);
  assert.equal(Appointment.canTransition('Pending', 'Archived'), false);
});
