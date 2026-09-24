/**
 * Appointment lifecycle domain rules (pure — no database imports, so the
 * unit tests stay offline). Mirrors the Postgres `ApptStatus` enum.
 */

const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

/**
 * Allowed status transitions (edge TC-04: Cancelled -> Completed is invalid).
 */
const TRANSITIONS = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

function canTransition(from, to) {
  if (!from || !to || from === to) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

module.exports = { STATUSES, TRANSITIONS, canTransition };
