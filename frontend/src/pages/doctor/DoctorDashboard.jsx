import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api/client';
import { onRealtime } from '../../realtime';
import { useToast } from '../../context/ToastContext';
import { Badge, EmptyState, ErrorBanner, Loader, Modal, SuccessBanner } from '../../components/ui';
import {
  addDays,
  addMonths,
  fmtDate,
  fmtMoney,
  fmtTime,
  monthRange,
  statusTone,
  todayStr,
  weekRange,
} from '../../utils/helpers';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
const DURATIONS = [15, 30, 45, 60];
const VIEWS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];
const EMPTY_RECORD = { notes: '', diagnosis: '', prescription: '' };
const CANCEL_LABEL = {
  patient: 'Cancelled by the patient',
  doctor: 'Cancelled by you',
  admin: 'Cancelled by an administrator',
};

/** The inclusive date window a view covers, plus the params the API expects. */
function rangeFor(view, dateStr) {
  if (view === 'week') return weekRange(dateStr);
  if (view === 'month') return monthRange(dateStr);
  return { from: dateStr, to: dateStr };
}

function recordFrom(appointment) {
  return {
    notes: appointment.consultationNotes || '',
    diagnosis: appointment.diagnosis || '',
    prescription: appointment.prescription || '',
  };
}

/** True when the doctor typed something in at least one record field. */
function recordFilled(record) {
  return Boolean(record.notes.trim() || record.diagnosis.trim() || record.prescription.trim());
}

function trimmedRecord(record) {
  return {
    notes: record.notes.trim(),
    diagnosis: record.diagnosis.trim(),
    prescription: record.prescription.trim(),
  };
}

function blockValid(row) {
  if (!DAYS.includes(row.day) || !row.startTime || !row.endTime) return false;
  const s = row.startTime.split(':').map(Number);
  const e = row.endTime.split(':').map(Number);
  if (s.length !== 2 || e.length !== 2) return false;
  return s[0] * 60 + s[1] < e[0] * 60 + e[1];
}

