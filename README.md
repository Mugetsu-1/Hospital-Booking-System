# Hospital Doctor Appointment Booking System

A full-stack web application for patient doctor discovery, appointment scheduling, and practice management.

## Table of Contents

- [About](#about)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Screenshots](#screenshots)
- [Links](#links)

## About

The Hospital Doctor Appointment Booking System is a full-stack web application that enables patients to discover doctors, book available appointment slots, manage their consultations, and allows doctors and administrators to manage the appointment lifecycle. Engineered with a concurrency-safe slot model using PostgreSQL partial unique indexes, JWT authentication, and RBAC role-based access control.

## Features

### Patient Features

- Register and log in to the system
- Search doctors by name, specialization, or fee ceiling
- View computed available appointment slots per doctor per day
- Book, reschedule, or cancel appointments (until 2-hour cutoff)
- Read consultation records after visit (editable for 24 hours)
- Update personal profile and weekly working hours/fee

### Doctor Features

- View daily, weekly, or monthly consultation queues
- Confirm or cancel booked appointments
- Complete consultations with diagnosis, prescription, and notes
- Edit own weekly working hours, fee, and availability

### Admin Features

- Create, edit, deactivate, and reactivate doctors
- Manage patient accounts (browse, filter, correct records)
- Browse and filter the hospital-wide appointment ledger
- Permanently purge inaccurate records

## Usage

### Development Mode

```bash
# Root (runs both frontend and backend via concurrently)
npm run dev

# Or separately:
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev
```

### Production Build

```bash
npm run build

# Frontend: cd frontend && npm run build

# Then serve the built files
```

## Screenshots

| Register | Login |
| :---: | :---: |
| ![Register](screenshots/01-register.png) | ![Login](screenshots/02-login.png) |

| Doctor directory | Slot picker |
| :---: | :---: |
| ![Doctor directory](screenshots/03-browse-doctors.png) | ![Slot picker](screenshots/04-slot-picker.png) |

| Appointment history | Doctor queue |
| :---: | :---: |
| ![Appointments](screenshots/08-appointment-history.png) | ![Doctor queue](screenshots/11-doctor-queue-day.png) |

| Admin overview | Admin ledger |
| :---: | :---: |
| ![Admin dashboard](screenshots/16-admin-overview.png) | ![Appointment ledger](screenshots/20-admin-ledger.png) |

## Links

- **GitHub Repository**: [https://github.com/Mugetsu-1/Hospital-Booking-System](https://github.com/Mugetsu-1/Hospital-Booking-System)
- **Lab Report**: [docs/LAB_REPORT.md](docs/LAB_REPORT.md)
- **CI Pipeline**: [GitHub Actions](https://github.com/Mugetsu-1/Hospital-Booking-System/actions)
- **Author**: Saugat Bikram Thapa

```text
backend/
  prisma/schema.prisma    PostgreSQL tables, enums, indexes
  prisma.config.ts        Prisma 7 config (DATABASE_URL, schema path)
  src/
    server.js             entrypoint: DB connect, Socket.IO mount, listen
    app.js                Express app: CORS, JSON, /api/health, routers
    db.js                 Prisma client + pg driver adapter + index bootstrap
    config/               environment and policy knobs (cutoff, notes window)
    domain/               appointment status state machine (pure, unit-tested)
    controllers/          auth, doctors, patients, appointments
    middleware/           JWT auth + RBAC, express-validator, error handler
    routes/               Express routers mounted under /api
    utils/                slot-grid & date helpers, serializers, cache, errors
    services/             realtime (Socket.IO), mailer (Nodemailer)
  scripts/
    db-setup.js           creates the partial unique index Prisma cannot express
    seed.js               demo hospital data
  tests/                  node:test unit tests (offline) + TEST_MATRIX.md
    e2e/api.e2e.js        end-to-end API suite (needs a running, seeded API)

frontend/
  index.html
  vite.config.js          dev server + /api and /socket.io proxy
  src/
    main.jsx  App.jsx     entrypoint and route table
    pages/                patient/, doctor/, admin/, Login, Register, NotFound
    components/           UI primitives, Protected guard, ErrorBoundary, Skeleton
    context/              auth/session provider, toast provider
    api/client.js         axios client (JWT interceptor, 401 cleanup)
    realtime.js           Socket.IO client (fail-open)
    utils/helpers.js      formatting and date-range helpers

docs/
  LAB_REPORT.md           the lab report (all diagrams inline; generated Word file)
  architecture-overview.webp  component / data-flow overview
  build-docx.mjs          renders inline Mermaid → PNG → .docx
  capture-screenshots.mjs headless-Chromium screenshot capture
screenshots/               UI evidence PNGs (embedded in the report)
backend/tests/TEST_MATRIX.md  black-box matrix, BVA, RBAC cases
.github/workflows/main.yml CI pipeline
```

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Mugetsu-1/Hospital-Booking-System.git
cd Hospital-Booking-System
```

### 2. Install root dependencies

```bash
npm install
```

### 3. Install backend dependencies

```bash
cd backend && npm install
```

### 4. Install frontend dependencies

```bash
cd ../frontend && npm install
```

### 5. Set up environment variables

#### Backend (`backend/.env`)

```text
DATABASE_URL=postgresql://user:password@host:port/database
PORT=4000
JWT_SECRET=your_256_bit_secret_key
BCRYPT_SALT_ROUNDS=10
REDIS_URL=optional_redis_url
NODMAILER_TRANSPORT=optional_nodemailer_config
```

#### Frontend (`frontend/.env`)

```text
VITE_API_BASE_URL=http://localhost:4000/api
VITE_SOCKET_IO_URL=http://localhost:4000
```

### 6. Database setup

```bash
# Root
npm run db:setup

# Or individually:
cd backend && npm run db:setup
```

### 7. Seed the database

```bash
npm run seed
```

