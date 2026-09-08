import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../api/client';
import {
  ErrorBanner,
  Loader,
  EmptyState,
  Modal,
  Badge,
  FormField,
} from '../../components/ui';
import { todayStr, fmtDate, fmtTime, to12h, statusTone, idOf } from '../../utils/helpers';

const TABS = [
  ['', 'All'],
  ['Pending', 'Pending'],
  ['Confirmed', 'Confirmed'],
  ['Completed', 'Completed'],
  ['Cancelled', 'Cancelled'],
];

export default function MyAppointments() {
  const location = useLocation();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.booked ? 'Appointment requested.' : '');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState(null);

  const refresh = async () => {
    setError('');
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      const res = await api.get(`/appointments/my?${params.toString()}`);
      setAppointments(res.data.count ? res.data.data : []);
    } catch (err) {
      setError(err.message || 'Could not load your appointments');
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(refresh, 250);
    return () => clearTimeout(timer);
  }, [status, from, to]);

  const reload = async () => {
    setAction(null);
    await refresh();
  };

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">My Appointments</h1>
        <p className="muted small">Track and manage your consultation bookings.</p>
      </div>

      {notice && (
        <div className="alert alert-success">
          {notice}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice('')}>
            Dismiss
          </button>
        </div>
      )}

      <div className="filter-bar">
        <div className="seg">
          {TABS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={status === value ? 'active' : ''}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="field mini">
          <span className="field-label">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field mini">
          <span className="field-label">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {error && <ErrorBanner error={error} />}

      {loading && <Loader />}

      {!loading && !error && appointments.length === 0 && (
        <EmptyState>No appointments to show.</EmptyState>
      )}

      {!loading && !error && appointments.length > 0 && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Doctor</th>
                <th>When</th>
                <th>Symptoms</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a._id}>
                  <td>
                    <strong>{a.doctorName}</strong>
                    <div className="muted small">{a.doctorSpecialization}</div>
                  </td>
                  <td>
                    {fmtDate(a.date)}
                    <div className="muted small">
                      {fmtTime(a.startTime)}–{fmtTime(a.endTime)}
                    </div>
                  </td>
                  <td className="td-muted">{a.symptoms || '—'}</td>
                  <td>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    {a.cancelledBy && (
                      <div className="muted small">by {a.cancelledBy}</div>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      {a.status === 'Pending' || a.status === 'Confirmed' ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setAction({ type: 'reschedule', appointment: a })}
                          >
                            Reschedule
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => setAction({ type: 'cancel', appointment: a })}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setAction({ type: 'details', appointment: a })}
                        >
                          Details
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {action && (
        <ActionModal
          action={action}
          onClose={() => setAction(null)}
          onDone={(msg) => {
            reload();
            setNotice(msg);
          }}
        />
      )}
    </div>
  );
}

function ActionModal({ action, onClose, onDone }) {
  const { type, appointment } = action;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (type === 'details') {
    return (
      <Modal title="Appointment details" onClose={onClose} wide>
        <div className="row-between">
          <span className="muted small">Doctor</span>
          <strong>{appointment.doctorName}</strong>
        </div>
        <div className="row-between">
          <span className="muted small">Specialization</span>
          <span>{appointment.doctorSpecialization}</span>
        </div>
        <div className="row-between">
          <span className="muted small">Date</span>
          <span>{fmtDate(appointment.date)}</span>
        </div>
        <div className="row-between">
          <span className="muted small">Time</span>
          <span>
            {fmtTime(appointment.startTime)}–{fmtTime(appointment.endTime)}
          </span>
        </div>
        <div className="row-between">
          <span className="muted small">Symptoms</span>
          <span>{appointment.symptoms || '—'}</span>
        </div>
        <div className="row-between">
          <span className="muted small">Diagnosis</span>
          <span>{appointment.diagnosis || '—'}</span>
        </div>
        <div className="row-between">
          <span className="muted small">Prescription</span>
          <span>{appointment.prescription || '—'}</span>
        </div>
        <div className="row-between">
          <span className="muted small">Notes</span>
          <span>{appointment.consultationNotes || 'No notes.'}</span>
        </div>
        <div className="row-between">
          <span className="muted small">Status</span>
          <Badge tone={statusTone(appointment.status)}>{appointment.status}</Badge>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </Modal>
    );
  }

  if (type === 'cancel') {
    const doCancel = async () => {
      setSubmitting(true);
      setError('');
      try {
        await api.post(`/appointments/${appointment._id}/cancel`);
        onDone('Appointment cancelled.');
      } catch (err) {
        setError(err.message || 'Could not cancel appointment');
        setSubmitting(false);
      }
    };

    return (
      <Modal title="Cancel appointment?" onClose={onClose}>
        <p className="muted small">
          This will cancel your {fmtDate(appointment.date)} appointment with{' '}
          {appointment.doctorName}. This action cannot be undone.
        </p>
        {error && <ErrorBanner error={error} />}
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Keep
          </button>
          <button type="button" className="btn btn-danger" disabled={submitting} onClick={doCancel}>
            {submitting ? 'Cancelling…' : 'Cancel appointment'}
          </button>
        </div>
      </Modal>
    );
  }

  return <RescheduleModal appointment={appointment} onClose={onClose} onDone={onDone} />;
}

function RescheduleModal({ appointment, onClose, onDone }) {
  const today = todayStr();
  const doctorId = idOf(appointment.doctorId);
  const [date, setDate] = useState(appointment.date);
  const [slots, setSlots] = useState([]);
  const [onLeave, setOnLeave] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setSlotsLoading(true);
    setSlotsError('');
    setTime('');
    setSlots([]);
    setOnLeave(false);
    api
      .get(`/doctors/${doctorId}/slots?date=${date}`)
      .then((res) => {
        if (!active) return;
        setSlots(res.data.slots || []);
        setOnLeave(!!res.data.onLeave);
      })
      .catch((err) => {
        if (!active) return;
        setSlotsError(err.message || 'Could not load slots');
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [doctorId, date]);

  const doReschedule = async () => {
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/appointments/${appointment._id}/reschedule`, { date, time });
      onDone('Appointment rescheduled.');
    } catch (err) {
      setError(err.message || 'Could not reschedule appointment');
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Reschedule appointment" onClose={onClose} wide>
      <p className="muted small">
        New time with {appointment.doctorName}. Your booking returns to Pending until the doctor
        confirms.
      </p>
      <label className="field">
        <span className="field-label">Date</span>
        <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <span className="field-label">Available slots</span>
      {slotsLoading && <Loader inline />}
      {!slotsLoading && slotsError && <ErrorBanner error={slotsError} />}
      {!slotsLoading && !slotsError && onLeave && (
        <span className="muted small">Doctor is on leave this day.</span>
      )}
      {!slotsLoading && !slotsError && !onLeave && slots.length === 0 && (
        <span className="muted small">No slots available for this date.</span>
      )}
      {!slotsLoading && !slotsError && !onLeave && slots.length > 0 && (
        <div className="slot-grid">
          {slots.map((s) => (
            <button
              type="button"
              key={`${s.startTime}-${s.endTime}`}
              className={`slot-btn${time === s.startTime ? ' selected' : ''}`}
              onClick={() => setTime(s.startTime)}
            >
              <span>{to12h(s.startTime)}</span>
              <small>{to12h(s.endTime)}</small>
            </button>
          ))}
        </div>
      )}

      {error && <ErrorBanner error={error} />}

      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!time || submitting}
          onClick={doReschedule}
        >
          {submitting ? 'Rescheduling…' : 'Confirm new time'}
        </button>
      </div>
    </Modal>
  );
}
