# Test Matrix & QA Evidence

Black-box functional matrix, equivalence partitioning and boundary-value
analysis for the booking system. Every row maps to an assertion that actually
exists in the repository — run it with:

```bash
npm test                 # 21 offline unit tests (slot maths, transitions)
npm run seed             # reset demo data
npm run dev              # start the API (leave running)
npm run test:e2e         # 72 end-to-end API assertions
```

## 1. Black-box functional matrix

| Test ID | Scenario | Input data | Expected result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| TC-01 | Seed accounts log in | admin/doctor/patient credentials | 200 + signed JWT | `TC-01 seeded logins issue tokens` |
| TC-02 | Wrong password | correct email + bad password | 401 invalid credentials | `TC-02 wrong password rejected` |
| TC-03 | Session rehydrates | GET `/auth/me` with token | 200 + user payload | `TC-03 session rehydrates` |
| TC-05 | Directory listing | authenticated GET `/doctors` | Only active+available doctors (3 of 4) | `TC-05 directory lists bookable doctors…` |
| TC-06 | Specialist filter | `?specialization=Cardiologist` | 1 doctor | `TC-06 specialization filter` |
| TC-07 | Name search | `?q=Arjun` | 1 doctor | `TC-07 name search` |
| TC-07b | Fee ceiling | `?maxFee=700` | exactly the affordable set | `TC-07b fee ceiling filter` |
| TC-08b | Slot grid computation | GET slots for a Tuesday | 7 half-hour slots from blocks | `TC-08b slot grid computed` |
| TC-10 | Book a free slot | doctor/date/time | 201 Pending | `TC-10 patient books a free slot` |
| TC-11 | Booked slot disappears | re-query slots | one slot removed (6 remain) | `TC-11 booked slot disappears` |
| TC-12 | Double-booking rejected | second patient same slot | 409 already booked | `TC-12 second patient cannot take` |
| TC-13 | Simultaneous booking race | two requests same slot | one 201, one 409 | `TC-13 simultaneous booking race` |
| TC-14 | Past slot rejected | today, earlier time | 400 cannot book past | `TC-14 past slot rejected` |
| TC-15 | Doctor confirms | Pending → Confirmed | 200 | `TC-15 doctor confirms` |
| TC-16 | Illegal transition | Confirmed → Pending | 400 state machine | `TC-16 backwards transition rejected` |
| TC-17 | Complete + notes | Confirmed → Completed + rx | 200, fields stored | `TC-17 completing stores…` |
| TC-18 | Patient reads record | GET own appointment | 200, notes present | `TC-18 patient can read…` |
| TC-19 | Edit notes in window | PATCH notes within 24h | 200, other fields kept | `TC-19 partial record edit…` |
| TC-20 | Notes before completion | PATCH notes on Pending | 400 | `TC-20 notes rejected before completion` |
| TC-21 | 24h window expiry | time-travel past deadline | 400 window closed | `TC-21 doctor blocked outside…` |
| TC-21b | Admin bypass window | admin PATCH | 200 | `TC-21b admin bypasses…` |
| TC-22 | Cutoff blocks patient | time-travel inside 2h window | 400 | `TC-22 patient blocked inside…` |
| TC-22b | Admin bypass cutoff | admin cancel | 200 | `TC-22b admin bypasses…` |
| TC-23 | Patient cancels outside cutoff | Cancel button | 200 Cancelled | `TC-23 patient cancels…` |
| TC-24 | Cancel releases slot | re-query slot grid | slot returns | `TC-24 cancellation releases…` |
| TC-25 | Released slot re-bookable | book the returned slot | 201 | `TC-25 released slot is re-bookable` |
| TC-26 | Reschedule to free slot | new date/time | 200 Pending | `TC-26 patient reschedules…` |
| TC-27/28/29 | Day/week/month views | doctor ranged queries | counts cover each other | `TC-27…TC-29` |
| TC-30 | Range bounds | 7-day query | results inside window | `TC-30 ranged view stays inside` |
| TC-31 | Range + status filter | date range + Confirmed | intersection | `TC-31 range + status filter` |
| TC-32 | Admin purge | DELETE appointment | 200, record gone (404) | `TC-32 / TC-32b` |
| TC-33 | Patient edits profile | PATCH own | 200 | `TC-33 patient updates own profile` |
| TC-34 | Doctor edits own fee | PATCH /doctors/:id | 200 | `TC-34 doctor updates own fee` |
| TC-35 | Admin edits linked name | PATCH with name | user name updated | `TC-35 admin edits the linked user name` |
| TC-36/37 | Soft delete / restore | deactivate then reactivate | directory 3 → 2 → 3 | `TC-36 / TC-37` |
| TC-38 | Deactivated login | inactive doctor login | 403 | `TC-38 deactivated account cannot log in` |
| TC-09 | Admin creates doctor | POST /doctors (user+profile) | 201, doctor can log in | `TC-09 / TC-09b / TC-09c` |
| TC-10b | Doctor edits weekly blocks | shrink then widen | grid 2 → 4 slots | `TC-10 doctor edits own weekly blocks` |
| TC-12 | Leave flag | `isAvailable: false` | grid 0, booking 400, hidden | `TC-12 leave flag empties the grid` |
| TC-39 | Self registration | valid patient payload | 201 patient role | `TC-39 self-service registration` |
| TC-40 | Duplicate email | registered email | 409 already exists | `TC-40 duplicate email rejected` |

