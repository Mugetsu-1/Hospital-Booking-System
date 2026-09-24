const test = require('node:test');
const assert = require('node:assert/strict');

const { STATUSES, TRANSITIONS, canTransition } = require('../src/domain/appointment');

test('the status vocabulary matches the SRS lifecycle', () => {
  assert.deepEqual(STATUSES, ['Pending', 'Confirmed', 'Completed', 'Cancelled']);
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), [...STATUSES].sort());
});

test('a pending appointment can be confirmed or cancelled', () => {
  assert.equal(canTransition('Pending', 'Confirmed'), true);
  assert.equal(canTransition('Pending', 'Cancelled'), true);
  // A visit cannot be completed before it is confirmed.
  assert.equal(canTransition('Pending', 'Completed'), false);
});

test('a confirmed appointment can be completed or cancelled', () => {
  assert.equal(canTransition('Confirmed', 'Completed'), true);
  assert.equal(canTransition('Confirmed', 'Cancelled'), true);
  assert.equal(canTransition('Confirmed', 'Pending'), false);
});

test('TC-04: a cancelled appointment can never be completed or revived', () => {
  assert.equal(canTransition('Cancelled', 'Completed'), false);
  assert.equal(canTransition('Cancelled', 'Confirmed'), false);
  assert.equal(canTransition('Cancelled', 'Pending'), false);
});

test('Completed and Cancelled are terminal states', () => {
  for (const to of STATUSES) {
    assert.equal(canTransition('Completed', to), false);
    assert.equal(canTransition('Cancelled', to), false);
  }
});

test('a no-op transition is rejected so the audit trail stays meaningful', () => {
  for (const s of STATUSES) {
    assert.equal(canTransition(s, s), false);
  }
});

test('unknown or missing states are rejected instead of throwing', () => {
  assert.equal(canTransition('', 'Confirmed'), false);
  assert.equal(canTransition(undefined, 'Confirmed'), false);
  assert.equal(canTransition('Pending', undefined), false);
  assert.equal(canTransition('Archived', 'Confirmed'), false);
  assert.equal(canTransition('Pending', 'Archived'), false);
});
