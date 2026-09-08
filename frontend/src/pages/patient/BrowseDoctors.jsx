import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { onRealtime } from '../../realtime';
import { useToast } from '../../context/ToastContext';
import { SkeletonCards } from '../../components/Skeleton';
import { ErrorBanner, Loader, EmptyState, Modal, FormField } from '../../components/ui';
import { todayStr, fmtTime, fmtMoney, to12h } from '../../utils/helpers';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export default function BrowseDoctors() {
  const navigate = useNavigate();
  const toast = useToast();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ q: '', specialization: '', day: '', maxFee: '' });
  const [bookingFor, setBookingFor] = useState(null);
  const [slotRefresh, setSlotRefresh] = useState(0);

  // When a slot changes anywhere on the server, refresh the open picker so a
  // just-booked slot disappears without a manual reload.
  useEffect(() => {
    return onRealtime('slots:changed', (payload) => {
      if (bookingFor && payload && String(payload.doctorId) === String(bookingFor._id)) {
        setSlotRefresh((n) => n + 1);
      }
    });
  }, [bookingFor]);

  useEffect(() => {
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
        const res = await api.get(`/doctors?${params.toString()}`);
        setDoctors(res.data.count ? res.data.data : []);
      } catch (err) {
        setError(err.message || 'Could not load doctors');
        setDoctors([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [filters]);

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const openBooking = (doctor) => {
    setBookingFor(doctor);
  };

  const handleBooked = () => {
    toast.success('Appointment requested — awaiting doctor confirmation.');
    navigate('/patient/appointments', { state: { booked: true } });
  };

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Find a Doctor</h1>
        <p className="muted small">Browse the directory and book a consultation slot.</p>
      </div>

      <div className="filter-bar">
        <label className="field grow">
          <span className="field-label">Search</span>
          <input
            type="text"
            placeholder="Doctor name"
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
          />
        </label>
        <label className="field grow">
          <span className="field-label">Specialization</span>
          <input
            type="text"
            placeholder="e.g. Cardiology"
            value={filters.specialization}
            onChange={(e) => setFilter('specialization', e.target.value)}
          />
        </label>
        <label className="field mini">
          <span className="field-label">Day</span>
          <select value={filters.day} onChange={(e) => setFilter('day', e.target.value)}>
            <option value="">Any day</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="field mini">
          <span className="field-label">Max fee</span>
          <input
            type="number"
            min="0"
            placeholder="Any"
            value={filters.maxFee}
            onChange={(e) => setFilter('maxFee', e.target.value)}
          />
        </label>
      </div>

      {error && <ErrorBanner error={error} />}

      {loading && <SkeletonCards cards={3} />}

      {!loading && !error && doctors.length === 0 && (
        <EmptyState>No doctors match your filters.</EmptyState>
      )}

      {!loading && !error && doctors.length > 0 && (
        <div className="grid-cards">
          {doctors.map((doc) => (
            <div className="doctor-card card" key={doc._id}>
              <div className="doc-head">
                <div className="doc-avatar-lg">{initials(doc.doctorName)}</div>
                <div>
                  <div className="doc-title">{doc.doctorName}</div>
                  <div className="doc-meta">{doc.specialization}</div>
                </div>
              </div>
              <p className="muted small">{doc.qualification || 'Qualification not provided'}</p>
              {doc.availableSlots && doc.availableSlots.length > 0 ? (
                <div className="sch-chips">
                  {doc.availableSlots.map((s) => (
                    <span className="sch-chip" key={`${s.day}-${s.startTime}`}>
                      {s.day.slice(0, 3)} {fmtTime(s.startTime)}–{fmtTime(s.endTime)}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="muted small">No weekly schedule set</span>
              )}
              <div className="fee-line">{fmtMoney(doc.consultationFee)}</div>
              <div className="card-footer">
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => openBooking(doc)}
                >
                  Book Appointment
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {bookingFor && (
        <BookingModal
          doctor={bookingFor}
          refreshSignal={slotRefresh}
          onBooked={handleBooked}
          onClose={() => setBookingFor(null)}
        />
      )}
    </div>
  );
}

function BookingModal({ doctor, onBooked, onClose, refreshSignal = 0 }) {
  const today = todayStr();
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState([]);
  const [onLeave, setOnLeave] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [time, setTime] = useState('');
  const [symptoms, setSymptoms] = useState('');
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
      .get(`/doctors/${doctor._id}/slots?date=${date}`)
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
  }, [doctor._id, date, refreshSignal]);

  const submitBooking = async () => {
    setError('');
    setSubmitting(true);
    try {
      await api.post('/appointments', {
        doctorId: doctor._id,
        date,
        time,
        symptoms,
      });
      onBooked();
    } catch (err) {
      setError(err.message || 'Could not book this appointment');
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Book with ${doctor.doctorName}`} onClose={onClose} wide>
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

      <FormField label="Symptoms / reason for visit">
        <textarea
          rows={3}
          placeholder="Briefly describe what brings you in"
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
        />
      </FormField>

      {error && <ErrorBanner error={error} />}

      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!time || submitting}
          onClick={submitBooking}
        >
          {submitting ? 'Booking…' : 'Confirm Booking'}
        </button>
      </div>
    </Modal>
  );
}
