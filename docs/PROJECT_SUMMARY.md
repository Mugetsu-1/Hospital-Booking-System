# Hospital Doctor Appointment Booking System — Project Summary

**Software Engineering Lab Project — Technical Report & Summary**

| | |
| :--- | :--- |
| **Project** | Hospital Doctor Appointment Booking System |
| **Repository** | `Mugetsu-1/Hospital-Booking-System` |
| **Type** | Single-student software engineering lab project |
| **Stack** | React 18 + Vite · Node.js + Express 4 · MongoDB (Mongoose 8) |
| **Optional services** | Redis cache · Socket.IO realtime · Nodemailer SMTP (all fail-open) |
| **Verification** | 21 unit tests + 72 end-to-end API assertions, all passing |

---

## 1. Cover & Abstract

The Hospital Doctor Appointment Booking System is a full-stack web application
that lets patients discover doctors, view computed availability slots and book,
reschedule or cancel appointments under real-world business constraints. Doctors
run a day/week/month consultation queue, confirm or complete visits, and record
diagnosis, prescription and consultation notes within a governed 24-hour edit
window. Administrators manage the doctor directory, patient accounts and the
hospital-wide appointment ledger, including soft-delete and medical-record purge
workflows.

The system was engineered as a software-engineering exercise: requirements were
modelled (use cases, DFDs, ERD, sequence diagrams), the database was designed
around a concurrency-safe slot model, REST APIs were layered with
authentication, role-based access control and request validation, and the
behaviour was verified with automated unit and end-to-end test suites.

## 2. Introduction & Scope

### Problem statement

Hospitals operate on appointment books that are surprisingly easy to corrupt:
two patients can be handed the same slot, doctors have no single view of their
queue, cancellation policies are applied ad hoc, and the consultation outcome
(notes, prescriptions) is frequently lost or uneditable after the visit. These
are classic software-engineering failure modes: unclear requirements, missing
data-consistency constraints and unverifiable behaviour.

### Objectives

1. Provide a single directory of doctors with searchable specialisation, fee
   and weekday schedules.
2. Expose *computed* available slots from weekly working blocks, never
   free-text time entry.
3. Guarantee no double-booking — even under concurrent requests.
4. Enforce a documented lifecycle: `Pending → Confirmed → Completed` or
   `Cancelled`, plus a 2-hour cancellation cutoff and a 24-hour notes window.
5. Separate patient, doctor and administrator duties with JWT + RBAC.
6. Verify everything with repeatable automated tests.

### Scope limits

Single-student, single-semester scope: one hospital organisation, no
multi-tenant isolation, no payment gateway, no production SMTP by default, and
a demo dataset for Local-first development. Resilience is engineered so that
the optional Redis / Socket.IO / e-mail layers can be absent without affecting
core booking behaviour.

---
## 3. Software Requirements Specification (SRS)

### 3.1 Patient Management Module

| CRUD | Requirement | Endpoint |
| :--- | :--- | :--- |
| **Create** | Register profile: name, email, password, phone, age, gender, address, emergency contact | `POST /api/auth/register` |
| **Read** | View own profile; view own appointment history & consultation records | `GET /api/patients/:id`, `GET /api/appointments/my` |
| **Update** | Edit contact info, address, emergency contact | `PATCH /api/patients/:id` |
| **Delete** | Soft-delete / deactivate account (historical records preserved) | `DELETE /api/patients/:id` (admin) |

### 3.2 Doctor & Schedule Management Module

| CRUD | Requirement | Endpoint |
| :--- | :--- | :--- |
| **Create** | Admin creates doctor account + directory profile (specialisation, qualification, fee, weekly blocks) | `POST /api/doctors` (admin) |
| **Read** | Patients search/filter by name, specialisation, weekday, fee ceiling; single profile; computed slot grid | `GET /api/doctors`, `GET /api/doctors/:id`, `GET /api/doctors/:id/slots?date=` |
| **Update** | Doctor edits own weekly hours, fee, availability; admin may edit names | `PATCH /api/doctors/:id` |
| **Delete** | Admin deactivates / reactivates (soft delete) | `PATCH /api/doctors/:id/status` |

### 3.3 Appointment Booking Lifecycle

| CRUD | Requirement | Endpoint |
| :--- | :--- | :--- |
| **Create** | Patient selects doctor, date + computed slot, submits symptoms | `POST /api/appointments` |
| **Read** | Patient: own history (status/date filters); Doctor: day/week/month queue; Admin: whole ledger | `GET /api/appointments/my` · `/appointments/doctor` · `/appointments` |
| **Update** | Patient reschedules (back to Pending); Doctor/Admin drive `Pending → Confirmed → Completed / Cancelled` | `POST /:id/reschedule`, `PATCH /:id/status` |
| **Delete** | Patient/Doctor/Admin cancel (releases slot); Admin purges record permanently | `POST /:id/cancel`, `DELETE /:id` |

### 3.4 Consultation & Medical Notes Module