## 2. Equivalence partitioning

| Class | Valid partition | Invalid partition |
| :--- | :--- | :--- |
| Registration email | `name@domain.tld` | blank / malformed / duplicate |
| Password | length 6–128 | shorter than 6 |
| Booking date | real day on or after today | past day / impossible day (`2026-02-30`) / malformed |
| Booking time | a grid `HH:MM` start | off-grid (`09:07`), `25:00`, missing |
| Doctor id | ObjectId of an active doctor | invalid ObjectId, deactivated, on leave |
| Symptoms | any length ≤ 2000 | longer than 2000 |
| Fee | number ≥ 0 | negative / non-numeric |
| Age | integer 0–130 | negative, > 130, non-numeric |
| Status | one of the 4 lifecycle states | any other string |
| Notes fields | non-empty within limits | whole record empty |
## 3. Boundary-value analysis (BVA)

| Boundary | Test | Expected |
| :--- | :--- | :--- |
| Cancellation cutoff | exactly < 2 h before start | 400 patient blocked (TC-22) |
| Notes window | exactly > 24 h after end | 400 doctor blocked (TC-21) |
| Password length | length 6 (min) vs 5 | 6 → 201; 5 → 400 (BV-07) |
| Slot duration | 5 and 240 minutes allowed | schema `min: 5, max: 240` |
| Slot grids | first slot at `startTime`, last ends ≤ `endTime` | unit `expandBlock` tests |
| Calendar days | 28/30/31 / leap February | `isRealDate` rejects 30 Feb |
| Fee | 0 allowed, negative rejected | `isFloat({min:0})` |

## 4. Unauthorized-access cases (RBAC)

| Test ID | Caller | Endpoint | Expected |
| :--- | :--- | :--- | :--- |
| SEC-01 | none | `GET /auth/me` | 401 missing token |
| SEC-02 | forged token | any authenticated route | 401 |
| SEC-06 | patient | `GET /patients` | 403 |
| SEC-07 | patient | `GET /appointments` (global) | 403 |
| SEC-08 | doctor | `POST /doctors` | 403 |
| SEC-09 | patient | `DELETE /appointments/:id` | 403 |
| SEC-10 | unrelated doctor | cancel another's appointment | 403 |
| SEC-11 | other patient | read another's record | 403 |
| SEC-15 | patient | drive lifecycle | 403 |
| SEC-16 | doctor | reschedule on patient's behalf | 403 |
| SEC-12 / SEC-17 | patient | edit / read another profile | 403 |
| SEC-13 | patient | role escalation via PATCH | role unchanged |
| SEC-14 | doctor | edit another doctor | 403 |
| SEC-03 | any | password hash serialised | never present |

## 5. Validation-middleware coverage

Every POST/PATCH body passes an express-validator chain before controller
logic ([`backend/src/middleware/validate.js`](../../backend/src/middleware/validate.js)):

- `POST /auth/register` → name, email, password 6–128, optional phone/age/gender/address/contact
- `POST /auth/login` → email + password present
- `POST /appointments` → `doctorId` MongoId, real `YYYY-MM-DD` date, `HH:MM` time, symptoms ≤ 2000
- `POST /:id/reschedule` → real date + `HH:MM` time
- `PATCH /:id/status` → one of the 4 lifecycle states
- `PATCH /:id/notes` → notes/diagnosis/prescription length limits
- `POST /doctors` (admin) → nested `availableSlots.*` weekday/time/duration rules
- `PATCH /doctors/:id`, `PATCH /patients/:id` → partial optional-field rules

Failures respond `400 { error: <first message>, details: [all messages] }`,
which keeps the existing client-side error formatter intact.