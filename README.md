# Hospital Doctor Appointment Booking System

**Software Engineering Lab Project — Full-Stack PERN Application**

| | |
| :--- | :--- |
| **Author** | Student developer, single-student project |
| **Repository** | [Mugetsu-1/Hospital-Booking-System](https://github.com/Mugetsu-1/Hospital-Booking-System) |
| **Branch** | `main` · CI: [`.github/workflows/main.yml`](.github/workflows/main.yml) |
| **Status** | ✅ 21 unit + 72 e2e assertions passing · production build green |

> **Abstract.** A hospital appointment booking system where patients discover
> doctors, book *computed* availability slots, and reschedule or cancel under
> enforced business rules; doctors run day/week/month queues, confirm and
> complete visits, and write governed consultation records; administrators
> manage the directory, accounts and the hospital-wide ledger. Engineered with
> a concurrency-safe slot model, JWT + RBAC, request validation and an optional
> Redis / Socket.IO / Nodemailer tier that fails open.

## Documentation

| Document | Purpose |
| :--- | :--- |
| **[Project Summary](docs/PROJECT_SUMMARY.md)** | Lab-report-style narrative: abstract, SRS, modelling, database, architecture, implementation, QA, conclusion |
| **[Diagrams](docs/README.md)** | Use Case · DFD L0–L2 · ERD · Sequence · Architecture (Mermaid) |
| **[Test Matrix](backend/tests/TEST_MATRIX.md)** | Black-box matrix, equivalence partitioning, BVA, RBAC cases |
| **[Screenshot checklist](screenshots/README.md)** | 24 named UI captures for the report |

## Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | React 18 + React Router 6, Vite dev server / bundler |
| Backend | Node.js + Express 4, JWT auth, bcrypt hashing, express-validator |
| Database | PostgreSQL with Prisma 7 (`@prisma/adapter-pg`) — Supabase or Render |
| Cache *(optional, fail-open)* | Redis — read-through for doctor lists & slot grids |
| Realtime *(optional, fail-open)* | Socket.IO — `slots:changed` / `appointment:*` triggers |
| Notifications *(optional, fail-open)* | Nodemailer — booking / status / notes e-mails |
| Tests | `node:test` (built-in runner) + HTTP e2e suite against real PostgreSQL |

## Prerequisites

- **Node.js 20 or newer** (verified on Node 24). `npm` ships with it.
- **PostgreSQL 15 or newer** — either:
  - a local server (`localhost:5432` by default), or
  - a free [Supabase](https://supabase.com) project, or
  - a Render PostgreSQL instance.

  You only need a connection string; Prisma creates the tables for you.

## Setup

```bash
# 1. install root, backend and frontend dependencies
npm run setup

# 2. create the backend environment file
cp backend/.env.example backend/.env      # Windows: copy backend\.env.example backend\.env
```

Then edit `backend/.env`:

| Variable         | Default                                                              | Purpose                          |
| ---------------- | -------------------------------------------------------------------- | -------------------------------- |
| `PORT`           | `5000`                                                               | API port                         |
| `DATABASE_URL`   | `postgresql://postgres:postgres@127.0.0.1:5432/hospital_booking`      | PostgreSQL connection            |
| `JWT_SECRET`     | *(placeholder — change this)*                                        | token signing key                |
| `JWT_EXPIRES_IN` | `7d`                                                                 | token lifetime                   |
| `CLIENT_URL`     | `http://localhost:5173`                                              | CORS origin for the SPA          |
| `REDIS_URL`      | *(empty — cache off)*                                                | optional Redis cache             |
| `MAIL_ENABLED`   | `false`                                                              | switch on Nodemailer             |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | *(empty)*                             | SMTP transport for notifications |

`backend/.env` is git-ignored, so the secret never leaves your machine.

Create the database (once) and apply the schema + indexes:

```bash
# local PostgreSQL only — skip if you already have a Supabase/Render URL
createdb hospital_booking

npm run db:setup        # prisma generate + prisma db push + slot index
```

The frontend needs no configuration in development: Vite proxies `/api` to
port 5000. For a deployed build where the API lives on another origin, set
`VITE_API_URL` (see [frontend/.env.example](./frontend/.env.example)).

## Seed the demo data

```bash
npm run seed
```

This **clears** the users, doctors and appointments tables and recreates a
small demo hospital: 1 administrator, 4 doctors (one deliberately marked *on
leave* so the directory filter is visible), 3 patients and a pending
appointment. Re-run it any time to get back to a known state. Set
`SEED_RESET=false` to upsert the accounts without clearing existing data.

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
needs PostgreSQL reachable, a pushed schema, a seeded database and the API
started, so it is a separate script:

```bash
npm run db:setup    # schema + slot index
npm run seed        # known starting state
npm run dev         # leave running
npm run test:e2e    # in a second terminal
```

It covers the functional and security cases documented in the QA matrix — 72
assertions including a genuine two-request race for a single slot and the
2-hour cancellation and 24-hour notes windows (exercised by back-dating rows
directly through Prisma). It cleans up after itself, so it can be re-run
without reseeding, and it exits non-zero on the first failure.

## Optional services (fail-open)

The app runs fully on just PostgreSQL. Redis, Socket.IO and Nodemailer enhance
it but never block it — each degrades to a safe no-op when not configured:

| Service | Enable by | Effect when enabled | Effect when disabled |
| :--- | :--- | :--- | :--- |
| Redis cache | `REDIS_URL=redis://127.0.0.1:6379` in `backend/.env` | Doctor lists & slot grids served from cache; invalidated on every write | Reads query PostgreSQL directly — identical responses |
| Socket.IO | Always mounted on the API port | Live slot grid & queue refresh, toast-worthy triggers | Clients run REST-only; pages refresh on navigation |
| Nodemailer | `MAIL_ENABLED=true` + `SMTP_HOST` + `MAIL_FROM` | Booking/reschedule/cancel/status/notes HTML e-mails | Mail calls log `(disabled)` and skip — booking flow untouched |

Full environment reference lives in [`backend/.env.example`](backend/.env.example).

## Deployment (Vercel + Render + Supabase)

The repository ships a [`render.yaml`](render.yaml) blueprint for the API.

1. **Database — Supabase.** Create a project, then copy *Project Settings →
   Database → Connection string* (session pooler or direct). Append
   `?sslmode=require` if it is not already present. Render PostgreSQL works
   too — use its **internal** connection string.
2. **Backend — Render.** New → Blueprint → select this repository. The build
   command is `npm install --include=dev && npm run db:setup`, which generates
   the Prisma client, pushes the schema and creates the partial unique slot
   index. Set `DATABASE_URL` and `CLIENT_URL` (your Vercel URL) in the
   dashboard; `JWT_SECRET` is generated automatically. Health probe:
   `/api/health`.
3. **Frontend — Vercel.** Import the repository, set the root directory to
   `frontend`, and add `VITE_API_URL=https://<your-render-service>.onrender.com/api`
   as a build-time environment variable. `frontend/vercel.json` already
   rewrites SPA routes to `index.html`.
4. **Seed once (optional).** From the Render shell: `npm run seed`
   (`SEED_RESET=false` keeps any existing rows).

> Free Render web services sleep when idle; the first request after a pause
> may take ~30 s while the instance and its Prisma pool wake up.

## CI/CD

[`.github/workflows/main.yml`](.github/workflows/main.yml) runs on every push/PR
to `main`: Node.js 20, `npm ci` across root/backend/frontend, an ephemeral
PostgreSQL 16 service, schema push + seed, the offline unit suite, the full
e2e API suite against the running server, and a production frontend build.

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
  prisma/
    schema.prisma    PostgreSQL tables, enums, indexes
  prisma.config.ts   Prisma 7 config (DATABASE_URL, schema path)
  src/
    db.js            Prisma client + pg driver adapter + index bootstrap
    config/          environment and policy knobs (cancel cutoff, notes window)
    domain/          appointment status state machine (pure, unit-tested)
    controllers/     auth, doctors, patients, appointments
    middleware/      JWT auth, role guards, express-validator, central error handler
    routes/          Express routers mounted under /api
    utils/           pure slot-grid and date helpers, serializers, Redis cache
    services/        realtime (Socket.IO), mailer (Nodemailer)
  scripts/
    db-setup.js      creates the partial unique index Prisma cannot express
    seed.js          demo data
  tests/             node:test unit tests (offline) + TEST_MATRIX.md
    e2e/api.e2e.js   end-to-end API suite (needs a running, seeded API)
frontend/
  src/
    pages/           patient, doctor and admin screens
    components/      shared UI primitives, route guards, skeleton loaders
    context/         auth/session provider, toast notification provider
    api/             axios client
    realtime.js      Socket.IO client (fail-open)
    utils/           formatting and date-range helpers
docs/                Mermaid diagrams + PROJECT_SUMMARY.md
screenshots/         capture checklist for the report
.github/workflows/   CI/CD pipeline
```

## Troubleshooting

**`PrismaClientInitializationError` / `P1001` on startup** — PostgreSQL is not
reachable at `DATABASE_URL`. Check the server is running (local PostgreSQL
service, or your Supabase/Render instance is not paused) and that the password /
`sslmode=require` part of the string is correct.

**`relation "users" does not exist`** — the schema has not been pushed yet. Run
`npm run db:setup`.

**`'concurrently' is not recognized`** — root dependencies are missing. Run
`npm install` in the project root, or `npm run setup`.

**Port already in use** — change `PORT` in `backend/.env`, or pass
`--port` to the Vite dev server. If you move the API port, update the proxy
target in [frontend/vite.config.js](./frontend/vite.config.js).

**Login fails for every seeded account** — the database was seeded with a
different `JWT_SECRET`, or not seeded at all. Run `npm run seed`.

**e2e suite reports a doctor-directory count mismatch** — leftover rows from a
previous interrupted run. Run `npm run seed` and re-run `npm run test:e2e`.
