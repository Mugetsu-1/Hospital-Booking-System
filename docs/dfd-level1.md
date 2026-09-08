# DFD Level 1

The booking engine decomposes into four processes. Arrows show data movement;
dashed arrows are optional (cache, realtime push, e-mail side effects).

```mermaid
flowchart LR
  P["Patient"]
  D["Doctor"]
  A["Administrator"]

  subgraph zero["1.0 Auth"]
    L1["register / login /\nJWT verify"]
  end
  subgraph two["2.0 Doctor Schedule Management"]
    L2["weekly blocks, fee,\navailability"]
  end
  subgraph three["3.0 Booking Engine"]
    L3["slot grid computation\n· collision check ·\nstatus lifecycle"]
  end
  subgraph four["4.0 Medical Records"]
    L4["consultation notes,\ndiagnosis, prescription"]
  end

  DB[("Users · Doctors ·\nAppointments")]
  C[(Redis·optional)]
  RT["Socket.IO bus"]
  MX["Mailer (SMTP, optional)"]

  P -->|credentials| L1
  L1 -->|token / session| P

  P -->|"search / filter"| L2
  L2 -->|directory| P
  D -->|"edit schedule / leave"| L2
  A -->|"create / deactivate"| L2

  P -->|"book / reschedule / cancel"| L3
  D -->|"confirm / complete"| L3
  A -->|"ledger / purge"| L3
  L3 -->|"fresh slots / status"| P
  L3 -->|"queue / requests"| D
  L3 -->|"ledger"| A

  D -->|"diagnosis · prescription · notes"| L4
  L4 -->|"consultation record"| P
  A -->|"correct / purge records"| L4

  L1 <-->|"read / write users"| DB
  L2 <-->|"read / write doctors"| DB
  L3 <-->|"read / write appointments"| DB
  L4 <-->|"read / write appointments"| DB

  L2 -.->|"cache directory"| C
  L3 -.->|"cache slot grids"| C
  L3 -.->|"slots:changed / appointment:*"| RT
  L4 -.->|"record ready"| RT
  L3 -.->|"confirmations / cancellations"| MX
  L4 -.->|"record available"| MX
```

## Process responsibilities

| Process | Responsibility | Controllers / services |
| :--- | :--- | :--- |
| 1.0 Auth | Register/login, JWT issue/verify, RBAC role gates | `controllers/auth.js`, `middleware/auth.js` |
| 2.0 Doctor Schedule | Directory CRUD, weekly blocks, leave flag, fee | `controllers/doctor.js`, `models/Doctor.js` |
| 3.0 Booking Engine | Slot computation, double-booking protection, lifecycle transitions | `controllers/appointment.js`, `utils/slots.js`, `models/Appointment.js` |
| 4.0 Medical Records | Consultation notes, diagnosis, prescription, 24h edit window, purge | `controllers/appointment.js` (notes/status) |

Data store: MongoDB collections `Users`, `Doctors`, `Appointments`.