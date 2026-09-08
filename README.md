# Hospital Doctor Appointment Booking System

A MERN-stack appointment booking system for a hospital, built for the ACHS Software
Engineering lab. Patients search a doctor directory and book computed time slots,
doctors run their daily/weekly/monthly clinic queue and write consultation records,
and administrators manage the directory, patient accounts and the hospital-wide
appointment ledger.



## Stack

| Layer    | Technology                                            |
| -------- | ----------------------------------------------------- |
| Frontend | React 18 + React Router 6, Vite dev server / bundler  |
| Backend  | Node.js + Express 4, JWT auth, bcrypt password hashing |
| Database | MongoDB with Mongoose 8                               |
| Tests    | `node:test` (built-in runner), no extra tooling       |

## Prerequisites

- **Node.js 20 or newer** (verified on Node 24). `npm` ships with it.
- **MongoDB Community Server 6 or newer**, running locally on `127.0.0.1:27017`.
  On Windows the installer registers a `MongoDB` service that starts automatically;
  check it with `Get-Service MongoDB`.

No cloud account is required — everything runs on localhost.

## Setup

```bash
# 1. install root, backend and frontend dependencies
npm run setup

# 2. create the backend environment file
cp backend/.env.example backend/.env      # Windows: copy backend\.env.example backend\.env
```

Then edit `backend/.env` and replace `JWT_SECRET` with a long random string. The
other defaults work out of the box:

| Variable         | Default                                        | Purpose                          |
| ---------------- | ---------------------------------------------- | -------------------------------- |
| `PORT`           | `5000`                                         | API port                         |
| `MONGODB_URI`    | `mongodb://127.0.0.1:27017/hospital_booking`   | database connection              |
| `JWT_SECRET`     | *(placeholder — change this)*                  | token signing key                |
| `JWT_EXPIRES_IN` | `7d`                                           | token lifetime                   |
| `CLIENT_URL`     | `http://localhost:5173`                        | CORS origin for the SPA          |

`backend/.env` is git-ignored, so the secret never leaves your machine.

The frontend needs no configuration in development: Vite proxies `/api` to
port 5000. For a deployed build where the API lives on another origin, set
`VITE_API_URL` (see [frontend/.env.example](./frontend/.env.example)).

## Seed the demo data

```bash
npm run seed
```

This **clears** the users, doctors and appointments collections and recreates a
small demo hospital: 1 administrator, 4 doctors (one deliberately marked *on
leave* so the directory filter is visible), 3 patients and 1 pending appointment.
Re-run it any time to get back to a known state. Set `SEED_RESET=false` to upsert
the accounts without clearing existing data.

| Role    | Email                                                            | Password     |
| ------- | ---------------------------------------------------------------- | ------------ |
| Admin   | `admin@hospital.com`                                             | `Admin@123`  |
| Doctor  | `mehta@hospital.com` (also `sharma`, `verma`, `iyer`)             | `Doctor@123` |
| Patient | `alice@example.com` (also `bob`, `carol`)                        | `Patient@123`|

## Run

```bash
npm run dev
```

This starts both halves together:

- API — <http://localhost:5000> (health check: `GET /api/health`)
- Web — <http://localhost:5173>

To run them separately: `npm run dev --prefix backend` and
`npm run dev --prefix frontend`.

## Tests and build

```bash
npm test        # unit tests: slot-grid maths, calendar validation, status transitions
npm run build   # production bundle into frontend/dist
```

`npm test` is offline and needs no database.

There is also an end-to-end API suite that drives the real HTTP endpoints. It
needs MongoDB running, a seeded database and the API started, so it is a separate
script:

```bash
npm run seed        # known starting state
npm run dev         # leave running
npm run test:e2e    # in a second terminal
```

It covers the functional and security cases documented in the report (§7.4, §7.6,
§7.7) — 72 assertions including a genuine two-request race for a single slot and
the 2-hour cancellation and 24-hour notes windows. It cleans up after itself, so
it can be re-run without reseeding, and it exits non-zero on the first failure.

## What each role can do

- **Patient** — register, search doctors by name, specialization, weekday or fee
  ceiling, book a free slot, reschedule or cancel until the cutoff (2 hours before
  the start), and read the consultation record after the visit.
- **Doctor** — see the queue as a day, week or month range, confirm or cancel
  bookings, complete a consultation with a diagnosis, prescription and notes
  (editable for 24 hours afterwards), and edit their own weekly working hours,
  fee and availability.
- **Admin** — create, edit, deactivate and reactivate doctors, manage patient
  accounts, browse and filter the whole appointment ledger, correct a consultation
  record at any time, and permanently purge an inaccurate record.

## Project layout

```
backend/
  src/
    config/        environment and policy knobs (cancel cutoff, notes window)
    models/        User, Doctor, Appointment (+ partial unique slot index)
    controllers/   auth, doctors, patients, appointments
    middleware/    JWT auth, role guards, central error handler
    routes/        Express routers mounted under /api
    utils/         pure slot-grid and date helpers, typed error factories
  scripts/seed.js  demo data
  tests/           node:test unit tests (offline)
    e2e/api.e2e.js end-to-end API suite (needs a running, seeded API)
frontend/
  src/
    pages/         patient, doctor and admin screens
    components/    shared UI primitives and route guards
    context/       auth/session provider
    api/           axios client
    utils/         formatting and date-range helpers
```

## Troubleshooting

**`MongooseServerSelectionError` on startup** — MongoDB is not running. Start the
service (`Start-Service MongoDB` on Windows, `sudo systemctl start mongod` on
Linux) and try again. The API exits deliberately rather than serving requests it
cannot fulfil.

**`'concurrently' is not recognized`** — root dependencies are missing. Run
`npm install` in the project root, or `npm run setup`.

**Port already in use** — change `PORT` in `backend/.env`, or pass
`--port` to the Vite dev server. If you move the API port, update the proxy
target in [frontend/vite.config.js](./frontend/vite.config.js).

**Login fails for every seeded account** — the database was seeded with a
different `JWT_SECRET`, or not seeded at all. Run `npm run seed`.
# Hospital-Booking-System
