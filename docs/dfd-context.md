# DFD Level 0 — Context Diagram

The booking engine is a single process. External actors exchange data with it
through the REST/WebSocket boundary; the engine owns the database and the
optional cache.

```mermaid
flowchart LR
  P["Patient"]
  D["Doctor"]
  A["Administrator"]

  subgraph engine["Booking Engine (process 0)"]
    API["HTTP REST + Socket.IO\n(routes / controllers / middleware)"]
  end

  subgraph store["Data store"]
    DB[("MongoDB\nUsers · Doctors · Appointments")]
  end

  P -->|"1  credentials, profile,\nbooking request"| API
  API -->|"2  directory, slots,\nconfirmation, records"| P
  D -->|"3  schedule, status\nupdates, notes"| API
  API -->|"4  queue, records"| D
  A -->|"5  directory & account\nmanagement commands"| API
  API -->|"6  ledger, reports"| A

  API -->|"7  read/write documents"| DB
  DB -->|"8  query results"| API

  API -.->|"9  cache slots & directory\n(optional Redis)"| C[(Redis)]
  C -.->|"10  cached reads"| API
```

## Data flow glossary

| # | Flow | Content |
| :--- | :--- | :--- |
| 1 | Patient → Engine | JWT login/register, profile edits, date+doctor+slot booking, reschedule/cancel |
| 2 | Engine → Patient | Doctor directory, computed available slots, appointment status, consultation records |
| 3 | Doctor → Engine | Weekly work blocks, `isAvailable` toggle, status transitions, diagnosis/prescription/notes |
| 4 | Engine → Doctor | Day/week/month queue, patient summaries, record edit window state |
| 5 | Admin → Engine | Doctor create/update/deactivate, patient account management, record purge |
| 6 | Engine → Admin | Hospital-wide appointment ledger, filters by status/doctor/patient/date |
| 7/8 | Engine ↔ MongoDB | CRUD on `Users`, `Doctors`, `Appointments` collections |
| 9/10 | Engine ↔ Redis (optional) | Read-through cache of doctor lists and slot grids; prefix-invalidated on writes |

The single process boundary means every flow crosses authentication +
validation middleware before touching the data store.