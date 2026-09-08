/**
 * End-to-end API verification suite (report §7.7).
 *
 * Unlike the unit tests under tests/, this suite is NOT offline: it drives the
 * real HTTP API and also opens a direct Mongo connection so it can "time travel"
 * a document backwards to exercise the 2-hour cancellation cutoff and the
 * 24-hour notes window without waiting for real time to pass.
 *
 * Prerequisites — MongoDB running, `npm run seed`, and the API started
 * (`npm run dev` or `npm start`). Then:
 *
 *     npm run test:e2e
 *
 * It creates its own patients/doctors, cleans up the accounts it deactivates,
 * and exits non-zero if any assertion fails. Re-run `npm run seed` afterwards
 * to restore the pristine demo data.
 */
const mongoose = require('mongoose');
const config = require('../../src/config');

const BASE = `http://127.0.0.1:${config.port}/api`;

let pass = 0;
let fail = 0;
const failures = [];

function check(id, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${id}${detail ? ' — ' + detail : ''}`);
  } else {
    fail += 1;
    failures.push(`${id}: ${detail}`);
    console.log(`  FAIL  ${id} — ${detail}`);
  }
}

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function login(email, password) {
  const r = await req('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.json)}`);
  return { token: r.json.token, user: r.json.user };
}

function iso(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function shift(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

(async () => {
  console.log('\n=== A. Authentication and session (SEC-01..SEC-05, TC-01..TC-03) ===');

  const health = await req('GET', '/health');
  check('HEALTH', health.status === 200 && health.json.status === 'ok', `status ${health.status}`);

  const noToken = await req('GET', '/auth/me');
  check(
    'SEC-01 no token rejected',
    noToken.status === 401 && noToken.json.error === 'Authentication token is required',
    `${noToken.status} ${noToken.json && noToken.json.error}`
  );

  const badToken = await req('GET', '/auth/me', { token: 'not.a.real.token' });
  check(
    'SEC-02 forged token rejected',
    badToken.status === 401 && badToken.json.error === 'Invalid or expired token',
    `${badToken.status} ${badToken.json && badToken.json.error}`
  );

  const admin = await login('admin@hospital.com', 'Admin@123');
  const doctor = await login('mehta@hospital.com', 'Doctor@123');
  const otherDoctor = await login('sharma@hospital.com', 'Doctor@123');
  const alice = await login('alice@example.com', 'Patient@123');
  const bob = await login('bob@example.com', 'Patient@123');
  check('TC-01 seeded logins issue tokens', Boolean(admin.token && doctor.token && alice.token), 'admin/doctor/patient');

  const wrongPw = await req('POST', '/auth/login', { body: { email: 'alice@example.com', password: 'wrong' } });
  check('TC-02 wrong password rejected', wrongPw.status === 401, `status ${wrongPw.status}`);

  const me = await req('GET', '/auth/me', { token: alice.token });
  check('TC-03 session rehydrates', me.status === 200 && me.json.user.email === 'alice@example.com', `status ${me.status}`);

  const hashLeak = JSON.stringify(me.json).includes('passwordHash');
  check('SEC-03 password hash never serialised', hashLeak === false, hashLeak ? 'passwordHash present!' : 'absent');

  console.log('\n=== B. Role-based access control (SEC-06..SEC-10) ===');

  const patientHitsAdmin = await req('GET', '/patients', { token: alice.token });
  check(
    'SEC-06 patient blocked from patient directory',
    patientHitsAdmin.status === 403 && /Access restricted to/.test(patientHitsAdmin.json.error),
    `${patientHitsAdmin.status} ${patientHitsAdmin.json && patientHitsAdmin.json.error}`
  );

  const patientHitsLedger = await req('GET', '/appointments', { token: alice.token });
  check('SEC-07 patient blocked from global ledger', patientHitsLedger.status === 403, `status ${patientHitsLedger.status}`);

  const doctorCreatesDoctor = await req('POST', '/doctors', { token: doctor.token, body: { name: 'x' } });
  check('SEC-08 doctor cannot create doctors', doctorCreatesDoctor.status === 403, `status ${doctorCreatesDoctor.status}`);

  const patientPurge = await req('DELETE', '/appointments/000000000000000000000000', { token: alice.token });
  check('SEC-09 patient cannot purge records', patientPurge.status === 403, `status ${patientPurge.status}`);

  console.log('\n=== C. Doctor directory and computed slots (TC-05..TC-08) ===');

  const dirRes = await req('GET', '/doctors', { token: alice.token });
  const dirAdmin = await req('GET', '/doctors?includeInactive=true', { token: admin.token });
  const publicNames = (dirRes.json.data || []).map((d) => d.doctorName).join(', ');
  // The seed marks Dr. Sneha Iyer as on leave (isAvailable=false), so the
  // public directory must expose exactly one fewer doctor than the admin view.
  const baselineDirCount = dirRes.json.count;
  check(
    'TC-05 directory lists bookable doctors and hides those on leave',
    dirRes.status === 200 &&
      dirAdmin.json.count === 4 &&
      baselineDirCount === 3 &&
      !/Iyer/i.test(publicNames),
    `public ${baselineDirCount} (${publicNames}) / admin ${dirAdmin.json && dirAdmin.json.count}`
  );

  const bySpec = await req('GET', '/doctors?specialization=Cardiologist', { token: alice.token });
  check(
    'TC-06 specialization filter',
    bySpec.status === 200 && bySpec.json.data.every((d) => d.specialization === 'Cardiologist') && bySpec.json.count >= 1,
    `count ${bySpec.json && bySpec.json.count}`
  );

  const byQuery = await req('GET', '/doctors?q=mehta', { token: alice.token });
  check('TC-07 name search', byQuery.status === 200 && byQuery.json.count >= 1, `count ${byQuery.json && byQuery.json.count}`);

  const byFee = await req('GET', '/doctors?maxFee=700', { token: alice.token });
  check(
    'TC-07b fee ceiling filter',
    byFee.status === 200 && byFee.json.data.every((d) => d.consultationFee <= 700),
    `count ${byFee.json && byFee.json.count}`
  );

  const target = dirRes.json.data.find((d) => /Mehta/i.test(d.doctorName)) || dirRes.json.data[0];
  const doctorDoc = await req('GET', `/doctors/${target._id}`, { token: alice.token });
  check('TC-08 single doctor profile', doctorDoc.status === 200 && doctorDoc.json.data._id === target._id, `status ${doctorDoc.status}`);

  // Find a future date with at least three free slots for this doctor.
  let slotDate = null;
  let slots = [];
  for (let i = 1; i <= 21 && slots.length < 3; i += 1) {
    const candidate = shift(i);
    const r = await req('GET', `/doctors/${target._id}/slots?date=${candidate}`, { token: alice.token });
    if (r.status === 200 && (r.json.slots || []).length >= 3) {
      slotDate = candidate;
      slots = r.json.slots;
    }
  }
  check('TC-08b slot grid computed from weekly blocks', Boolean(slotDate), slotDate ? `${slotDate} → ${slots.length} slots` : 'no date found');
  if (!slotDate) throw new Error('cannot continue without a bookable date');

  const badDateParam = await req('GET', `/doctors/${target._id}/slots?date=2026-13-40`, { token: alice.token });
  check(
    'BV-01 impossible calendar date rejected',
    badDateParam.status === 400,
    `${badDateParam.status} ${badDateParam.json && (badDateParam.json.error || JSON.stringify(badDateParam.json).slice(0, 60))}`
  );

  console.log('\n=== D. Booking, validation and concurrency (TC-10..TC-14, BV) ===');

  const booked = await req('POST', '/appointments', {
    token: alice.token,
    body: { doctorId: target._id, date: slotDate, time: slots[0].startTime, symptoms: 'Chest tightness after exercise' },
  });
  check('TC-10 patient books a free slot', booked.status === 201 && booked.json.data.status === 'Pending', `status ${booked.status}`);
  const apptId = booked.json.data && booked.json.data._id;

  const slotsAfter = await req('GET', `/doctors/${target._id}/slots?date=${slotDate}`, { token: alice.token });
  check(
    'TC-11 booked slot disappears from availability',
    slotsAfter.json.slots.every((s) => s.startTime !== slots[0].startTime) &&
      slotsAfter.json.bookedTimes.includes(slots[0].startTime),
    `remaining ${slotsAfter.json.slots.length}`
  );

  const dupe = await req('POST', '/appointments', {
    token: bob.token,
    body: { doctorId: target._id, date: slotDate, time: slots[0].startTime },
  });
  check('TC-12 second patient cannot take a held slot', dupe.status === 409, `status ${dupe.status} ${dupe.json && dupe.json.error}`);

  // True race: two patients fire at the same instant for one slot.
  const raceTime = slots[1].startTime;
  const [raceA, raceB] = await Promise.all([
    req('POST', '/appointments', { token: alice.token, body: { doctorId: target._id, date: slotDate, time: raceTime } }),
    req('POST', '/appointments', { token: bob.token, body: { doctorId: target._id, date: slotDate, time: raceTime } }),
  ]);
  const codes = [raceA.status, raceB.status].sort();
  check(
    'TC-13 simultaneous booking race resolves to one winner',
    codes[0] === 201 && codes[1] === 409,
    `statuses ${codes.join(' / ')}`
  );
  const raceWinnerId = (raceA.status === 201 ? raceA : raceB).json.data._id;

  const invalidDoctor = await req('POST', '/appointments', {
    token: alice.token,
    body: { doctorId: 'not-an-objectid', date: slotDate, time: slots[2].startTime },
  });
  check(
    'BV-02 invalid doctorId rejected',
    invalidDoctor.status === 400 && invalidDoctor.json.error === 'Invalid doctorId',
    `${invalidDoctor.status} ${invalidDoctor.json && invalidDoctor.json.error}`
  );

  const impossibleBooking = await req('POST', '/appointments', {
    token: alice.token,
    body: { doctorId: target._id, date: '2026-02-30', time: slots[2].startTime },
  });
  check(
    'BV-02b impossible calendar day rejected at booking',
    impossibleBooking.status === 400 && impossibleBooking.json.error === 'date is not a real calendar day',
    `${impossibleBooking.status} ${impossibleBooking.json && impossibleBooking.json.error}`
  );

  const offGrid = await req('POST', '/appointments', {
    token: alice.token,
    body: { doctorId: target._id, date: slotDate, time: '09:07' },
  });
  check('BV-03 off-grid start time rejected', offGrid.status === 400, `${offGrid.status} ${offGrid.json && offGrid.json.error}`);

  const badTimeFormat = await req('POST', '/appointments', {
    token: alice.token,
    body: { doctorId: target._id, date: slotDate, time: '25:00' },
  });
  check('BV-04 out-of-range time rejected', badTimeFormat.status === 400, `${badTimeFormat.status} ${badTimeFormat.json && badTimeFormat.json.error}`);

  // Past-date booking: walk back to a weekday the doctor actually works and
  // use that weekday's own block start, which is always an eligible grid time.
  const blocks = doctorDoc.json.data.availableSlots || [];
  const workingDays = new Set(blocks.map((b) => b.day));
  let pastDate = null;
  for (let i = 1; i <= 14 && !pastDate; i += 1) {
    const candidate = shift(-i);
    if (workingDays.has(weekdayOf(candidate))) pastDate = candidate;
  }
  const pastBlock = blocks.find((b) => b.day === weekdayOf(pastDate));
  const pastBooking = await req('POST', '/appointments', {
    token: alice.token,
    body: { doctorId: target._id, date: pastDate, time: pastBlock.startTime },
  });
  check(
    'TC-14 past slot rejected',
    pastBooking.status === 400 && pastBooking.json.error === 'Cannot book a slot in the past',
    `${pastDate} ${pastBlock.startTime} → ${pastBooking.status} ${pastBooking.json && pastBooking.json.error}`
  );

  console.log('\n=== E. Lifecycle, notes and the 24h window (TC-15..TC-20) ===');

  const foreignCancel = await req('POST', `/appointments/${apptId}/cancel`, { token: otherDoctor.token });
  check(
    'SEC-10 unrelated doctor cannot cancel another doctor\'s appointment',
    foreignCancel.status === 403,
    `${foreignCancel.status} ${foreignCancel.json && foreignCancel.json.error}`
  );

  const foreignRead = await req('GET', `/appointments/${apptId}`, { token: bob.token });
  check('SEC-11 other patient cannot read the record', foreignRead.status === 403, `status ${foreignRead.status}`);

  const patientMovesStatus = await req('PATCH', `/appointments/${apptId}/status`, { token: alice.token, body: { status: 'Confirmed' } });
  check(
    'SEC-15 patient cannot drive the lifecycle',
    patientMovesStatus.status === 403,
    `${patientMovesStatus.status} ${patientMovesStatus.json && patientMovesStatus.json.error}`
  );

  const doctorReschedules = await req('POST', `/appointments/${apptId}/reschedule`, {
    token: doctor.token,
    body: { date: slotDate, time: slots[2].startTime },
  });
  check(
    'SEC-16 doctor cannot reschedule on the patient\'s behalf',
    doctorReschedules.status === 403,
    `${doctorReschedules.status} ${doctorReschedules.json && doctorReschedules.json.error}`
  );

  const confirmed = await req('PATCH', `/appointments/${apptId}/status`, { token: doctor.token, body: { status: 'Confirmed' } });
  check('TC-15 doctor confirms', confirmed.status === 200 && confirmed.json.data.status === 'Confirmed', `status ${confirmed.status}`);

  const illegalJump = await req('PATCH', `/appointments/${apptId}/status`, { token: doctor.token, body: { status: 'Pending' } });
  check(
    'TC-16 backwards transition rejected',
    illegalJump.status === 400 && /Invalid status transition/.test(illegalJump.json.error),
    `${illegalJump.status} ${illegalJump.json && illegalJump.json.error}`
  );

  const completed = await req('PATCH', `/appointments/${apptId}/status`, {
    token: doctor.token,
    body: {
      status: 'Completed',
      diagnosis: 'Stable angina, mild',
      prescription: 'Aspirin 75 mg once daily for 30 days',
      notes: 'Advised ECG in two weeks and a low-sodium diet.',
    },
  });
  check(
    'TC-17 completing stores diagnosis, prescription and notes',
    completed.status === 200 &&
      completed.json.data.diagnosis === 'Stable angina, mild' &&
      completed.json.data.prescription.startsWith('Aspirin 75 mg') &&
      /low-sodium/.test(completed.json.data.consultationNotes),
    `status ${completed.status}`
  );

  const patientSees = await req('GET', `/appointments/${apptId}`, { token: alice.token });
  check(
    'TC-18 patient can read the consultation record',
    patientSees.status === 200 && patientSees.json.data.diagnosis === 'Stable angina, mild',
    `status ${patientSees.status}`
  );

  const editRecord = await req('PATCH', `/appointments/${apptId}/notes`, {
    token: doctor.token,
    body: { diagnosis: 'Stable angina, mild — reviewed' },
  });
  check(
    'TC-19 partial record edit inside the window',
    editRecord.status === 200 &&
      editRecord.json.data.diagnosis === 'Stable angina, mild — reviewed' &&
      editRecord.json.data.prescription.startsWith('Aspirin 75 mg'),
    `status ${editRecord.status} (other fields preserved)`
  );

  const emptyRecord = await req('PATCH', `/appointments/${apptId}/notes`, {
    token: doctor.token,
    body: { notes: '', diagnosis: '', prescription: '' },
  });
  check('BV-05 record cannot be blanked', emptyRecord.status === 400, `${emptyRecord.status} ${emptyRecord.json && emptyRecord.json.error}`);

  const noFields = await req('PATCH', `/appointments/${apptId}/notes`, { token: doctor.token, body: {} });
  check('BV-06 no record fields supplied is rejected', noFields.status === 400, `${noFields.status} ${noFields.json && noFields.json.error}`);

  const notesOnLive = await req('PATCH', `/appointments/${raceWinnerId}/notes`, {
    token: doctor.token,
    body: { notes: 'too early' },
  });
  check(
    'TC-20 notes rejected before completion',
    notesOnLive.status === 400 && /completed appointments/.test(notesOnLive.json.error),
    `${notesOnLive.status} ${notesOnLive.json && notesOnLive.json.error}`
  );

  console.log('\n=== F. Cancellation cutoff and the notes window (time travel via Mongo) ===');

  await mongoose.connect(config.mongoUri);
  const Appointment = require('../../src/models/Appointment');

  // A consultation that finished three days ago: outside the 24h notes window.
  const staleDate = shift(-3);
  const stale = await Appointment.create({
    patientId: alice.user._id,
    doctorId: target._id,
    date: staleDate,
    startTime: '09:00',
    endTime: '09:30',
    dateTime: new Date(`${staleDate}T09:00:00`),
    status: 'Completed',
    consultationNotes: 'Original note.',
  });

  const lateEdit = await req('PATCH', `/appointments/${stale._id}/notes`, {
    token: doctor.token,
    body: { notes: 'late edit attempt' },
  });
  check(
    'TC-21 doctor blocked outside the 24h notes window',
    lateEdit.status === 400 && /within 24 hours/.test(lateEdit.json.error),
    `${lateEdit.status} ${lateEdit.json && lateEdit.json.error}`
  );

  const adminLateEdit = await req('PATCH', `/appointments/${stale._id}/notes`, {
    token: admin.token,
    body: { notes: 'corrected by records office' },
  });
  check(
    'TC-21b admin bypasses the notes window',
    adminLateEdit.status === 200 && adminLateEdit.json.data.consultationNotes === 'corrected by records office',
    `status ${adminLateEdit.status}`
  );

  // A confirmed appointment starting in one hour: inside the 2h cancel cutoff.
  const soon = new Date(Date.now() + 60 * 60 * 1000);
  const soonDate = iso(soon);
  const soonTime = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;
  const imminent = await Appointment.create({
    patientId: alice.user._id,
    doctorId: target._id,
    date: soonDate,
    startTime: soonTime,
    endTime: soonTime,
    dateTime: soon,
    status: 'Confirmed',
  });

  const lateCancel = await req('POST', `/appointments/${imminent._id}/cancel`, { token: alice.token });
  check(
    'TC-22 patient blocked inside the 2h cancellation cutoff',
    lateCancel.status === 400 && /2 hours before start time/.test(lateCancel.json.error),
    `${lateCancel.status} ${lateCancel.json && lateCancel.json.error}`
  );

  const adminLateCancel = await req('POST', `/appointments/${imminent._id}/cancel`, { token: admin.token });
  check(
    'TC-22b admin bypasses the cancellation cutoff',
    adminLateCancel.status === 200 && adminLateCancel.json.data.status === 'Cancelled',
    `status ${adminLateCancel.status}`
  );

  console.log('\n=== G. Reschedule, slot release and ranged doctor views ===');

  const patientCancel = await req('POST', `/appointments/${raceWinnerId}/cancel`, {
    token: raceA.status === 201 ? alice.token : bob.token,
  });
  check('TC-23 patient cancels outside the cutoff', patientCancel.status === 200, `status ${patientCancel.status}`);

  const slotsReleased = await req('GET', `/doctors/${target._id}/slots?date=${slotDate}`, { token: alice.token });
  check(
    'TC-24 cancellation releases the slot',
    slotsReleased.json.slots.some((s) => s.startTime === raceTime),
    `${raceTime} back in the pool`
  );

  const fresh = await req('POST', '/appointments', {
    token: bob.token,
    body: { doctorId: target._id, date: slotDate, time: raceTime, symptoms: 'Follow-up' },
  });
  check('TC-25 released slot is re-bookable', fresh.status === 201, `status ${fresh.status}`);

  const moved = await req('POST', `/appointments/${fresh.json.data._id}/reschedule`, {
    token: bob.token,
    body: { date: slotDate, time: slots[2].startTime },
  });
  check(
    'TC-26 patient reschedules to a free slot',
    moved.status === 200 && moved.json.data.startTime === slots[2].startTime,
    `status ${moved.status}`
  );

  const dayView = await req('GET', `/appointments/doctor?date=${slotDate}`, { token: doctor.token });
  const weekStart = (() => {
    const [y, m, d] = slotDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return iso(dt);
  })();
  const weekEnd = (() => {
    const [y, m, d] = weekStart.split('-').map(Number);
    return iso(new Date(y, m - 1, d + 6));
  })();
  const weekView = await req('GET', `/appointments/doctor?from=${weekStart}&to=${weekEnd}`, { token: doctor.token });
  const monthPrefix = slotDate.slice(0, 7);
  const monthView = await req('GET', `/appointments/doctor?from=${monthPrefix}-01&to=${monthPrefix}-28`, { token: doctor.token });

  check('TC-27 doctor day view', dayView.status === 200, `count ${dayView.json && dayView.json.count}`);
  check(
    'TC-28 doctor week view covers the day view',
    weekView.status === 200 && weekView.json.count >= dayView.json.count,
    `week ${weekView.json && weekView.json.count} >= day ${dayView.json && dayView.json.count}`
  );
  check(
    'TC-29 doctor month view covers the week view',
    monthView.status === 200 && monthView.json.count >= 1,
    `month ${monthView.json && monthView.json.count}`
  );
  check(
    'TC-30 ranged view stays inside the window',
    (weekView.json.data || []).every((a) => a.date >= weekStart && a.date <= weekEnd),
    `${weekStart}..${weekEnd}`
  );

  const rangedStatus = await req('GET', `/appointments/doctor?from=${weekStart}&to=${weekEnd}&status=Completed`, {
    token: doctor.token,
  });
  check(
    'TC-31 range + status filter combine',
    rangedStatus.status === 200 && (rangedStatus.json.data || []).every((a) => a.status === 'Completed'),
    `count ${rangedStatus.json && rangedStatus.json.count}`
  );

  console.log('\n=== H. Admin record purge (TC-32) ===');

  const purge = await req('DELETE', `/appointments/${stale._id}`, { token: admin.token });
  check('TC-32 admin purges a record', purge.status === 200 && /purged/.test(purge.json.message), `status ${purge.status}`);

  const gone = await req('GET', `/appointments/${stale._id}`, { token: admin.token });
  check('TC-32b purged record is unreachable', gone.status === 404, `status ${gone.status}`);

  console.log('\n=== I. Patient and doctor profile updates ===');

  const profileUpdate = await req('PATCH', `/patients/${alice.user._id}`, {
    token: alice.token,
    body: { phone: '9800000001', address: 'Lakeside, Pokhara', emergencyContact: '9800000002' },
  });
  check(
    'TC-33 patient updates own profile',
    profileUpdate.status === 200 && profileUpdate.json.data.address === 'Lakeside, Pokhara',
    `status ${profileUpdate.status}`
  );

  const foreignProfile = await req('PATCH', `/patients/${bob.user._id}`, { token: alice.token, body: { phone: '000' } });
  check('SEC-12 patient cannot edit another profile', foreignProfile.status === 403, `status ${foreignProfile.status}`);

  const foreignProfileRead = await req('GET', `/patients/${bob.user._id}`, { token: alice.token });
  check('SEC-17 patient cannot read another profile', foreignProfileRead.status === 403, `status ${foreignProfileRead.status}`);

  const roleEscalation = await req('PATCH', `/patients/${alice.user._id}`, { token: alice.token, body: { role: 'admin' } });
  const stillPatient = await req('GET', '/auth/me', { token: alice.token });
  check(
    'SEC-13 role cannot be escalated through profile update',
    stillPatient.json.user.role === 'patient',
    `role after attempt: ${stillPatient.json.user.role} (PATCH ${roleEscalation.status})`
  );

  const feeUpdate = await req('PATCH', `/doctors/${target._id}`, { token: doctor.token, body: { consultationFee: 950 } });
  check('TC-34 doctor updates own fee', feeUpdate.status === 200 && feeUpdate.json.data.consultationFee === 950, `status ${feeUpdate.status}`);

  const foreignFee = await req('PATCH', `/doctors/${target._id}`, { token: otherDoctor.token, body: { consultationFee: 1 } });
  check('SEC-14 doctor cannot edit another doctor', foreignFee.status === 403, `status ${foreignFee.status}`);

  const nameByAdmin = await req('PATCH', `/doctors/${target._id}`, { token: admin.token, body: { name: 'Dr. Anil Mehta', consultationFee: 800 } });
  check(
    'TC-35 admin edits the linked user name',
    nameByAdmin.status === 200 && nameByAdmin.json.data.doctorName === 'Dr. Anil Mehta',
    `name ${nameByAdmin.json && nameByAdmin.json.data && nameByAdmin.json.data.doctorName}`
  );

  const deactivate = await req('PATCH', `/doctors/${target._id}/status`, { token: admin.token, body: { isActive: false } });
  const dirAfter = await req('GET', '/doctors', { token: alice.token });
  check(
    'TC-36 soft delete removes the doctor from the directory',
    deactivate.status === 200 && dirAfter.json.count === baselineDirCount - 1,
    `count ${dirAfter.json && dirAfter.json.count} (baseline ${baselineDirCount})`
  );

  const reactivate = await req('PATCH', `/doctors/${target._id}/status`, { token: admin.token, body: { isActive: true } });
  const dirRestored = await req('GET', '/doctors', { token: alice.token });
  check(
    'TC-37 reactivation restores the listing',
    reactivate.status === 200 && dirRestored.json.count === baselineDirCount,
    `count ${dirRestored.json && dirRestored.json.count} (baseline ${baselineDirCount})`
  );

  const deactivatedPatient = await req('DELETE', `/patients/${bob.user._id}`, { token: admin.token, body: { isActive: false } });
  const blockedLogin = await req('POST', '/auth/login', { body: { email: 'bob@example.com', password: 'Patient@123' } });
  check(
    'TC-38 deactivated account cannot log in',
    deactivatedPatient.status === 200 && blockedLogin.status === 403 && /deactivated/.test(blockedLogin.json.error),
    `${blockedLogin.status} ${blockedLogin.json && blockedLogin.json.error}`
  );
  await req('DELETE', `/patients/${bob.user._id}`, { token: admin.token, body: { isActive: true } });

  // Runs after TC-36/37 so the directory baseline used there stays stable.
  const newDocEmail = `nair_${Date.now()}@hospital.com`;
  let wed = null;
  for (let i = 1; i <= 14 && !wed; i += 1) {
    if (weekdayOf(shift(i)) === 'Wednesday') wed = shift(i);
  }
  const created = await req('POST', '/doctors', {
    token: admin.token,
    body: {
      name: 'Dr. Meera Nair',
      email: newDocEmail,
      password: 'Doctor@123',
      phone: '9843000111',
      specialization: 'Orthopedic Surgeon',
      qualification: 'MS Ortho',
      consultationFee: 750,
      availableSlots: [{ day: 'Wednesday', startTime: '09:00', endTime: '10:00', slotDurationMins: 30 }],
    },
  });
  check(
    'TC-09 admin creates the auth user and doctor profile together',
    created.status === 201 &&
      created.json.data.doctorName === 'Dr. Meera Nair' &&
      created.json.data.email === newDocEmail &&
      created.json.data.specialization === 'Orthopedic Surgeon',
    `status ${created.status} ${created.json && created.json.data && created.json.data.doctorName} / ${created.json && created.json.data && created.json.data.specialization}`
  );
  const newDocId = created.json.data && created.json.data._id;

  const newDocLogin = await req('POST', '/auth/login', { body: { email: newDocEmail, password: 'Doctor@123' } });
  check(
    'TC-09b the created doctor can log in with the doctor role',
    newDocLogin.status === 200 && newDocLogin.json.user.role === 'doctor',
    `status ${newDocLogin.status}`
  );

  const dupDoctor = await req('POST', '/doctors', {
    token: admin.token,
    body: {
      name: 'Clash', email: newDocEmail, password: 'Doctor@123', specialization: 'X', consultationFee: 1,
      availableSlots: [{ day: 'Monday', startTime: '09:00', endTime: '10:00', slotDurationMins: 30 }],
    },
  });
  check('TC-09c duplicate doctor email rejected', dupDoctor.status === 409, `${dupDoctor.status} ${dupDoctor.json && dupDoctor.json.error}`);

  const gridBefore = await req('GET', `/doctors/${newDocId}/slots?date=${wed}`, { token: alice.token });
  const widened = await req('PATCH', `/doctors/${newDocId}`, {
    token: newDocLogin.json.token,
    body: { availableSlots: [{ day: 'Wednesday', startTime: '09:00', endTime: '11:00', slotDurationMins: 30 }] },
  });
  const gridAfter = await req('GET', `/doctors/${newDocId}/slots?date=${wed}`, { token: alice.token });
  check(
    'TC-10 doctor edits own weekly blocks and the slot grid follows immediately',
    widened.status === 200 && gridBefore.json.slots.length === 2 && gridAfter.json.slots.length === 4,
    `${wed}: ${gridBefore.json && gridBefore.json.slots.length} → ${gridAfter.json && gridAfter.json.slots.length} slots`
  );

  const onLeave = await req('PATCH', `/doctors/${newDocId}`, { token: newDocLogin.json.token, body: { isAvailable: false } });
  const leaveGrid = await req('GET', `/doctors/${newDocId}/slots?date=${wed}`, { token: alice.token });
  const leaveBooking = await req('POST', '/appointments', {
    token: alice.token,
    body: { doctorId: newDocId, date: wed, time: '09:00' },
  });
  const leaveDir = await req('GET', '/doctors', { token: alice.token });
  check(
    'TC-12 leave flag empties the grid, blocks booking and hides the listing',
    onLeave.status === 200 &&
      leaveGrid.json.onLeave === true &&
      leaveGrid.json.slots.length === 0 &&
      leaveBooking.status === 400 &&
      /on leave/i.test(leaveBooking.json.error) &&
      leaveDir.json.count === baselineDirCount,
    `grid ${leaveGrid.json && leaveGrid.json.slots.length} · booking ${leaveBooking.status} ${leaveBooking.json && leaveBooking.json.error} · directory ${leaveDir.json && leaveDir.json.count}`
  );

  await req('PATCH', `/doctors/${newDocId}/status`, { token: admin.token, body: { isActive: false } });

  console.log('\n=== J. Registration ===');

  const email = `verify_${Date.now()}@example.com`;
  const reg = await req('POST', '/auth/register', {
    body: { name: 'Verification Patient', email, password: 'Patient@123', age: 28, gender: 'Female', phone: '9811111111', emergencyContact: '9822222222' },
  });
  check('TC-39 self-service registration', reg.status === 201 && reg.json.user.role === 'patient', `status ${reg.status}`);

  const dupEmail = await req('POST', '/auth/register', { body: { name: 'Dup', email, password: 'Patient@123' } });
  check(
    'TC-40 duplicate email rejected',
    dupEmail.status === 409 && /already exists/.test(dupEmail.json.error),
    `${dupEmail.status} ${dupEmail.json && dupEmail.json.error}`
  );

  const shortPw = await req('POST', '/auth/register', { body: { name: 'Short', email: `s_${Date.now()}@example.com`, password: '123' } });
  check('BV-07 short password rejected', shortPw.status === 400, `${shortPw.status} ${shortPw.json && shortPw.json.error}`);

  // Teardown. The API only soft-deletes accounts, so the entities this suite
  // created are removed directly to keep the seeded baseline (and therefore
  // TC-05's absolute directory counts) valid on a re-run without reseeding.
  const User = require('../../src/models/User');
  const Doctor = require('../../src/models/Doctor');
  const createdDoc = await Doctor.findById(newDocId);
  if (createdDoc) {
    await Appointment.deleteMany({ doctorId: createdDoc._id });
    await User.deleteOne({ _id: createdDoc.userId });
    await Doctor.deleteOne({ _id: createdDoc._id });
  }
  await User.deleteMany({ email });
  await req('PATCH', `/doctors/${target._id}`, { token: admin.token, body: { name: 'Dr. Arjun Mehta', consultationFee: 800 } });

  await mongoose.disconnect();

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  if (fail) {
    console.log('Failures:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error('\nHARNESS ERROR:', err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(2);
});
