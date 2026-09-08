# Session Summary — Hospital Doctor Appointment Booking System

Project: `d:\SEPrj` · MERN (Express + Mongoose + React 18/Vite) · Software Engineering lab deliverable

This document records everything done in this working session, from the starting
state to the final verified build.

---

## 1. Where the project started

| Area | State at the start of the session |
| :--- | :--- |
| Backend | Essentially complete — JWT + bcrypt auth, RBAC, slot-grid maths, partial unique index, status transition graph, 2 h cancel cutoff, 24 h notes window |
| Frontend | **Would not build.** `App.jsx` imported `pages/admin/AdminDashboard`, but that folder was empty |
| Database | MongoDB not installed; the app had never been run |
| Tests | 13 offline unit tests; no integration coverage |
| Report | `gemini-code-1788601228978.md` complete only through §3.1, truncated mid-heading at "3.2 System Architecture Diagram" |
| Guidelines | `ACHS Software Engineering lab guideliness.md` — a 111-byte fragment listing the required report structure |

Two API gaps against the SRS were found in the initial audit: no admin purge
endpoint (Module 4 · Delete), and `updateDoctor` only synced the linked user's
phone when the doctor edited themselves, so an admin could not correct a
doctor's name.

---

## 2. Implementation work

### 2.1 The admin role (the largest single piece)

Wrote [AdminDashboard.jsx](frontend/src/pages/admin/AdminDashboard.jsx) — ~1,419
lines — which unblocked the build and delivered the entire administrator role:

