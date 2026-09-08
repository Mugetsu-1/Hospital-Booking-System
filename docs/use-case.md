# Use Case Diagram

```mermaid
flowchart TD
  subgraph system["Hospital Appointment Booking System"]
    UC1["UC-01 Register / authenticate (JWT)"]
    UC2["UC-02 Browse & search doctor directory"]
    UC3["UC-03 View doctor schedule & available slots"]
    UC4["UC-04 Book an appointment slot"]
    UC5["UC-05 Reschedule / cancel own appointment"]
    UC6["UC-06 View own appointment history & consultation records"]
    UC7["UC-07 Manage personal profile"]
    UC8["UC-08 View clinic queue (day / week / month)"]
    UC9["UC-09 Confirm / complete / cancel appointments"]
    UC10["UC-10 Write & edit consultation notes (24h window)"]
    UC11["UC-11 Record diagnosis, prescription, follow-up"]
    UC12["UC-12 Manage own weekly schedule, fee, availability"]
    UC13["UC-13 Create / edit doctor profiles"]
    UC14["UC-14 Deactivate / reactivate doctors (soft delete)"]
    UC15["UC-15 Manage patient accounts"]
    UC16["UC-16 Browse & filter the hospital appointment ledger"]
    UC17["UC-17 Correct / purge medical records"]
  end

  Patient --> UC1
  Patient --> UC2
  Patient --> UC3
  Patient --> UC4
  Patient --> UC5
  Patient --> UC6
  Patient --> UC7

  Doctor --> UC1
  Doctor --> UC8
  Doctor --> UC9
  Doctor --> UC10
  Doctor --> UC11
  Doctor --> UC12

  Administrator --> UC1
  Administrator --> UC13
  Administrator --> UC14
  Administrator --> UC15
  Administrator --> UC16
  Administrator --> UC17

  UC3 ..> UC4 : "<<include>>"
  UC8 ..> UC9 : "<<include>>"
```

## Actor boundaries

| Actor | Direct use cases | Authentication |
| :--- | :--- | :--- |
| **Patient** | UC-01 … UC-07 | JWT session, role `patient` |
| **Doctor** | UC-01, UC-08 … UC-12 | JWT session, role `doctor` |
| **Administrator** | UC-01, UC-13 … UC-17 | JWT session, role `admin` |

Cross-actor rules enforced in `backend/src/middleware/auth.js`:

- A patient can only read/change **their own** appointments and profile.
- A doctor acts only on appointments **assigned to them**.
- Admin endpoints (`/api/patients`, ledger, deletes) reject every non-admin with
  HTTP 403 before the controller runs.