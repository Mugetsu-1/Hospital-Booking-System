# System Documentation

Mermaid diagram assets for the Hospital Doctor Appointment Booking System.
GitHub renders every `.md` below as a diagram image automatically; export the
same Mermaid source to high-resolution PNG/SVG for a printed report.

| Diagram | File | What it models |
| :--- | :--- | :--- |
| Use Case | [`use-case.md`](./use-case.md) | Actor boundaries: Patient, Doctor, Administrator |
| DFD Level 0 (Context) | [`dfd-context.md`](./dfd-context.md) | Top-level actors ↔ booking engine data flows |
| DFD Level 1 | [`dfd-level1.md`](./dfd-level1.md) | Auth / Doctor Schedule / Booking Engine / Medical Records |
| DFD Level 2 (Booking Engine) | [`dfd-level2-booking.md`](./dfd-level2-booking.md) | Atomic slot validation + persistence inside 3.0 |
| ERD | [`erd.md`](./erd.md) | MongoDB collections: Users, Doctors, Appointments |
| Sequence | [`sequence-diagrams.md`](./sequence-diagrams.md) | Client → Controller → Cache/Database → Client messaging |
| Architecture | [`architecture.md`](./architecture.md) | React + Express + Mongo + optional Redis/Socket.IO/SMTP |
| Project Summary | [`PROJECT_SUMMARY.md`](./PROJECT_SUMMARY.md) | Full lab-report-style narrative for the project |

## Relationship to the codebase

Every box in these diagrams maps to a real directory or file:

| Diagram element | Code |
| :--- | :--- |
| React SPA | `frontend/src` — `pages/`, `components/`, `context/`, `api/` |
| Express API | `backend/src` — `routes/`, `controllers/`, `middleware/`, `models/` |
| Slot engine | `backend/src/utils/slots.js` |
| Redis cache (optional) | `backend/src/utils/cache.js` |
| Socket.IO (optional) | `backend/src/services/realtime.js` |
| SMTP mail (optional) | `backend/src/services/mailer.js` |
| Auth + RBAC | `backend/src/middleware/auth.js` |
| Request validation | `backend/src/middleware/validate.js` |

> The optional layers (Redis, Socket.IO, Nodemailer) are fail-open: the
> application runs identically with or without them.