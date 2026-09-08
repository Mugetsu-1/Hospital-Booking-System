# Screenshots — Report Capture Checklist

This folder holds the UI evidence images for the report's screen-capture
section. Each row describes the exact journey to capture, the file name to
save, and what the image must prove.

> **How to capture (local run):** `npm run seed` then `npm run dev`, open
> <http://localhost:5173> and walk each journey below. Save **full-resolution
> PNG** captures into this folder with the file name listed.

## Patient journeys

| # | File name | Journey | Must show |
| :--- | :--- | :--- | :--- |
| 1 | `01-register.png` | `/register` — create a new patient account | Form with validation, success toast, redirect to appointments |
| 2 | `02-login.png` | `/login` — sign in with `alice@example.com / Patient@123` | Signed-in toast, dashboard redirect |
| 3 | `03-browse-doctors.png` | `/patient/browse` — search & filter directory | Filter bar (name / specialization / day / fee), doctor cards, fee + schedule chips |
| 4 | `04-slot-picker.png` | Open "Book Appointment" on a doctor | Date picker, computed slot grid, symptoms textarea |
| 5 | `05-booking-confirm.png` | Confirm a booking | Success toast + Pending row in **My Appointments** |
| 6 | `06-reschedule.png` | Reschedule an appointment | New slot picker, resulting Pending row |
| 7 | `07-cancel-confirm.png` | Cancel an appointment (confirm modal) | Confirmation modal, Cancelled status, freed slot |
| 8 | `08-appointment-history.png` | My Appointments with status tabs | Tabs (All/Pending/Confirmed/Completed/Cancelled), date-range filters |
| 9 | `09-consultation-record.png` | Open Details of a Completed appointment | Diagnosis, prescription, consultation notes |
| 10 | `10-profile.png` | `/patient/profile` — edit profile | Form with saved changes, success toast |

## Doctor journeys

| # | File name | Journey | Must show |
| :--- | :--- | :--- | :--- |
| 11 | `11-doctor-queue-day.png` | Login `mehta@hospital.com` → Day view | Queue with Pending/Confirmed rows, status filter chips |
| 12 | `12-doctor-week-month.png` | Switch to Week and Month views | Ranged navigation, inclusive date windows |
| 13 | `13-confirm-complete.png` | Confirm a Pending booking, then Start & complete | Status transitions, consultation form (diagnosis/prescription/notes) |
| 14 | `14-notes-window.png` | Open "Edit record" on a Completed visit | Record editing UI + saved toast |
| 15 | `15-schedule-settings.png` | Open Schedule settings | Weekly blocks editor, fee, availability toggle |

## Admin journeys

| # | File name | Journey | Must show |
| :--- | :--- | :--- | :--- |
| 16 | `16-admin-overview.png` | Login `admin@hospital.com` → Overview | Statistics cards (totals, today, revenue, status split) |
| 17 | `17-admin-doctors.png` | Doctors tab | Directory with create/edit/deactivate controls |
| 18 | `18-admin-create-doctor.png` | Create a doctor | Doctor form with weekly working blocks |
| 19 | `19-admin-patients.png` | Patients tab | Account list, edit + deactivate actions |
| 20 | `20-admin-ledger.png` | Appointments tab | Hospital-wide ledger with filters |
| 21 | `21-admin-purge.png` | Purge a medical record (confirm modal) | Confirmation and removed row |

## Real-time & UX evidence (optional)

| # | File name | Journey | Must show |
| :--- | :--- | :--- | :--- |
| 22 | `22-live-slot-update.png` | Two browsers: book a slot in one | Second browser's open slot picker updates without refresh (Socket.IO) |
| 23 | `23-toast-notifications.png` | Any success action | Toast stack top-right with auto-dismiss styling |
| 24 | `24-skeleton-loading.png` | Slow network / throttled dev server | Skeleton placeholders during list load |

## Checklist

- [ ] All 24 captures named exactly as above
- [ ] Full-resolution PNG (no downscaling)
- [ ] No sensitive data visible (use seeded demo accounts only)
- [ ] Real-time capture #22 if the optional Socket.IO evidence is included