* **Overview** — KPI tiles (active doctors, doctors on leave, active patients,
  today's live appointments, per-status counts, completed-visit revenue), today's
  schedule, latest bookings.
* **Doctors tab** — search / specialization / account filters, weekly schedule
  chips, create-and-edit modal containing a working-block editor with overlap
  validation, deactivate / reactivate.
* **Patients tab** — search and account filters, per-patient visit counts, edit,
  deactivate / reactivate.
* **Appointments tab** — status / doctor / date-range filters with a Clear
  button and **Day / Week / Month** quick-range presets, status-appropriate
  Confirm / Complete / Cancel actions, clinical-record correction, hard purge.

Every mutation funnels through one `run()` helper (busy flag, error banner,
success notice, reload) and every destructive action goes through a confirmation
modal that names the exact record.

### 2.2 Backend additions and fixes

* `DELETE /api/appointments/:id` — admin hard purge; returns a snapshot of the
  destroyed document and notes slot release when the record was live.
* `canMutate` rewritten to take `{ adminBypass, allowDoctor }`, closing an
  authorization gap where the shared cancel/reschedule guard did not distinguish
  the assigned doctor from any doctor.
* `updateDoctor` now applies a `userPatch` (phone for self or admin, name for
  admin with non-empty validation) and returns a re-populated summary.
* `listForDoctor` accepts `from`/`to` in addition to `date`, using a
  lexicographic range on the `date` string so it stays on the `doctorId + date`
  index.
* `isRealDate()` added to `utils/slots.js` (UTC round-trip validation) and
  adopted everywhere a date string enters the system, replacing shape-only
  regex checks.
* `refId()` helper added to the appointment controller and applied at every
  ownership comparison.

### 2.3 Closing the two SRS conformance gaps

**Structured clinical records.** `consultationNotes` became three fields —
`diagnosis`, `prescription`, `consultationNotes` — matching SRS Module 4, which
asks for "consultation notes, prescriptions, and diagnosis details". A
`consultationPatch()` helper validates them centrally: at least one field must be
supplied, non-strings are rejected, and the merged record may not end up
completely blank. All three surfaces were updated — the doctor's complete-visit
and edit modals share a new `ConsultationFields` component, the admin's record
modal, and the patient's details view.

**Ranged doctor schedules.** SRS Module 3 · Read asks for "daily, weekly, and
monthly appointment schedules" for **doctors and admins**. The doctor dashboard
gained a Day / Week / Month segmented toggle with `weekRange`, `monthRange` and
`addMonths` helpers, a `step()` control that moves by the active unit, a header
showing the active range and total, and per-row dates in the multi-day views. The
admin ledger gained the same three ranges as quick-range presets over its existing
`From`/`To` filter — the active preset is derived by comparing the current range
against each preset, so editing a date by hand simply de-highlights all three and
keeps the arbitrary range.

### 2.4 Smaller fixes

* Removed `min={todayStr()}` from the doctor's date input — a doctor could not
  look back at past appointments.
* `VITE_API_URL` support in the axios client (with `frontend/.env.example`) so a
  production build can point at a non-proxied API.
* Nine missing CSS classes added to `styles.css` (`stack`, `check`,
  `alert-warn`, `appt-info`, `appt-side`, `schedule-row`, `schedule-day`,
  `schedule-time`, `modal-footer`) plus `h1/h2.page-title`, found by diffing
  `className` usage against the stylesheet.
* Rotated the placeholder `JWT_SECRET` to 62 random characters.

---

## 3. Getting it running end to end

1. Installed **MongoDB 8.3** as a Windows service.
2. Installed root dev dependencies and the frontend's 91 packages.
3. Seeded the demo hospital: 1 admin, 4 doctors (one deliberately on leave so the
   directory filter is visible), 3 patients, 1 pending appointment.
4. Started the API on `:5000` and Vite on `:5173`.
5. Drove **every screen for all three roles in a real browser** — patient
   booking, reschedule, cancellation and record viewing; the doctor's
   Day/Week/Month views, confirmation and consultation record; the
   administrator's KPIs, doctor creation, ledger filters, record correction and
   purge; plus self-service registration.

---

## 4. Six real defects found and fixed

All six survived code review and the unit tests. Every one was caught by actually
exercising the running system.

| # | Defect | Root cause | Caught by |
| :-: | :--- | :--- | :--- |
| 1 | Patients and the assigned doctor got `403` reading **their own** appointment | `ObjectId.equals()` returns `false` when handed a *populated* Mongoose document instead of an id | E2E suite |
| 2 | Impossible dates such as `2026-13-40` were accepted | Shape-only regex; `Date.UTC` silently rolls over into a different real day | E2E suite |
| 3 | Patient **reschedule** was completely broken | A populated `doctorId` object interpolated into a URL became `/doctors/[object Object]/slots` | Browser |
| 4 | Doctor header rendered `Dr. Dr. Priya Sharma` | Hardcoded prefix on top of the stored title | Browser |
| 5 | Literal `&middot;` / `&amp;` shown in the UI | HTML entities only decode in JSX *text children*, not template literals or string props | Browser |
| 6 | `POST /api/doctors` returned empty `doctorName`, `email`, `phone` | The new document was summarised before `userId` was populated | E2E suite |

Defects 1 and 3 are the same mistake on opposite sides of the wire — a populated
reference used where an identifier was expected, which fails silently rather than
throwing. Both now funnel through a single helper: `refId()` on the server,
`idOf()` on the client.

---

## 5. Testing

### Unit tests: 13 → 21

* Added `tests/transitions.test.js` — 7 tests for `Appointment.canTransition`
  (status vocabulary, legal transitions, terminal states, no-op rejection,
  unknown-state safety).
* Added a 10-assertion `isRealDate` test to `tests/slots.test.js`.
* Offline by design: no database required, so `npm test` runs anywhere.

### New end-to-end API suite: 72 assertions

Built [api.e2e.js](backend/tests/e2e/api.e2e.js) (~710 lines) and wired it to
`npm run test:e2e`. It drives the real HTTP API exactly as the browser does, and
additionally opens a Mongo connection so it can move an appointment's `dateTime`
backwards — the only practical way to test the 2 h cancellation cutoff and the
24 h notes window without waiting for real time to pass.

| § | Area | Assertions |
| :-: | :--- | :-: |
| A | Authentication and session | 7 |
| B | Role-based access control | 4 |
| C | Directory and computed slots | 7 |
| D | Booking, validation, concurrency | 9 |
| E | Lifecycle and clinical record | 12 |
| F | Policy windows (time travel) | 4 |
| G | Reschedule, release, ranged views | 9 |
| H | Admin purge | 2 |
| I | Profiles, doctor admin, leave | 15 |
| J | Registration | 3 |
| | **Total** | **72** |

Section D includes a genuine **simultaneous race** — two `Promise.all` bookings
for one slot — proving exactly one winner and one `409`. A teardown hard-deletes
everything the suite creates and restores every field it mutates, so it is
re-runnable: two consecutive runs with no reseed give the same result. It exits
non-zero on the first failure, so it doubles as a regression gate. It is named
`*.e2e.js` rather than `*.test.js` precisely so `npm test` stays database-free.

---

## 6. Documentation

### The lab report ([gemini-code-1788601228978.md](gemini-code-1788601228978.md))

Written from §3.2 through §10 — now 1,084 lines covering the structure the lab
guidelines require. It documents the **as-built** system, not the original plan:

* System architecture, layered backend structure and a booking request lifecycle.
* Use case diagram, context diagram (DFD 0), level-1 DFD, appointment state
  transition diagram, cancellation activity diagram, ER diagram — all as Mermaid.
* Collection specifications, design rationale, and the indexing strategy centred
  on the partial unique index.
* A 26-endpoint REST catalogue, RBAC matrix, the slot-derivation algorithm,
  business policy table, and security implementation notes.
* §7 was later **rewritten from an unexecuted checklist into an executed-results
  chapter**: a 22-row functional evidence table, a requirements traceability
  matrix, 19 negative/security cases, a new §7.7 documenting the E2E suite with
  real per-section assertion counts, and a new §7.8 defect log covering all six
  defects with root cause, impact and how each was caught.
* Corrected against reality throughout: Node 24 and MongoDB 8.3 in §3.1, the ER
  diagram and data dictionary for the three record fields, response-shape
  exceptions in the API catalogue, the repository layout, the script list, and
  §10's summary and learning outcomes.

### The README ([README.md](README.md))

New, 164 lines, so the project can be run without reading the report:
prerequisites, `npm run setup`, the environment-variable table, `npm run seed`
with the demo-credentials table, `npm run dev`, the three verification commands,
per-role capability lists, the project layout and four troubleshooting entries.

---

## 7. Final verification

| Check | Result |
| :--- | :--- |
| `npm test` | **21 tests, 21 pass, 0 fail** |
| `npm run test:e2e` | **72 passed, 0 failed** — twice consecutively without reseeding |
| `npm run build` | 102 modules, 292.49 kB JS + 12.60 kB CSS, **89.27 kB gzipped**, 661 ms |
| IDE diagnostics | clean on every touched file |
| Manual walkthrough | all three roles, all screens; the admin quick ranges re-verified in the browser |

Delivered capabilities per role:

| Role | Screen | Capabilities |
| :--- | :--- | :--- |
| Patient | My Appointments | Status filters, reschedule, cancel, symptom review, clinical-record viewer, cutoff-aware controls |
| Patient | Browse Doctors | Specialization / fee / working-day filters, per-date live slot grid, booking with symptoms |
| Patient | Profile | Contact, address and emergency-contact maintenance |
| Doctor | Dashboard | Day / Week / Month schedule views, Confirm / Complete, cancel, structured clinical record with the 24 h window, weekly working-block editor, leave toggle |
| Admin | Dashboard | Overview KPIs, doctor CRUD with schedule editor, patient administration, appointment ledger with filters and Day / Week / Month quick ranges, status transitions, cancel, record correction, hard purge |

---

## 8. SRS conformance — all sixteen CRUD operations

Every operation is reachable through the user interface; none of them need a REST
client to exercise.

| SRS requirement | Delivered as |
| :--- | :--- |
| M1 · C Register patient | `POST /api/auth/register` + the public sign-up form |
| M1 · R View profile, history and statuses | Profile screen + My Appointments |
| M1 · U Edit contact / address / emergency contact | Profile screen |
| M1 · D Soft-delete patient | Admin deactivate (`isActive = false`, history preserved) |
| M2 · C Register doctor with specialization, qualification, fee, hours | Admin "Add doctor" modal with the working-block editor |
| M2 · R Search directory by specialization / fee / working day | Browse Doctors filters (`?specialization=&maxFee=&day=&q=`) |
| M2 · U Modify availability, break times, away status | Doctor schedule editor — **breaks are the gaps between two blocks on the same day**, e.g. 09:00–13:00 plus 14:00–15:00 leaves 13:00–14:00 unbookable — plus the leave toggle |
| M2 · D Remove from active directory | Admin deactivate (`PATCH /doctors/:id/status`) |
| M3 · C Book with symptoms | Slot grid + booking modal |
| M3 · R Daily, weekly, monthly schedules | Doctor Day/Week/Month toggle **and** admin quick ranges |
| M3 · U Reschedule before cutoff | Reschedule modal, 2 h server-enforced cutoff |
| M3 · U Status transitions | Doctor and admin Confirm / Complete / Cancel, validated by the transition graph |
| M3 · D Cancel and return the slot to the pool | Cancel action; the partial unique index only covers live statuses, so release is automatic |
| M4 · C Add diagnosis, prescription, notes | Complete-visit modal with three fields |
| M4 · R Patient reads past records | My Appointments details modal |
| M4 · U Edit within 24 h | Edit-record modal, server-enforced window, admin bypass |
| M4 · D Purge inaccurate records | Admin hard purge with confirmation |

Non-functional: bcrypt at 10 rounds and stateless JWT ✓ · concurrency lock via
the partial unique index, proven by the simultaneous-booking race ✓ · responsive
CSS for desktop and mobile ✓ · the sub-200 ms read target is met by design
(indexed queries, derived availability) but is **not** load-tested.

---

## 9. File inventory

**Created**

| File | Purpose |
| :--- | :--- |
| `frontend/src/pages/admin/AdminDashboard.jsx` | The entire admin role (~1,419 lines) |
| `backend/tests/transitions.test.js` | Status transition graph unit tests |
| `backend/tests/e2e/api.e2e.js` | 72-assertion end-to-end API suite |
| `README.md` | Setup, run and verification guide |
| `frontend/.env.example` | Documents `VITE_API_URL` |
| `summary.md` | This document |

**Modified**

| File | Change |
| :--- | :--- |
| `backend/src/controllers/appointmentController.js` | Purge endpoint, `canMutate` rewrite, `refId()`, `from`/`to` ranges, `consultationPatch()`, three-field record handling |
| `backend/src/controllers/doctorController.js` | Admin name/phone sync, `isRealDate` guard on slots, populate fix in `createDoctor` |
| `backend/src/routes/appointmentRoutes.js` | Registered the purge route |
| `backend/src/models/Appointment.js` | Added `diagnosis` and `prescription` |
| `backend/src/utils/slots.js` | `DATE_RE` + `isRealDate()` |
| `backend/tests/slots.test.js` | `isRealDate` coverage |
| `backend/.env` | Rotated `JWT_SECRET` |
| `backend/package.json`, `package.json` | Added the `test:e2e` script |
| `frontend/src/pages/doctor/DoctorDashboard.jsx` | Day/Week/Month views, `ConsultationFields`, past-date fix, `Dr.` and entity fixes |
| `frontend/src/pages/patient/MyAppointments.jsx` | Reschedule fix, diagnosis and prescription rows |
| `frontend/src/utils/helpers.js` | `idOf`, `weekRange`, `monthRange`, `addMonths` |
| `frontend/src/api/client.js` | `VITE_API_URL` support |
| `frontend/src/pages/admin/AdminDashboard.jsx` | Three-field record modal, shared `idOf`, Day / Week / Month quick ranges |
| `frontend/src/styles.css` | Nine missing classes + page-title rules |
| `gemini-code-1788601228978.md` | §3.2–§10 written, then §7 rewritten as executed results |

---

## 10. Task checklist — 20 of 20 planned tasks complete, plus one follow-up

| # | Task | Status |
| :-: | :--- | :--- |
| 1 | Audit backend and frontend against the SRS | done |
| 2 | Build the missing AdminDashboard page | done |
| 3 | Add the admin purge endpoint | done |
| 4 | Add missing CSS classes | done |
| 5 | Run backend unit tests | done |
| 6 | Install frontend deps and run a production build | done |
| 7 | Complete the lab report documentation | done |
| 8 | Install MongoDB Community Server | done |
| 9 | Install root dev dependencies | done |
| 10 | Replace the placeholder JWT secret | done |
| 11 | Seed the database and boot both servers | done |
| 12 | Smoke test all three roles in the browser | done |
| 13 | Fix the doctor date-picker past-date block | done |
| 14 | Add weekly and monthly doctor schedule views | done |
| 15 | Add structured diagnosis and prescription fields | done |
| 16 | Execute the documented functional and security test cases | done |
| 17 | Write a root README | done |
| 18 | Support `VITE_API_URL` for production builds | done |
| 19 | Sync the lab report with the shipped changes | done |
| 20 | Run final regression and cleanup | done |
| — | Add Day / Week / Month quick ranges to the admin ledger (found by the closing SRS re-audit) | done |

---

## 11. How to run it

```bash
npm run setup   # root + backend + frontend dependencies
npm run seed    # demo hospital (resets the three collections)
npm run dev     # API on :5000, SPA on :5173
```

| Role | Email | Password |
| :--- | :--- | :--- |
| Admin | `admin@hospital.com` | `Admin@123` |
| Doctor | `mehta@hospital.com` | `Doctor@123` |
| Patient | `alice@example.com` | `Patient@123` |

Verification:

```bash
npm test          # 21 offline unit tests
npm run test:e2e  # 72 assertions; needs a seeded DB and a running API
npm run build     # production bundle
```

> The database currently holds a little manual test data on top of the seed (an
> extra registered patient and a cancelled appointment). `npm run seed` clears the
> three collections and returns everything to the documented demo state.

---

## 12. Honest remaining gaps

These are documented in §9.1 of the report rather than hidden:

* No load testing, so the sub-200 ms performance target is a design argument
  rather than a measured result.
* The E2E suite needs a live database, so it is not yet CI-friendly; that would
  need an in-memory Mongo fixture.
* No React component tests — frontend behaviour is covered by the API suite and
  the manual walkthrough.
* No e-mail or SMS notifications, no payment integration, no file uploads for
  reports or scans.