export default function DoctorDashboard() {
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  const [date, setDate] = useState(todayStr());
  const [view, setView] = useState('day');
  const [tab, setTab] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [complete, setComplete] = useState(null);
  const [completeRec, setCompleteRec] = useState(EMPTY_RECORD);
  const [cancel, setCancel] = useState(null);
  const [notes, setNotes] = useState(null);
  const [notesRec, setNotesRec] = useState(EMPTY_RECORD);

  async function loadProfile() {
    setProfileLoading(true);
    setProfileError('');
    try {
      const res = await api.get('/doctors/me');
      setProfile(res.data.data);
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setProfileLoading(false);
    }
  }

  const range = useMemo(() => rangeFor(view, date), [view, date]);

  async function loadList() {
    setListLoading(true);
    try {
      // A single day still goes out as `date` so the server can hit the
      // doctorId+date index directly.
      const params = view === 'day' ? { date } : { from: range.from, to: range.to };
      const res = await api.get('/appointments/doctor', { params });
      setAppointments(res.data.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    setTab('');
    loadList();
  }, [date, view]);

  function step(direction) {
    if (view === 'week') return setDate(addDays(date, 7 * direction));
    if (view === 'month') return setDate(addMonths(date, direction));
    return setDate(addDays(date, direction));
  }

  const shown = useMemo(() => {
    if (!tab) return appointments;
    return appointments.filter((a) => a.status === tab);
  }, [appointments, tab]);

  const counts = useMemo(() => {
    const c = { all: appointments.length, Pending: 0, Confirmed: 0, Completed: 0, Cancelled: 0 };
    appointments.forEach((a) => {
      c[a.status] = (c[a.status] || 0) + 1;
    });
    return c;
  }, [appointments]);

  async function run(fn, message) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      if (message) {
        setNotice(message);
        toast.success(message);
      }
      await loadList();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Live refresh: any appointment or slot change elsewhere in the hospital
  // (e.g. a patient booking, an admin correction) refreshes this queue and
  // profile without a manual reload. The ref keeps the current closures.
  const liveRef = useRef({ loadList, loadProfile });
  liveRef.current = { loadList, loadProfile };
  useEffect(() => {
    const events = [
      'appointment:created',
      'appointment:updated',
      'appointment:status',
      'appointment:notes',
      'appointment:removed',
    ];
    const offs = [
      ...events.map((ev) => onRealtime(ev, () => liveRef.current.loadList())),
      onRealtime('slots:changed', () => liveRef.current.loadList()),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  function confirmAppt(a) {
    return run(() => api.patch(`/appointments/${a._id}/status`, { status: 'Confirmed' }), 'Appointment confirmed');
  }

  function saveComplete() {
    if (!complete) return;
    const appt = complete;
    const record = trimmedRecord(completeRec);
    setComplete(null);
    return run(
      () => api.patch(`/appointments/${appt._id}/status`, { status: 'Completed', ...record }),
      'Appointment marked as completed'
    );
  }

  function saveCancel() {
    if (!cancel) return;
    const appt = cancel;
    setCancel(null);
    return run(() => api.post(`/appointments/${appt._id}/cancel`, {}), 'Appointment cancelled');
  }

  function saveNotes() {
    if (!notes) return;
    const appt = notes;
    const record = trimmedRecord(notesRec);
    setNotes(null);
    return run(
      () => api.patch(`/appointments/${appt._id}/notes`, record),
      'Consultation record saved'
    );
  }

  const settings = useMemo(() => {
    if (!profile || !settingsOpen) return null;
    return {
      isAvailable: profile.isAvailable,
      consultationFee: profile.consultationFee,
      specialization: profile.specialization,
      qualification: profile.qualification,
      blocks: (profile.availableSlots || []).map((b) => ({ ...b })),
    };
  }, [profile, settingsOpen]);

  if (profileLoading) {
    return (
      <>
        <div className="page-head">
          <h2 className="page-title">My Schedule</h2>
        </div>
        <Loader />
      </>
    );
  }

  if (profileError) {
    return (
      <>
        <div className="page-head">
          <h2 className="page-title">My Schedule</h2>
        </div>
        <ErrorBanner error={profileError} />
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={loadProfile}>
            Retry
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">My Schedule</h2>
          <p className="muted">
            {profile.doctorName} &middot; {profile.specialization}
            {profile.qualification ? <> &middot; {profile.qualification}</> : null} &middot;{' '}
            {fmtMoney(profile.consultationFee)}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setSettingsOpen(true)}>
          Schedule &amp; availability
        </button>
      </div>

      {profile.isAvailable ? null : (
        <div className="alert alert-warn">You are currently marked as unavailable. Patients cannot book you until you turn availability back on.</div>
      )}

      {error ? <ErrorBanner error={error} /> : null}
      {notice ? <SuccessBanner message={notice} /> : null}

      <div className="card">
        <div className="filter-bar">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => step(-1)}
          >
            &lsaquo; Prev
          </button>
          <div className="field grow">
            <label className="field-label" htmlFor="schedule-date">
              {view === 'day' ? 'Date' : 'Date within the period'}
            </label>
            <input
              id="schedule-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => step(1)}
          >
            Next &rsaquo;
          </button>
          <div className="seg">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                className={view === v.key ? 'seg-btn active' : 'seg-btn'}
                onClick={() => setView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="seg">
          <button type="button" className={tab === '' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTab('')}>
            All ({counts.all})
          </button>
          <button type="button" className={tab === 'Pending' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTab('Pending')}>
            Pending ({counts.Pending})
          </button>
          <button type="button" className={tab === 'Confirmed' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTab('Confirmed')}>
            Confirmed ({counts.Confirmed})
          </button>
          <button type="button" className={tab === 'Completed' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTab('Completed')}>
            Completed ({counts.Completed})
          </button>
          <button type="button" className={tab === 'Cancelled' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTab('Cancelled')}>
            Cancelled ({counts.Cancelled})
          </button>
        </div>

        <p className="muted small">
          {view === 'day'
            ? `${fmtDate(date)} · ${DAYS[new Date(date + 'T00:00:00').getDay()]}`
            : `${fmtDate(range.from)} — ${fmtDate(range.to)}`}
          {' · '}
          {counts.all} appointment{counts.all === 1 ? '' : 's'}
        </p>

        {listLoading ? (
          <Loader />
        ) : shown.length === 0 ? (
          <EmptyState>
            No {tab || ''} appointments{' '}
            {view === 'day'
              ? date === todayStr()
                ? 'for today'
                : `for ${fmtDate(date)}`
              : `between ${fmtDate(range.from)} and ${fmtDate(range.to)}`}
            .
          </EmptyState>
        ) : (
          <div className="stack">
            {shown.map((a) => (
              <div className="card row-between" key={a._id}>
                <div className="appt-info">
                  <p>
                    <strong>
                      {view === 'day' ? null : `${fmtDate(a.date)} · `}
                      {fmtTime(a.startTime)} &ndash; {fmtTime(a.endTime)}
                    </strong>
                  </p>
                  <p className="muted">
                    {a.patientName}
                    {a.patientId && a.patientId.age ? `, ${a.patientId.age} yrs` : ''}
                    {a.patientId && a.patientId.gender ? `, ${a.patientId.gender}` : ''}
                  </p>
                  {a.symptoms ? (
                    <p className="small">Symptoms: {a.symptoms}</p>
                  ) : null}
                  {a.diagnosis ? <p className="small">Diagnosis: {a.diagnosis}</p> : null}
                  {a.prescription ? <p className="small">Prescription: {a.prescription}</p> : null}
                  {a.consultationNotes ? (
                    <p className="small">Notes: {a.consultationNotes}</p>
                  ) : null}
                  {a.cancelledBy ? <p className="small muted">{CANCEL_LABEL[a.cancelledBy] || 'Cancelled'}</p> : null}
                  {a.patientId && a.patientId.phone ? (
                    <p className="small">
                      <a href={`tel:${a.patientId.phone}`}>{a.patientId.phone}</a>
                    </p>
                  ) : null}
                </div>
                <div className="appt-side">
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  <div className="actions">
                    {a.status === 'Pending' ? (
                      <>
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => confirmAppt(a)}>
                          Confirm
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => setCancel(a)}>
                          Cancel
                        </button>
                      </>
                    ) : null}
                    {a.status === 'Confirmed' ? (
                      <>
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => { setCompleteRec(recordFrom(a)); setComplete(a); }}>
                          Start &amp; complete
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => setCancel(a)}>
                          Cancel
                        </button>
                      </>
                    ) : null}
                    {a.status === 'Completed' ? (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setNotesRec(recordFrom(a)); setNotes(a); }}>
                        {a.consultationNotes || a.diagnosis || a.prescription ? 'Edit record' : 'Add record'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {settings && (
        <ScheduleSettings
          profileId={profile._id}
          initial={settings}
          busy={busy}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            loadProfile();
            toast.success('Schedule settings saved');
          }}
          onError={(m) => setError(m)}
          onBusy={setBusy}
        />
      )}

      {complete ? (
        <Modal title="Complete appointment" onClose={() => setComplete(null)}>
          <p className="muted">
            {fmtDate(complete.date)}, {fmtTime(complete.startTime)} &ndash; {fmtTime(complete.endTime)} with {complete.patientName}.
          </p>
          <ConsultationFields value={completeRec} onChange={setCompleteRec} />
          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={() => setComplete(null)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={saveComplete} disabled={busy}>
              {busy ? 'Saving…' : 'Mark completed'}
            </button>
          </div>
        </Modal>
      ) : null}

      {cancel ? (
        <Modal title="Cancel appointment" onClose={() => setCancel(null)}>
          <p className="muted">
            Cancel {fmtDate(cancel.date)}, {fmtTime(cancel.startTime)} with {cancel.patientName}? The slot will be released for other patients.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={() => setCancel(null)} disabled={busy}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger" onClick={saveCancel} disabled={busy}>
              {busy ? 'Cancelling…' : 'Yes, cancel appointment'}
            </button>
          </div>
        </Modal>
      ) : null}

      {notes ? (
        <Modal title="Consultation record" onClose={() => setNotes(null)}>
          <ConsultationFields value={notesRec} onChange={setNotesRec} />
          <p className="muted small">
            The consultation record can only be edited within 24 hours of the appointment ending.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={() => setNotes(null)} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveNotes}
              disabled={busy || !recordFilled(notesRec)}
            >
              {busy ? 'Saving…' : 'Save record'}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/**
 * The three Module 4 consultation fields (diagnosis, prescription, notes),
 * shared by the "complete appointment" and "edit record" modals.
 */
function ConsultationFields({ value, onChange }) {
  function set(key, next) {
    onChange({ ...value, [key]: next });
  }

  return (
    <>
      <div className="field field-wide">
        <span className="field-label">Diagnosis</span>
        <input
          type="text"
          value={value.diagnosis}
          placeholder="e.g. Seasonal allergic rhinitis"
          onChange={(e) => set('diagnosis', e.target.value)}
        />
      </div>
      <div className="field field-wide">
        <span className="field-label">Prescription</span>
        <textarea
          rows={3}
          value={value.prescription}
          placeholder="Medicine, dosage and duration"
          onChange={(e) => set('prescription', e.target.value)}
        />
      </div>
      <div className="field field-wide">
        <span className="field-label">Consultation notes</span>
        <textarea
          rows={3}
          value={value.notes}
          placeholder="Observations and follow-up plan"
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>
    </>
  );
}

function ScheduleSettings({ profileId, initial, busy, onClose, onSaved, onError, onBusy }) {
  const [isAvailable, setIsAvailable] = useState(initial.isAvailable);
  const [consultationFee, setConsultationFee] = useState(initial.consultationFee || '');
  const [specialization, setSpecialization] = useState(initial.specialization || '');
  const [qualification, setQualification] = useState(initial.qualification || '');
  const [blocks, setBlocks] = useState(initial.blocks);
  const [day, setDay] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState('');

  function addBlock() {
    if (!day || !startTime || !endTime) {
      setError('Pick a day and both start and end times before adding.');
      return;
    }
    if (startTime >= endTime) {
      setError('End time must be after the start time.');
      return;
    }
    const clash = blocks.some((b) => b.day === day && startTime >= b.startTime && startTime < b.endTime);
    if (clash) {
      setError('This day already has a working block covering that start time.');
      return;
    }
    setBlocks((bs) => [...bs, { day, startTime, endTime, slotDurationMins: duration }]);
    setDay('');
    setStartTime('');
    setEndTime('');
    setError('');
  }

  function removeBlock(i) {
    setBlocks((bs) => bs.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (Number(consultationFee) < 0 || consultationFee === '') {
      setError('Consultation fee is required and cannot be negative.');
      return;
    }
    if (blocks.length === 0) {
      setError('Add at least one weekly working block so patients can book you.');
      return;
    }
    const bad = blocks.find((b) => !blockValid(b));
    if (bad) {
      setError('Every working block needs a day, start/end times and a duration.');
      return;
    }
    onBusy(true);
    setError('');
    try {
      await api.patch(`/doctors/${profileId}`, {
        isAvailable,
        consultationFee: Number(consultationFee),
        specialization: specialization.trim(),
        qualification: qualification.trim(),
        availableSlots: blocks,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      onError(e.message);
    } finally {
      onBusy(false);
    }
  }

  return (
    <Modal title="Schedule & availability" onClose={onClose} wide>
      {error ? <ErrorBanner error={error} /> : null}
      <label className="check">
        <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
        Accepting new appointments
      </label>

      <div className="form-grid">
        <div className="field">
          <span className="field-label">Consultation fee (Rs.)</span>
          <input
            type="number"
            min={0}
            value={consultationFee}
            onChange={(e) => setConsultationFee(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="field-label">Specialization</span>
          <input
            type="text"
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="field-label">Qualification</span>
          <input
            type="text"
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
          />
        </div>
      </div>

      <p className="muted small">Weekly working hours &mdash; patients can book slots inside these blocks for any matching weekday.</p>

      {blocks.length === 0 ? (
        <EmptyState>No working hours yet.</EmptyState>
      ) : (
        <div className="stack">
          {blocks.map((b, i) => (
            <div className="row-between schedule-row" key={i}>
              <div className="schedule-day">{b.day}</div>
              <div className="schedule-time">
                {fmtTime(b.startTime)} &ndash; {fmtTime(b.endTime)} &middot; {b.slotDurationMins} min
              </div>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => removeBlock(i)} disabled={busy}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="form-grid">
        <div className="field">
          <span className="field-label">Day</span>
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">Select day…</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="field-label">Start</span>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="field">
          <span className="field-label">End</span>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div className="field">
          <span className="field-label">Slot length</span>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>{d} min</option>
            ))}
          </select>
        </div>
      </div>

      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={addBlock} disabled={busy}>
          + Add working block
        </button>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Close
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}
