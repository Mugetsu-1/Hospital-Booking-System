# DFD Level 2 — Booking Engine (process 3.0)

Deconstructs `3.0 Booking Engine` into atomic slot validation and database
persistence. This is the process that prevents double-booking.

```mermaid
flowchart LR
  P["Patient"]
  D["Doctor"]

  subgraph eng["3.0 Booking Engine"]
    subgraph a["3.1 Validate request"]
      V1["schema + dates\n(express-validator)"]
      V2["doctor active & available?"]
      V3["slot on weekly grid?\n(isEligibleStart)"]
      V4["future slot?\n(no past start times)"]
    end
    subgraph b["3.2 Check availability"]
      C1["live bookings for\ndoctor + date"]
      C2["slot free?"]
      C3["atomic unique index\n(partial on Pending/Confirmed)"]
    end
    subgraph c["3.3 Persist"]
      S1["create appointment\n(status = Pending)"]
    end
    subgraph d["3.4 Notify & cache"]
      N1["invalidate Redis slots key"]
      N2["publish slots:changed / appointment:created"]
      N3["e-mail booking request (optional)"]
    end
  end

  DB[("Appointments\n(unique index:\ndoctorId+date+startTime)")]
  C[(Redis·optional)]
  RT["Socket.IO"]
  MX["Mailer (optional)"]

  P -->|"doctorId, date, time, symptoms"| V1
  V1 --> V2
  V2 -->|"reject 404/400"| P
  V2 --> V3
  V3 -->|"reject 400 off-grid"| P
  V3 --> V4
  V4 -->|"reject 400 past slot"| P
  V4 --> C1
  C1 --> C2
  C2 -->|"409 already booked"| P
  C2 -->|"free"| C3
  C3 --> S1
  S1 --> DB
  DB -->|"saved"| S1
  S1 --> N1
  N1 -.-> C
  S1 --> N2
  N2 -.-> RT
  N2 -.-> D
  N2 -.-> P
  S1 --> N3
  N3 -.-> MX
  S1 -->|"201 created + serialized"| P
```

## Concurrency guarantee

The same `(doctorId, date, startTime)` cannot be held by two **live**
appointments (Pending/Confirmed). Two layers enforce it:

1. **Application check** (`assertSlotFree`) — rejects a booked slot with 409.
2. **Partial unique index** on `Appointments` —
   `{ doctorId: 1, date: 1, startTime: 1 }` unique where
   `status ∈ { Pending, Confirmed }`. The moment an appointment is Cancelled it
   leaves the index and the slot returns to the pool (see `models/Appointment.js`).

The e2e suite proves both layers with a genuine two-request race for a single
slot (`TC-13`), and the returned-slot re-booking flows (`TC-24`, `TC-25`).