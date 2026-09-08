# Sequence Diagrams

## 1. Book an appointment (patient)

```mermaid
sequenceDiagram
  autonumber
  participant P as Patient (React SPA)
  participant C as Express Controller
  participant V as Validation Middleware
  participant R as Redis Cache (optional)
  participant D as MongoDB
  participant S as Socket.IO
  participant M as Mailer (optional)

  P->>C: POST /api/appointments {doctorId, date, time, symptoms}
  C->>V: authenticate + validate body
  V-->>C: ok (shape, real date, HH:MM)
  C->>R: get cached slots:doctor:date ?
  R-->>C: (miss)
  C->>D: find doctor (active + available)
  D-->>C: doctor profile
  C->>D: find{doctorId,date,startTime,status LIVE}
  D-->>C: none (slot free)
  C->>D: insert {status: Pending} (unique index guard)
  D-->>C: saved appointment
  C->>R: delPrefix slots:<doctorId>  (invalidate)
  C->>S: emit slots:changed / appointment:created
  C->>M: send booking request (optional)
  C-->>P: 201 {data: appointment serialized}
```

## 2. Confirm + complete a consultation (doctor)

```mermaid
sequenceDiagram
  autonumber
  participant D as Doctor (React SPA)
  participant C as Express Controller
  participant P as MongoDB
  participant S as Socket.IO
  participant M as Mailer (optional)

  D->>C: PATCH /api/appointments/:id/status {status: Confirmed}
  C->>P: find appointment
  P-->>C: appointment (Pending)
  C->>C: canTransition(Pending → Confirmed) ✓
  C->>P: save status=Confirmed
  C->>S: emit appointment:status
  C-->>D: 200 {data}

  D->>C: PATCH /api/appointments/:id/status {status: Completed, diagnosis, prescription, notes}
  C->>P: find appointment
  P-->>C: appointment (Confirmed)
  C->>C: canTransition(Confirmed → Completed) ✓
  C->>P: save status=Completed + consultation record
  C->>S: emit appointment:status
  C->>M: send status update (optional)
  C-->>D: 200 {data}
```

## 3. Cancel / reschedule (patient) — slot release

```mermaid
sequenceDiagram
  autonumber
  participant P as Patient (React SPA)
  participant C as Express Controller
  participant R as Redis Cache (optional)
  participant D as MongoDB
  participant S as Socket.IO
  participant M as Mailer (optional)

  P->>C: POST /api/appointments/:id/cancel
  C->>D: find appointment (owned?)
  D-->>C: appointment
  C->>C: cutoff check (≥2h before start)
  C->>D: save status=Cancelled
  C->>R: delPrefix slots:doctorId
  C->>S: emit slots:changed, appointment:updated
  C->>M: send cancellation notice (optional)
  C-->>P: 200 {message, data}

  P->>C: POST /api/appointments/:id/reschedule {date, time}
  C->>D: find appointment; assertSlotFree(new slot, exclude self)
  C->>D: save new date/time, status=Pending
  C->>R: invalidate both slot keys
  C->>S: emit slot/appointment change
  C-->>P: 200 {data}
```

## 4. Write consultation notes (24h window)

```mermaid
sequenceDiagram
  autonumber
  participant D as Doctor (React SPA)
  participant C as Express Controller
  participant DB as MongoDB
  participant S as Socket.IO
  participant M as Mailer (optional)

  D->>C: PATCH /api/appointments/:id/notes
  C->>DB: find appointment + doctor ownership
  C->>C: status Completed? inside 24h? admin bypass?
  C->>DB: save diagnosis/prescription/consultationNotes
  C->>S: emit appointment:notes
  C->>M: notify patient (optional)
  C-->>D: 200 {data}
```

Every request crosses `requireAuth` (JWT) and the role/ownership guard before
reaching persistence — the RBAC facts from `middleware/auth.js` apply to all
four flows.