| CRUD | Requirement | Endpoint |
| :--- | :--- | :--- |
| **Create** | Doctor attaches diagnosis, prescription, notes when completing | `PATCH /:id/status` + record fields |
| **Read** | Patient reads record for completed visits | `GET /api/appointments/my`, `GET /:id` |
| **Update** | Doctor edits record within 24 h of visit end (admin anytime) | `PATCH /:id/notes` |
| **Delete** | Admin purges duplicate / misfiled entries | `DELETE /:id` |

### 3.5 Non-Functional Requirements

| NFR | Requirement | Evidence |
| :--- | :--- | :--- |
| **Security** | bcrypt hashing (10 rounds), signed JWT, RBAC role gates, inactive-account blocks | `middleware/auth.js`, `models/User.js` |
| **Performance** | Read-heavy endpoints served < 200 ms via read-through Redis cache (optional) | `utils/cache.js` — slot grids + directory |
| **Usability** | Responsive UI, toasts, confirm modals, skeleton loaders, instant realtime refresh | `context/ToastContext.jsx`, `components/Skeleton.jsx` |
| **Reliability** | Atomic slot collision check + partial unique index; fail-open optional services | `models/Appointment.js`, `services/*` |
| **Testability** | Offline unit suite + full HTTP e2e suite | `tests/` (21 + 72 assertions) |

## 4. System Modeling

All diagrams live in [`docs/`](./README.md) as Mermaid sources (GitHub renders
them as images):

| Model | Diagram |
| :--- | :--- |
| Use Case | [`docs/use-case.md`](./use-case.md) |
| DFD Level 0 (context) | [`docs/dfd-context.md`](./dfd-context.md) |
| DFD Level 1 | [`docs/dfd-level1.md`](./dfd-level1.md) |
| DFD Level 2 (booking engine) | [`docs/dfd-level2-booking.md`](./dfd-level2-booking.md) |
| ERD | [`docs/erd.md`](./erd.md) |
| Sequence | [`docs/sequence-diagrams.md`](./sequence-diagrams.md) |
| Architecture | [`docs/architecture.md`](./architecture.md) |

## 5. Database Design

MongoDB (Mongoose) with three collections — full field definitions in
[`docs/erd.md`](./erd.md).

| Collection | Purpose | Key fields |
| :--- | :--- | :--- |
| `Users` | Credentials + profile for all roles | `name, email (unique), passwordHash, role, phone, isActive` |
| `Doctors` | Directory + schedule, linked to a user | `userId (unique), specialization, consultationFee, availableSlots[], isAvailable, isActive` |
| `Appointments` | Bookings + consultation records | `patientId, doctorId, date, startTime, endTime, dateTime, status, diagnosis, prescription, consultationNotes, cancelledBy` |

**Concurrency design decision.** The `(doctorId, date, startTime)` triple has a
*partial* unique index that only includes `Pending` / `Confirmed` documents.
Cancelling an appointment therefore releases its slot automatically, and two
simultaneous requests for the same slot can never both succeed — the second
gets a duplicate-key `409`.

---
## 6. Architecture & Stack

Layered client–server architecture (full diagram: [`docs/architecture.md`](./architecture.md)).

| Layer | Technology | Notes |
| :--- | :--- | :--- |
| Presentation | React 18 + Vite 5 + React Router 6, Axios | `pages/` per role, shared `components/`, `context/` session, `api/client.js` |
| Application | Node.js + Express 4 | `routes/` → `controllers/` → `models/`; `middleware/` for auth, RBAC, validation, errors |
| Data | MongoDB + Mongoose 8 | `Users`, `Doctors`, `Appointments` |
| Cache *(optional)* | Redis | Read-through for doctor lists & slot grids; prefix invalidation on writes; 60 s TTL safety net |
| Realtime *(optional)* | Socket.IO | Same HTTP port, JWT handshake; lightweight `slots:changed` / `appointment:*` triggers; clients refetch via REST |
| Notifications *(optional)* | Nodemailer | HTML booking/reschedule/cancel/status/notes e-mails; console-log fallback |
| CI/CD | GitHub Actions | `.github/workflows/main.yml` — install, lint (if present), unit tests, production build |

**Fail-open principle.** None of the optional layers is a hard dependency:
`REDIS_URL` unset → direct Mongo reads; SMTP unset → mail logs and skips;
Socket.IO unavailable → client falls back to REST-only. This keeps local
development (and grading) deterministic while the architecture still
demonstrates modern production patterns.

## 7. Implementation

### Backend layout

```
backend/src/
  config/       env + policy knobs (cancel cutoff, notes window, cache TTL)
  models/       User, Doctor, Appointment (+ partial unique slot index)
  controllers/  auth, patients, doctors, appointments
  middleware/   auth (JWT + RBAC), validate (express-validator), errorHandler
  routes/       Express routers mounted under /api
  utils/        pure slot-grid & date helpers, typed errors, Redis cache wrapper
  services/     realtime (Socket.IO), mailer (Nodemailer)
scripts/seed.js demo hospital (1 admin, 4 doctors, 3 patients, sample bookings)
```

