# System Documentation

Mermaid diagram assets for the Hospital Doctor Appointment Booking System.
GitHub renders every `.md` below as a diagram image automatically; export the
same Mermaid source to high-resolution PNG/SVG for a printed report.

| Diagram | File | What it models |
| :--- | :--- | :--- |
| Use Case | [`use-case.md`](./use-case.md) | Actor boundaries: Patient, Doctor, Administrator |
| Class Diagram | [`class-diagram.md`](./class-diagram.md) | Object model: User, Doctor, Appointment, SlotBlock, enums, AppointmentPolicy |
| DFD Level 0 (Context) | [`dfd-context.md`](./dfd-context.md) | Top-level actors ↔ booking engine data flows |
| DFD Level 1 | [`dfd-level1.md`](./dfd-level1.md) | Auth / Doctor Schedule / Booking Engine / Medical Records |
| DFD Level 2 (Booking Engine) | [`dfd-level2-booking.md`](./dfd-level2-booking.md) | Atomic slot validation + persistence inside 3.0 |
| ERD | [`erd.md`](./erd.md) | PostgreSQL tables: users, doctors, appointments (+ partial unique slot index) |
| Sequence | [`sequence-diagrams.md`](./sequence-diagrams.md) | Client → Controller → Cache/Database → Client messaging |
| Architecture | [`architecture.md`](./architecture.md) | React + Express + PostgreSQL (Prisma) + optional Redis/Socket.IO/SMTP |
| Lab Report (ACHS) | [`LAB_REPORT.md`](./LAB_REPORT.md) | Consolidated 10-section software-engineering lab report |
| Project Summary | [`PROJECT_SUMMARY.md`](./PROJECT_SUMMARY.md) | Full lab-report-style narrative for the project |

## Relationship to the codebase

Every box in these diagrams maps to a real directory or file:

| Diagram element | Code |
| :--- | :--- |
| React SPA | `frontend/src` — `pages/`, `components/`, `context/`, `api/` |
| Express API | `backend/src` — `routes/`, `controllers/`, `middleware/`, `domain/` |
| Data model | `backend/prisma/schema.prisma` + `backend/src/db.js` |
| Slot engine | `backend/src/utils/slots.js` |
| Redis cache (optional) | `backend/src/utils/cache.js` |
| Socket.IO (optional) | `backend/src/services/realtime.js` |
| SMTP mail (optional) | `backend/src/services/mailer.js` |
| Auth + RBAC | `backend/src/middleware/auth.js` |
| Request validation | `backend/src/middleware/validate.js` |

> The optional layers (Redis, Socket.IO, Nodemailer) are fail-open: the
> application runs identically with or without them.

## Exporting the lab report to Word (`.docx`)

[`LAB_REPORT.md`](./LAB_REPORT.md) is the canonical submission document and
renders fully on GitHub (all Mermaid diagrams included). To produce a
`LAB_REPORT.docx` with the diagrams rasterised as images, run the reproducible
build script from the repo root:

```bash
node docs/build-docx.mjs
```

It renders every `mermaid` block to a PNG via
[`@mermaid-js/mermaid-cli`](https://github.com/mermaid-js/mermaid-cli), inlines the
diagrams as images, appends any `screenshots/*.png` as *Appendix A*, then converts
Markdown → HTML → `.docx` with [`marked`](https://github.com/markedjs/marked) and
[`@turbodocx/html-to-docx`](https://github.com/TurboDocx/html-to-docx) — a pure-Node
pipeline with no external binaries (dependencies are installed via `npm install` in
`docs/`). The script reads the report markdown directly, so the Word export can never
drift from the source.