import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import { Badge, EmptyState, ErrorBanner, Loader, Modal, SuccessBanner } from '../../components/ui';
import {
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtTime,
  idOf,
  monthRange,
  statusTone,
  todayStr,
  weekRange,
} from '../../utils/helpers';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DURATIONS = [15, 20, 30, 45, 60];
const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'doctors', label: 'Doctors' },
  { id: 'patients', label: 'Patients' },
  { id: 'appointments', label: 'Appointments' },
];

const CANCEL_LABEL = {
  patient: 'Cancelled by the patient',
  doctor: 'Cancelled by the doctor',
  admin: 'Cancelled by an administrator',
};

function blockValid(b) {
  if (!DAYS.includes(b.day) || !b.startTime || !b.endTime) return false;
  return b.startTime < b.endTime && Number(b.slotDurationMins) > 0;
}

export default function AdminDashboard() {
  const [tab, setTab] = useState('overview');

  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [doctorFilter, setDoctorFilter] = useState({ q: '', specialization: '', status: 'all' });
  const [patientFilter, setPatientFilter] = useState({ q: '', status: 'all' });
  const [apptFilter, setApptFilter] = useState({ status: '', doctorId: '', from: '', to: '' });

  const [doctorForm, setDoctorForm] = useState(null);
  const [patientEdit, setPatientEdit] = useState(null);
  const [notesTarget, setNotesTarget] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, p, a] = await Promise.all([
        api.get('/doctors', { params: { includeInactive: 'true' } }),
        api.get('/patients', { params: { includeInactive: 'true' } }),
        api.get('/appointments'),
      ]);
      setDoctors(d.data.data || []);
      setPatients(p.data.data || []);
      setAppointments(a.data.data || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Run a mutation, surface the outcome, then refresh every list. */
  async function run(fn, message) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      if (message) setNotice(message);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function afterSave(message) {
    setDoctorForm(null);
    setPatientEdit(null);
    setNotesTarget(null);
    setError('');
    setNotice(message);
    await load();
  }

  function ask(config) {
    setConfirmAction(config);
  }

  function runConfirmed() {
    const c = confirmAction;
    setConfirmAction(null);
    if (c) run(c.action, c.success);
  }

  // ------------------------------------------------------------- derived data
  const specializations = useMemo(() => {
    const set = new Set(doctors.map((d) => d.specialization).filter(Boolean));
    return Array.from(set).sort();
  }, [doctors]);

  const apptCountByPatient = useMemo(() => {
    const map = new Map();
    appointments.forEach((a) => {
      const key = idOf(a.patientId);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [appointments]);

  const stats = useMemo(() => {
    const today = todayStr();
    const byStatus = { Pending: 0, Confirmed: 0, Completed: 0, Cancelled: 0 };
    let todayCount = 0;
    let revenue = 0;

    appointments.forEach((a) => {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      if (a.date === today && a.status !== 'Cancelled') todayCount += 1;
      if (a.status === 'Completed') {
        revenue += Number((a.doctorId && a.doctorId.consultationFee) || 0);
      }
    });

    return {
      byStatus,
      todayCount,
      revenue,
      total: appointments.length,
      doctorsActive: doctors.filter((d) => d.isActive).length,
      doctorsOnLeave: doctors.filter((d) => d.isActive && !d.isAvailable).length,
      patientsActive: patients.filter((p) => p.isActive).length,
    };
  }, [appointments, doctors, patients]);

  const shownDoctors = useMemo(() => {
    const q = doctorFilter.q.trim().toLowerCase();
    return doctors.filter((d) => {
      if (doctorFilter.status === 'active' && !d.isActive) return false;
      if (doctorFilter.status === 'inactive' && d.isActive) return false;
      if (doctorFilter.status === 'leave' && (d.isAvailable || !d.isActive)) return false;
      if (doctorFilter.specialization && d.specialization !== doctorFilter.specialization) return false;
      if (!q) return true;
      return [d.doctorName, d.email, d.specialization, d.qualification]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [doctors, doctorFilter]);

  const shownPatients = useMemo(() => {
    const q = patientFilter.q.trim().toLowerCase();
    return patients.filter((p) => {
      if (patientFilter.status === 'active' && !p.isActive) return false;
      if (patientFilter.status === 'inactive' && p.isActive) return false;
      if (!q) return true;
      return [p.name, p.email, p.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [patients, patientFilter]);

  const shownAppointments = useMemo(
    () =>
      appointments.filter((a) => {
        if (apptFilter.status && a.status !== apptFilter.status) return false;
        if (apptFilter.doctorId && idOf(a.doctorId) !== apptFilter.doctorId) return false;
        if (apptFilter.from && a.date < apptFilter.from) return false;
        if (apptFilter.to && a.date > apptFilter.to) return false;
        return true;
      }),
    [appointments, apptFilter]
  );

  const todaySchedule = useMemo(() => {
    const today = todayStr();
    return appointments
      .filter((a) => a.date === today && a.status !== 'Cancelled')
      .sort((x, y) => x.startTime.localeCompare(y.startTime));
  }, [appointments]);

  const latestBookings = useMemo(
    () =>
      [...appointments]
        .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
        .slice(0, 6),
    [appointments]
  );

  // ---------------------------------------------------------------- mutations
  const setDoctorActive = (doctor, isActive) =>
    ask({
      title: isActive ? 'Reactivate doctor' : 'Deactivate doctor',
      body: isActive
        ? `${doctor.doctorName} will appear in the directory again and can sign in.`
        : `${doctor.doctorName} will be hidden from the directory and blocked from signing in. Existing appointment records are kept.`,
      confirmLabel: isActive ? 'Reactivate' : 'Deactivate',
      danger: !isActive,
      action: () => api.patch(`/doctors/${doctor._id}/status`, { isActive }),
      success: isActive ? 'Doctor account reactivated' : 'Doctor account deactivated',
    });

  const setPatientActive = (patient, isActive) =>
    ask({
      title: isActive ? 'Reactivate patient' : 'Deactivate patient account',
      body: isActive
        ? `${patient.name} will be able to sign in and book appointments again.`
        : `${patient.name} will no longer be able to sign in. This is a soft delete: their medical history stays in the ledger.`,
      confirmLabel: isActive ? 'Reactivate' : 'Deactivate',
      danger: !isActive,
      action: () => api.delete(`/patients/${patient._id}`, { data: { isActive } }),
      success: isActive ? 'Patient account reactivated' : 'Patient account deactivated',
    });

  const confirmAppointment = (a) =>
    run(() => api.patch(`/appointments/${a._id}/status`, { status: 'Confirmed' }), 'Appointment confirmed');

  const completeAppointment = (a) =>
    run(() => api.patch(`/appointments/${a._id}/status`, { status: 'Completed' }), 'Appointment marked as completed');

  const cancelAppointment = (a) =>
    ask({
      title: 'Cancel appointment',
      body: `Cancel the ${fmtDate(a.date)} ${fmtTime(a.startTime)} appointment for ${a.patientName || 'this patient'}? The slot returns to the available pool.`,
      confirmLabel: 'Cancel appointment',
      danger: true,
      action: () => api.post(`/appointments/${a._id}/cancel`, {}),
      success: 'Appointment cancelled and the slot released',
    });

  const purgeAppointment = (a) =>
    ask({
      title: 'Purge medical record',
      body: `Permanently delete the ${fmtDate(a.date)} ${fmtTime(a.startTime)} record for ${a.patientName || 'this patient'} (${a.status}). Consultation notes attached to it are destroyed and this cannot be undone.`,
      confirmLabel: 'Purge record',
      danger: true,
      action: () => api.delete(`/appointments/${a._id}`),
      success: 'Medical record purged',
    });

  const tabCount = { overview: null, doctors: doctors.length, patients: patients.length, appointments: appointments.length };

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>Administration</h1>
          <p>Doctor directory, patient accounts and the hospital-wide appointment ledger.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading || busy}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setDoctorForm({ mode: 'create' })}
            disabled={busy}
          >
            + Add doctor
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Administration sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {tabCount[t.id] === null ? '' : ` (${tabCount[t.id]})`}
          </button>
        ))}
      </div>

      <ErrorBanner error={error} />
      <SuccessBanner message={notice} />

      {loading ? (
        <Loader />
      ) : (
        <>
          {tab === 'overview' ? (
            <Overview stats={stats} todaySchedule={todaySchedule} latestBookings={latestBookings} />
          ) : null}

          {tab === 'doctors' ? (
            <DoctorsTab
              rows={shownDoctors}
              total={doctors.length}
              specializations={specializations}
              filter={doctorFilter}
              onFilter={setDoctorFilter}
              busy={busy}
              onCreate={() => setDoctorForm({ mode: 'create' })}
              onEdit={(doctor) => setDoctorForm({ mode: 'edit', doctor })}
              onToggleActive={setDoctorActive}
            />
          ) : null}

          {tab === 'patients' ? (
            <PatientsTab
              rows={shownPatients}
              total={patients.length}
              filter={patientFilter}
              onFilter={setPatientFilter}
              apptCountByPatient={apptCountByPatient}
              busy={busy}
              onEdit={(patient) => setPatientEdit(patient)}
              onToggleActive={setPatientActive}
            />
          ) : null}

          {tab === 'appointments' ? (
            <AppointmentsTab
              rows={shownAppointments}
              total={appointments.length}
              doctors={doctors}
              filter={apptFilter}
              onFilter={setApptFilter}
              busy={busy}
              onConfirm={confirmAppointment}
              onComplete={completeAppointment}
              onCancel={cancelAppointment}
              onPurge={purgeAppointment}
              onNotes={(a) => setNotesTarget(a)}
            />
          ) : null}
        </>
      )}

      {doctorForm ? (
        <DoctorFormModal
          mode={doctorForm.mode}
          doctor={doctorForm.doctor}
          onClose={() => setDoctorForm(null)}
          onSaved={afterSave}
        />
      ) : null}

      {patientEdit ? (
        <PatientEditModal patient={patientEdit} onClose={() => setPatientEdit(null)} onSaved={afterSave} />
      ) : null}

      {notesTarget ? (
        <NotesModal appointment={notesTarget} onClose={() => setNotesTarget(null)} onSaved={afterSave} />
      ) : null}

      {confirmAction ? (
        <Modal title={confirmAction.title} onClose={() => setConfirmAction(null)}>
          <p className="muted">{confirmAction.body}</p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmAction(null)}
              disabled={busy}
            >
              Keep as is
            </button>
            <button
              type="button"
              className={confirmAction.danger ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={runConfirmed}
              disabled={busy}
            >
              {confirmAction.confirmLabel}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/* ============================================================== Overview tab */
function Overview({ stats, todaySchedule, latestBookings }) {
  return (
    <>
      <div className="stats-row">
        <div className="stat">
          <span className="stat-label">Active doctors</span>
          <span className="stat-value">{stats.doctorsActive}</span>
          <span className="td-muted">{stats.doctorsOnLeave} on leave</span>
        </div>
        <div className="stat">
          <span className="stat-label">Active patients</span>
          <span className="stat-value">{stats.patientsActive}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Today</span>
          <span className="stat-value">{stats.todayCount}</span>
          <span className="td-muted">live appointments</span>
        </div>
        <div className="stat">
          <span className="stat-label">Awaiting confirmation</span>
          <span className="stat-value">{stats.byStatus.Pending}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Completed</span>
          <span className="stat-value">{stats.byStatus.Completed}</span>
          <span className="td-muted">{stats.byStatus.Cancelled} cancelled</span>
        </div>
        <div className="stat">
          <span className="stat-label">Consultation revenue</span>
          <span className="stat-value">{fmtMoney(stats.revenue)}</span>
          <span className="td-muted">completed visits</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <p className="panel-title">Today&rsquo;s schedule &middot; {fmtDate(todayStr())}</p>
          {todaySchedule.length === 0 ? (
            <EmptyState>
              <strong>Nothing booked for today</strong>
              <p className="muted small">Confirmed and pending visits for the current date appear here.</p>
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Patient</th>
                    <th scope="col">Doctor</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {todaySchedule.map((a) => (
                    <tr key={a._id}>
                      <td className="td-strong">{fmtTime(a.startTime)}</td>
                      <td>{a.patientName || '—'}</td>
                      <td className="td-muted">{a.doctorName || '—'}</td>
                      <td>
                        <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <p className="panel-title">Latest bookings</p>
          {latestBookings.length === 0 ? (
            <EmptyState>
              <strong>No appointments yet</strong>
              <p className="muted small">Bookings made by patients show up here as they arrive.</p>
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Booked</th>
                    <th scope="col">Slot</th>
                    <th scope="col">Patient</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {latestBookings.map((a) => (
                    <tr key={a._id}>
                      <td className="td-muted">{fmtDateTime(a.createdAt)}</td>
                      <td className="td-strong">
                        {fmtDate(a.date)}
                        <div className="td-muted">{fmtTime(a.startTime)}</div>
                      </td>
                      <td>{a.patientName || '—'}</td>
                      <td>
                        <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* =============================================================== Doctors tab */
function DoctorsTab({
  rows,
  total,
  specializations,
  filter,
  onFilter,
  busy,
  onCreate,
  onEdit,
  onToggleActive,
}) {
  return (
    <>
      <div className="filter-bar">
        <div className="field grow">
          <label className="field-label" htmlFor="doc-search">
            Search
          </label>
          <input
            id="doc-search"
            type="search"
            placeholder="Name, email, specialization…"
            value={filter.q}
            onChange={(e) => onFilter({ ...filter, q: e.target.value })}
          />
        </div>
        <div className="field mini">
          <label className="field-label" htmlFor="doc-spec">
            Specialization
          </label>
          <select
            id="doc-spec"
            value={filter.specialization}
            onChange={(e) => onFilter({ ...filter, specialization: e.target.value })}
          >
            <option value="">All specializations</option>
            {specializations.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field mini">
          <label className="field-label" htmlFor="doc-status">
            Account
          </label>
          <select
            id="doc-status"
            value={filter.status}
            onChange={(e) => onFilter({ ...filter, status: e.target.value })}
          >
            <option value="all">All accounts</option>
            <option value="active">Active only</option>
            <option value="leave">On leave</option>
            <option value="inactive">Deactivated</option>
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={onCreate} disabled={busy}>
          + Add doctor
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState>
          <strong>No doctors match these filters</strong>
          <p className="muted small">
            {total === 0
              ? 'Register the first doctor to open the directory for patients.'
              : 'Clear the search or account filter to see the rest of the directory.'}
          </p>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Doctor</th>
                <th scope="col">Specialization</th>
                <th scope="col">Fee</th>
                <th scope="col">Weekly hours</th>
                <th scope="col">State</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d._id}>
                  <td>
                    <div className="td-strong">{d.doctorName || '—'}</div>
                    <div className="td-muted">{d.email}</div>
                    {d.phone ? <div className="td-muted">{d.phone}</div> : null}
                  </td>
                  <td>
                    <div>{d.specialization}</div>
                    {d.qualification ? <div className="td-muted">{d.qualification}</div> : null}
                  </td>
                  <td className="td-strong">{fmtMoney(d.consultationFee)}</td>
                  <td>
                    {(d.availableSlots || []).length === 0 ? (
                      <span className="td-muted">No hours set</span>
                    ) : (
                      <div className="sch-chips">
                        {d.availableSlots.map((b, i) => (
                          <span className="sch-chip" key={`${d._id}-${i}`}>
                            {b.day.slice(0, 3)} {fmtTime(b.startTime)}&ndash;{fmtTime(b.endTime)} &middot;{' '}
                            {b.slotDurationMins}m
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {!d.isActive ? (
                      <Badge tone="danger">Deactivated</Badge>
                    ) : d.isAvailable ? (
                      <Badge tone="ok">Accepting</Badge>
                    ) : (
                      <Badge tone="warn">On leave</Badge>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onEdit(d)}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      {d.isActive ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => onToggleActive(d, false)}
                          disabled={busy}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => onToggleActive(d, true)}
                          disabled={busy}
                        >
                          Reactivate
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
    </>
  );
}

/* ============================================================== Patients tab */
function PatientsTab({
  rows,
  total,
  filter,
  onFilter,
  apptCountByPatient,
  busy,
  onEdit,
  onToggleActive,
}) {
  return (
    <>
      <div className="filter-bar">
        <div className="field grow">
          <label className="field-label" htmlFor="pat-search">
            Search
          </label>
          <input
            id="pat-search"
            type="search"
            placeholder="Name, email or phone…"
            value={filter.q}
            onChange={(e) => onFilter({ ...filter, q: e.target.value })}
          />
        </div>
        <div className="field mini">
          <label className="field-label" htmlFor="pat-status">
            Account
          </label>
          <select
            id="pat-status"
            value={filter.status}
            onChange={(e) => onFilter({ ...filter, status: e.target.value })}
          >
            <option value="all">All accounts</option>
            <option value="active">Active only</option>
            <option value="inactive">Deactivated</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState>
          <strong>No patient accounts match these filters</strong>
          <p className="muted small">
            {total === 0
              ? 'Patients appear here as soon as they register from the sign-up page.'
              : 'Clear the search or account filter to see every registered patient.'}
          </p>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Patient</th>
                <th scope="col">Contact</th>
                <th scope="col">Age / gender</th>
                <th scope="col">Emergency contact</th>
                <th scope="col">Visits</th>
                <th scope="col">State</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p._id}>
                  <td>
                    <div className="td-strong">{p.name}</div>
                    <div className="td-muted">Joined {fmtDateTime(p.createdAt)}</div>
                  </td>
                  <td>
                    <div>{p.email}</div>
                    <div className="td-muted">{p.phone || 'No phone'}</div>
                  </td>
                  <td>
                    {p.age ? `${p.age} yrs` : '—'}
                    <div className="td-muted">{p.gender || 'Not stated'}</div>
                  </td>
                  <td className="td-muted">{p.emergencyContact || '—'}</td>
                  <td className="td-strong">{apptCountByPatient.get(String(p._id)) || 0}</td>
                  <td>
                    {p.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onEdit(p)}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      {p.isActive ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => onToggleActive(p, false)}
                          disabled={busy}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => onToggleActive(p, true)}
                          disabled={busy}
                        >
                          Reactivate
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
    </>
  );
}

/* ========================================================== Appointments tab */
const RANGE_PRESETS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

/** The inclusive { from, to } window a preset covers, anchored on today. */
function presetRange(key) {
  const today = todayStr();
  if (key === 'week') return weekRange(today);
  if (key === 'month') return monthRange(today);
  return { from: today, to: today };
}

function AppointmentsTab({
  rows,
  total,
  doctors,
  filter,
  onFilter,
  busy,
  onConfirm,
  onComplete,
  onCancel,
  onPurge,
  onNotes,
}) {
  const dirty = filter.status || filter.doctorId || filter.from || filter.to;

  // Derived, not stored: a preset is "active" only while the range still matches it.
  const activePreset = useMemo(() => {
    if (!filter.from || !filter.to) return '';
    const hit = RANGE_PRESETS.find((p) => {
      const r = presetRange(p.key);
      return r.from === filter.from && r.to === filter.to;
    });
    return hit ? hit.key : '';
  }, [filter.from, filter.to]);

  return (
    <>
      <div className="filter-bar">
        <div className="field mini">
          <label className="field-label" htmlFor="appt-status">
            Status
          </label>
          <select
            id="appt-status"
            value={filter.status}
            onChange={(e) => onFilter({ ...filter, status: e.target.value })}
          >
            <option value="">Every status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label className="field-label" htmlFor="appt-doctor">
            Doctor
          </label>
          <select
            id="appt-doctor"
            value={filter.doctorId}
            onChange={(e) => onFilter({ ...filter, doctorId: e.target.value })}
          >
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d._id} value={d._id}>
                {d.doctorName} &middot; {d.specialization}
              </option>
            ))}
          </select>
        </div>
        <div className="field mini">
          <label className="field-label" htmlFor="appt-from">
            From
          </label>
          <input
            id="appt-from"
            type="date"
            value={filter.from}
            onChange={(e) => onFilter({ ...filter, from: e.target.value })}
          />
        </div>
        <div className="field mini">
          <label className="field-label" htmlFor="appt-to">
            To
          </label>
          <input
            id="appt-to"
            type="date"
            value={filter.to}
            onChange={(e) => onFilter({ ...filter, to: e.target.value })}
          />
        </div>
        <div className="field mini">
          <span className="field-label">Quick range</span>
          <div className="seg">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={activePreset === p.key ? 'seg-btn active' : 'seg-btn'}
                onClick={() => onFilter({ ...filter, ...presetRange(p.key) })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onFilter({ status: '', doctorId: '', from: '', to: '' })}
          disabled={!dirty}
        >
          Clear filters
        </button>
      </div>

      <p className="hint">
        Showing {rows.length} of {total} records. Status flow: Pending &rarr; Confirmed &rarr; Completed;
        cancelling at any live stage releases the slot.
      </p>

      {rows.length === 0 ? (
        <EmptyState>
          <strong>No appointment records</strong>
          <p className="muted small">
            {total === 0
              ? 'The ledger fills up as patients book slots from the doctor directory.'
              : 'No records match the current filters.'}
          </p>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Slot</th>
                <th scope="col">Patient</th>
                <th scope="col">Doctor</th>
                <th scope="col">Fee</th>
                <th scope="col">Status</th>
                <th scope="col">Clinical detail</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a._id}>
                  <td>
                    <div className="td-strong">{fmtDate(a.date)}</div>
                    <div className="td-muted">
                      {fmtTime(a.startTime)}&ndash;{fmtTime(a.endTime)}
                    </div>
                  </td>
                  <td>
                    <div>{a.patientName || '—'}</div>
                    <div className="td-muted">{a.patientPhone || ''}</div>
                  </td>
                  <td>
                    <div>{a.doctorName || '—'}</div>
                    <div className="td-muted">{a.doctorSpecialization || ''}</div>
                  </td>
                  <td className="td-strong">
                    {a.doctorId && a.doctorId.consultationFee !== undefined
                      ? fmtMoney(a.doctorId.consultationFee)
                      : '—'}
                  </td>
                  <td>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    {a.cancelledBy ? (
                      <div className="td-muted">{CANCEL_LABEL[a.cancelledBy] || 'Cancelled'}</div>
                    ) : null}
                  </td>
                  <td>
                    {a.symptoms ? <div className="td-muted">Symptoms: {a.symptoms}</div> : null}
                    {a.diagnosis ? <div className="td-muted">Diagnosis: {a.diagnosis}</div> : null}
                    {a.prescription ? <div className="td-muted">Rx: {a.prescription}</div> : null}
                    {a.consultationNotes ? (
                      <div className="td-muted">Notes: {a.consultationNotes}</div>
                    ) : null}
                    {!a.symptoms && !a.diagnosis && !a.prescription && !a.consultationNotes ? (
                      <span className="td-muted">—</span>
                    ) : null}
                  </td>
                  <td>
                    <div className="actions">
                      {a.status === 'Pending' ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => onConfirm(a)}
                          disabled={busy}
                        >
                          Confirm
                        </button>
                      ) : null}
                      {a.status === 'Confirmed' ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => onComplete(a)}
                          disabled={busy}
                        >
                          Complete
                        </button>
                      ) : null}
                      {a.status === 'Completed' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onNotes(a)}
                          disabled={busy}
                        >
                          {a.consultationNotes || a.diagnosis || a.prescription ? 'Edit record' : 'Add record'}
                        </button>
                      ) : null}
                      {a.status === 'Pending' || a.status === 'Confirmed' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onCancel(a)}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => onPurge(a)}
                        disabled={busy}
                      >
                        Purge
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ======================================================== Doctor create/edit */
function DoctorFormModal({ mode, doctor, onClose, onSaved }) {
  const editing = mode === 'edit';
  const [form, setForm] = useState(() => ({
    name: (doctor && doctor.doctorName) || '',
    email: (doctor && doctor.email) || '',
    password: '',
    phone: (doctor && doctor.phone) || '',
    specialization: (doctor && doctor.specialization) || '',
    qualification: (doctor && doctor.qualification) || '',
    consultationFee: doctor && doctor.consultationFee !== undefined ? doctor.consultationFee : '',
    isAvailable: doctor ? doctor.isAvailable : true,
  }));
  const [blocks, setBlocks] = useState(() => ((doctor && doctor.availableSlots) || []).map((b) => ({ ...b })));
  const [draft, setDraft] = useState({ day: '', startTime: '', endTime: '', slotDurationMins: 30 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addBlock() {
    if (!draft.day || !draft.startTime || !draft.endTime) {
      setError('Pick a weekday plus a start and end time before adding a block.');
      return;
    }
    if (draft.startTime >= draft.endTime) {
      setError('The end time must be later than the start time.');
      return;
    }
    const overlaps = blocks.some(
      (b) => b.day === draft.day && draft.startTime < b.endTime && b.startTime < draft.endTime
    );
    if (overlaps) {
      setError(`${draft.day} already has a working block overlapping that range.`);
      return;
    }
    setBlocks((bs) => [...bs, { ...draft, slotDurationMins: Number(draft.slotDurationMins) }]);
    setDraft({ day: '', startTime: '', endTime: '', slotDurationMins: draft.slotDurationMins });
    setError('');
  }

  function removeBlock(index) {
    setBlocks((bs) => bs.filter((_, i) => i !== index));
  }

  async function submit(e) {
    e.preventDefault();
    const fee = Number(form.consultationFee);

    if (!form.name.trim()) return setError('The doctor name is required.');
    if (!editing) {
      if (!form.email.trim()) return setError('A login email is required.');
      if (form.password.length < 6) return setError('The temporary password must be at least 6 characters.');
    }
    if (!form.specialization.trim()) return setError('Specialization is required.');
    if (form.consultationFee === '' || Number.isNaN(fee) || fee < 0) {
      return setError('Enter a consultation fee of zero or more.');
    }
    if (blocks.length === 0) return setError('Add at least one weekly working block so patients can book.');
    if (blocks.some((b) => !blockValid(b))) return setError('Every working block needs a day, times and a slot length.');

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      specialization: form.specialization.trim(),
      qualification: form.qualification.trim(),
      consultationFee: fee,
      isAvailable: form.isAvailable,
      availableSlots: blocks,
    };

    setBusy(true);
    setError('');
    try {
      if (editing) {
        await api.patch(`/doctors/${doctor._id}`, payload);
        await onSaved(`${payload.name} updated`);
      } else {
        await api.post('/doctors', {
          ...payload,
          email: form.email.trim(),
          password: form.password,
        });
        await onSaved(`${payload.name} added to the doctor directory`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit doctor profile' : 'Register a new doctor'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <ErrorBanner error={error} />

        <div className="form-grid">
          <div className="field">
            <span className="field-label">Full name</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Dr. Jane Doe" />
          </div>
          <div className="field">
            <span className="field-label">Login email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="doctor@hospital.com"
              disabled={editing}
            />
          </div>
          {editing ? null : (
            <div className="field">
              <span className="field-label">Temporary password</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
          )}
          <div className="field">
            <span className="field-label">Phone</span>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Contact number" />
          </div>
          <div className="field">
            <span className="field-label">Specialization</span>
            <input
              value={form.specialization}
              onChange={(e) => set('specialization', e.target.value)}
              placeholder="Cardiologist"
            />
          </div>
          <div className="field">
            <span className="field-label">Qualification</span>
            <input
              value={form.qualification}
              onChange={(e) => set('qualification', e.target.value)}
              placeholder="MBBS, MD"
            />
          </div>
          <div className="field">
            <span className="field-label">Consultation fee (Rs.)</span>
            <input
              type="number"
              min={0}
              value={form.consultationFee}
              onChange={(e) => set('consultationFee', e.target.value)}
            />
          </div>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => set('isAvailable', e.target.checked)}
          />
          Listed in the directory and accepting appointments
        </label>

        <hr className="divider" />

        <p className="panel-title">Weekly working hours</p>
        <p className="hint">
          Each block is split into equal slots, so 09:00&ndash;13:00 at 30 minutes creates eight bookable slots on
          that weekday.
        </p>

        {blocks.length === 0 ? (
          <EmptyState>
            <strong>No working hours yet</strong>
            <p className="muted small">Add at least one block before saving.</p>
          </EmptyState>
        ) : (
          <div className="stack">
            {blocks.map((b, i) => (
              <div className="row-between schedule-row" key={`${b.day}-${b.startTime}-${i}`}>
                <div className="schedule-day">{b.day}</div>
                <div className="schedule-time">
                  {fmtTime(b.startTime)} &ndash; {fmtTime(b.endTime)} &middot; {b.slotDurationMins} min slots
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeBlock(i)} disabled={busy}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <span className="field-label">Weekday</span>
            <select value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })}>
              <option value="">Select a day…</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field-label">Slot length</span>
            <select
              value={draft.slotDurationMins}
              onChange={(e) => setDraft({ ...draft, slotDurationMins: Number(e.target.value) })}
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} minutes
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field-label">Start</span>
            <input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
          </div>
          <div className="field">
            <span className="field-label">End</span>
            <input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
          </div>
        </div>

        <div className="actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={addBlock} disabled={busy}>
            + Add working block
          </button>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create doctor account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ============================================================= Patient edit */
function PatientEditModal({ patient, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: patient.name || '',
    phone: patient.phone || '',
    age: patient.age === undefined || patient.age === null ? '' : patient.age,
    gender: patient.gender || '',
    address: patient.address || '',
    emergencyContact: patient.emergencyContact || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('The patient name cannot be empty.');
    if (form.age !== '' && (Number(form.age) < 0 || Number(form.age) > 130)) {
      return setError('Age must be between 0 and 130.');
    }

    setBusy(true);
    setError('');
    try {
      await api.patch(`/patients/${patient._id}`, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        age: form.age === '' ? undefined : Number(form.age),
        gender: form.gender,
        address: form.address.trim(),
        emergencyContact: form.emergencyContact.trim(),
      });
      await onSaved(`${form.name.trim()} updated`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit patient record" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBanner error={error} />
        <p className="hint">{patient.email} &middot; registered {fmtDateTime(patient.createdAt)}</p>

        <div className="form-grid">
          <div className="field">
            <span className="field-label">Full name</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="field">
            <span className="field-label">Phone</span>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="field">
            <span className="field-label">Age</span>
            <input type="number" min={0} max={130} value={form.age} onChange={(e) => set('age', e.target.value)} />
          </div>
          <div className="field">
            <span className="field-label">Gender</span>
            <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">Not stated</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="field">
            <span className="field-label">Emergency contact</span>
            <input value={form.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} />
          </div>
          <div className="field field-wide">
            <span className="field-label">Address</span>
            <textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ======================================================== Consultation record */
function NotesModal({ appointment, onClose, onSaved }) {
  const [record, setRecord] = useState({
    notes: appointment.consultationNotes || '',
    diagnosis: appointment.diagnosis || '',
    prescription: appointment.prescription || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(key, value) {
    setRecord((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    const payload = {
      notes: record.notes.trim(),
      diagnosis: record.diagnosis.trim(),
      prescription: record.prescription.trim(),
    };
    if (!payload.notes && !payload.diagnosis && !payload.prescription) {
      return setError('Fill in at least one of diagnosis, prescription or notes.');
    }

    setBusy(true);
    setError('');
    try {
      await api.patch(`/appointments/${appointment._id}/notes`, payload);
      await onSaved('Consultation record saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Consultation record" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBanner error={error} />
        <p className="hint">
          {appointment.patientName} with {appointment.doctorName} &middot; {fmtDate(appointment.date)}{' '}
          {fmtTime(appointment.startTime)}
        </p>
        <div className="field field-wide">
          <span className="field-label">Diagnosis</span>
          <input type="text" value={record.diagnosis} onChange={(e) => set('diagnosis', e.target.value)} />
        </div>
        <div className="field field-wide">
          <span className="field-label">Prescription</span>
          <textarea rows={3} value={record.prescription} onChange={(e) => set('prescription', e.target.value)} />
        </div>
        <div className="field field-wide">
          <span className="field-label">Consultation notes and follow-up</span>
          <textarea rows={4} value={record.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
        <p className="hint">
          Doctors may only edit the record for 24 hours after a consultation; administrators can correct it at any
          time.
        </p>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save record'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