### Frontend layout

```
frontend/src/
  pages/        patient/ (browse, appointments, profile), doctor/, admin/, Login, Register
  components/   ui primitives, Protected route guard, Skeleton loaders
  context/      AuthContext (session), ToastContext (notifications)
  api/          axios client (JWT interceptor, 401 cleanup)
  realtime.js   Socket.IO client (fail-open)
```

### Security implementation

- **Passwords** — bcrypt, 10 salt rounds; hash never serialised (`select:false`
  + JSON transform), verified by e2e `SEC-03`.
- **Sessions** — signed JWT (`HS256` via `jsonwebtoken`), 7-day expiry, Bearer
  header; `requireAuth` reloads the user and blocks deactivated accounts.
- **RBAC** — `requireRole('patient' | 'doctor' | 'admin')` on top of `requireAuth`;
  all cross-role cases are asserted in the e2e suite (SEC-06 … SEC-17).
- **Validation** — express-validator chains on every POST/PATCH; nested rules
  for doctor weekly blocks (`availableSlots.*`); uniform 400 shape
  `{ error, details[] }`.
- **Concurrency** — described in §5; verified by a real two-request race test.

### Optional-service wiring

- **Redis cache** — `getJSON/setJSON/delPrefix` no-op when disabled; doctor
  listing cached per query signature, slot grids per `doctor:date`; every write
  invalidates the affected prefixes (appointments → `slots:<doctorId>`,
  doctor writes → directory + all slots).
- **Socket.IO** — handshake middleware verifies the JWT; rooms `user:<id>` and
  `role:<role>`; mutations publish minimal triggers; clients refetch.
- **Nodemailer** — transport built only when configured; HTML templates for
  booking, reschedule, cancel, status and notes-ready events.

---
## 8. Testing & QA

Full black-box matrix, equivalence partitioning and boundary-value analysis:
**[`backend/tests/TEST_MATRIX.md`](../backend/tests/TEST_MATRIX.md)**.

| Suite | Command | Coverage | Result |
| :--- | :--- | :--- | :--- |
| Unit (offline) | `npm test` | Slot-grid maths (grid expansion, eligibility, past-slot dropping), date validation, status-transition state machine | **21/21 pass** |
| End-to-end | `npm run test:e2e` | Auth & sessions, RBAC (14 negative cases), directory & filters, slot computation, double-booking + race, lifecycle & 24 h window (time-travelled), cutoff, reschedule & slot release, purge, profile CRUD, registration | **72/72 pass** |
| Build | `npm run build` | Frontend production bundle | passes (134 modules) |

Highlight assertions:

- **TC-13** — two concurrent HTTP requests for one slot: exactly one `201`,
  the other `409` (unique-index backstop).
- **TC-22 / TC-21** — the 2-hour cancellation cutoff and the 24-hour notes
  window are exercised by moving documents backwards in Mongo ("time travel"),
  so no real waiting is needed.
- **SEC-01 … SEC-17** — every unauthorized-access class returns 401/403/404
  as specified, including role-escalation attempts.

## 9. Screen Captures

The [`screenshots/`](../screenshots/README.md) folder defines the capture
checklist — patient, doctor and admin journeys (registration, doctor search,
slot picker, booking modal, confirm/cancel modals, queue views, ledger, purge
flow) plus optional evidence for realtime slot updates, toasts and skeletons.
Seed accounts: `admin@hospital.com / Admin@123`, `mehta@hospital.com /
Doctor@123`, `alice@example.com / Patient@123`.

## 10. Conclusion

### Summary of work

A production-shaped appointment booking system was architected, implemented and
verified end to end. The project exercises the full software-engineering
lifecycle: requirement capture and modelling (use cases, DFD L0–L2, ERD,
sequence), schema design with a concurrency-safe partial unique index,
layered REST implementation with JWT/RBAC and request validation, an optional
performance/realtime/notification tier (Redis, Socket.IO, Nodemailer) that is
fail-open by design, and automated black-box verification with 93 passing
assertions plus a documented test matrix.

### Learning outcomes

- Turning a business rule ("a slot cannot be double-booked") into a *database*
  constraint plus an application check, and proving it under concurrency.
- Modelling a document database without losing relational integrity
  (foreign-key references + `populate()`).
- Designing state machines (lifecycle transitions, cancellation cutoff, notes
  window) and making them testable with time-travel fixtures.
- Layering auth: JWT sessions, RBAC gates, ownership checks — and verifying
  each with negative tests.
- Engineering resilient integrations: every optional service degrades to a
  no-op fallback, so the core system never depends on infrastructure it cannot
  control.

---

*Repository: Mugetsu-1/Hospital-Booking-System — `README.md` for setup, `docs/`
for all diagrams and this summary, `backend/tests/TEST_MATRIX.md` for QA.*