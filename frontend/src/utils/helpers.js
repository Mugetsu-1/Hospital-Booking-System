export function toDateInput(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${day}`;
}

export function todayStr() {
  return toDateInput(new Date());
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateInput(new Date(y, m - 1, d + n));
}

export function fromDateString(dateStr) {
  const [y, m, d] = (dateStr || '').split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * API references arrive either as a bare id or as a populated sub-document,
 * depending on the endpoint. Always resolve them to an id string before
 * putting the value in a URL or comparing it.
 */
export function idOf(value) {
  if (!value) return '';
  return String(typeof value === 'object' ? value._id || '' : value);
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  return fromDateString(dateStr).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  return dt.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Monday-anchored week containing dateStr, as an inclusive { from, to } pair.
 */
export function weekRange(dateStr) {
  const offset = (fromDateString(dateStr).getDay() + 6) % 7; // Monday = 0
  const from = addDays(dateStr, -offset);
  return { from, to: addDays(from, 6) };
}

/**
 * Calendar month containing dateStr, as an inclusive { from, to } pair.
 */
export function monthRange(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

/** Shift dateStr by n whole months, clamping to the length of the target month. */
export function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toDateInput(new Date(target.getFullYear(), target.getMonth(), Math.min(d, lastDay)));
}

export function dayFromDate(dateStr) {
  if (!dateStr) return '';
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return days[fromDateString(dateStr).getDay()];
}

export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
}

export function fmtMoney(n) {
  const v = Number(n || 0);
  return `Rs. ${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function to12h(t) {
  return fmtTime(t);
}

const STATUS_TONES = {
  Pending: 'warn',
  Confirmed: 'info',
  Completed: 'ok',
  Cancelled: 'muted',
};

export function statusTone(status) {
  return STATUS_TONES[status] || 'muted';
}
