# Entity-Relationship Diagram (MongoDB)

One `Users` document per person; doctors have a linked `Doctors` profile; every
appointment links a patient (via `Users`) to a doctor (via `Doctors`).

```mermaid
erDiagram
  USERS ||--o{ APPOINTMENTS : "books as patientId"
  DOCTORS ||--o{ APPOINTMENTS : "is scheduled as doctorId"
  USERS ||--o| DOCTORS : "linked userId"

  USERS {
    ObjectId _id PK
    string name "trimmed"
    string email "unique, lowercase"
    string passwordHash "bcrypt, not serialised"
    string role "patient|doctor|admin"
    number age
    string gender
    string phone
    string address
    string emergencyContact
    bool isActive "soft delete flag"
    date createdAt
    date updatedAt
  }

  DOCTORS {
    ObjectId _id PK
    ObjectId userId "FK -> USERS._id, unique"
    string specialization
    string qualification
    number consultationFee ">= 0"
    array availableSlots "daily blocks {day,startTime,endTime,slotDurationMins}"
    bool isAvailable "leave flag"
    bool isActive "soft delete flag"
    date createdAt
    date updatedAt
  }

  APPOINTMENTS {
    ObjectId _id PK
    ObjectId patientId "FK -> USERS._id"
    ObjectId doctorId "FK -> DOCTORS._id"
    string date "YYYY-MM-DD"
    string startTime "HH:MM"
    string endTime "HH:MM"
    date dateTime "chronological ordering"
    string status "Pending|Confirmed|Completed|Cancelled"
    string symptoms
    string diagnosis
    string prescription
    string consultationNotes
    date notesLastEditedAt
    string cancelledBy "patient|doctor|admin"
    date createdAt
    date updatedAt
    index uk_slot "unique(doctorId,date,startTime) partial on live statuses"
  }
```

## Relationships & integrity rules

| Relationship | Cardinality | Notes |
| :--- | :--- | :--- |
| `Users` ⟶ `Doctors` | 1 : 0..1 | `Doctor.userId` is unique; a doctor account owns one profile |
| `Users` (patient) ⟶ `Appointments` | 1 : 0..N | `Appointment.patientId` references `Users._id` |
| `Doctors` ⟶ `Appointments` | 1 : 0..N | `Appointment.doctorId` references `Doctors._id` |
| Slot uniqueness | live appointments only | Cancelled rows drop out → slot released |

Because Mongo stores documents, "foreign keys" are `ObjectId` references
resolved with `.populate()` in the controllers (`POPULATE_DOCTOR`,
`POPULATE_PATIENT`).