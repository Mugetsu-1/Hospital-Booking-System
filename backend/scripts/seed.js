/**
 * Development seed: admin, demo patients, doctors with weekly schedules and a
 * few sample appointments on the coming days.
 *
 *   npm run seed                   -> resets tables and inserts demo data
 *   SEED_RESET=false npm run seed  -> only inserts what is missing
 *
 * Requires the schema to exist first: `npm run db:setup`.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { prisma, connectDB, disconnectDB } = require('../src/db');
const { weekdayOf } = require('../src/utils/slots');

function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function toMin(h) {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
}

async function seed() {
  const reset = process.env.SEED_RESET !== 'false';
  await connectDB();
  console.log(`[seed] Connected. reset=${reset}`);

  if (reset) {
    // Child rows first (foreign keys), then the accounts they depend on.
    await prisma.appointment.deleteMany({});
    await prisma.doctor.deleteMany({});
    await prisma.user.deleteMany({});
    console.log('[seed] Cleared existing users/doctors/appointments');
  }

  const hash = (pw) => bcrypt.hash(pw, 10);

  await prisma.user.upsert({
    where: { email: 'admin@hospital.com' },
    update: {},
    create: {
      name: 'System Administrator',
      email: 'admin@hospital.com',
      passwordHash: await hash('Admin@123'),
      role: 'admin',
      phone: '0000000000',
      isActive: true,
    },
  });

  // ---- Patients ---------------------------------------------------------
  const patientDefs = [
    { name: 'Alice Johnson', email: 'alice@example.com', password: 'Patient@123', age: 28, gender: 'Female', phone: '5550101', emergencyContact: '5550199' },
    { name: 'Bob Williams', email: 'bob@example.com', password: 'Patient@123', age: 45, gender: 'Male', phone: '5550102', emergencyContact: '5550198' },
    { name: 'Carol Chen', email: 'carol@example.com', password: 'Patient@123', age: 34, gender: 'Female', phone: '5550103', emergencyContact: '5550197' },
  ];

  const patients = {};
  for (const p of patientDefs) {
    const doc = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        name: p.name,
        email: p.email,
        passwordHash: await hash(p.password),
        role: 'patient',
        age: p.age,
        gender: p.gender,
        phone: p.phone,
        emergencyContact: p.emergencyContact,
        isActive: true,
      },
    });
    patients[p.email] = doc;
  }
  console.log(`[seed] Patients ready: ${Object.keys(patients).length}`);

  // ---- Doctors ----------------------------------------------------------
  const doctorDefs = [
    {
      email: 'mehta@hospital.com', password: 'Doctor@123', name: 'Dr. Arjun Mehta',
      phone: '5550201', specialization: 'Cardiologist', qualification: 'MD, DM (Cardiology)',
      consultationFee: 800,
      availableSlots: [
        { day: 'Monday', startTime: '09:00', endTime: '13:00', slotDurationMins: 30 },
        { day: 'Tuesday', startTime: '09:00', endTime: '13:00', slotDurationMins: 30 },
        { day: 'Wednesday', startTime: '09:00', endTime: '13:00', slotDurationMins: 30 },
        { day: 'Thursday', startTime: '16:00', endTime: '19:00', slotDurationMins: 30 },
        { day: 'Friday', startTime: '16:00', endTime: '19:00', slotDurationMins: 30 },
      ],
    },
    {
      email: 'sharma@hospital.com', password: 'Doctor@123', name: 'Dr. Priya Sharma',
      phone: '5550202', specialization: 'Dermatologist', qualification: 'MBBS, MD (Dermatology)',
      consultationFee: 500,
      availableSlots: [
        { day: 'Monday', startTime: '10:00', endTime: '14:00', slotDurationMins: 20 },
        { day: 'Tuesday', startTime: '10:00', endTime: '14:00', slotDurationMins: 20 },
        { day: 'Wednesday', startTime: '10:00', endTime: '14:00', slotDurationMins: 20 },
        { day: 'Thursday', startTime: '10:00', endTime: '14:00', slotDurationMins: 20 },
        { day: 'Friday', startTime: '10:00', endTime: '14:00', slotDurationMins: 20 },
      ],
    },
    {
      email: 'verma@hospital.com', password: 'Doctor@123', name: 'Dr. Rahul Verma',
      phone: '5550203', specialization: 'General Physician', qualification: 'MBBS',
      consultationFee: 300,
      availableSlots: [
        { day: 'Monday', startTime: '09:00', endTime: '17:00', slotDurationMins: 15 },
        { day: 'Tuesday', startTime: '09:00', endTime: '17:00', slotDurationMins: 15 },
        { day: 'Wednesday', startTime: '09:00', endTime: '17:00', slotDurationMins: 15 },
        { day: 'Thursday', startTime: '09:00', endTime: '17:00', slotDurationMins: 15 },
        { day: 'Friday', startTime: '09:00', endTime: '17:00', slotDurationMins: 15 },
      ],
    },
    {
      email: 'iyer@hospital.com', password: 'Doctor@123', name: 'Dr. Sneha Iyer',
      phone: '5550204', specialization: 'Pediatrician', qualification: 'MD (Pediatrics)',
      consultationFee: 600,
      isAvailable: false,
      availableSlots: [
        { day: 'Monday', startTime: '09:00', endTime: '13:00', slotDurationMins: 30 },
        { day: 'Wednesday', startTime: '09:00', endTime: '13:00', slotDurationMins: 30 },
        { day: 'Friday', startTime: '09:00', endTime: '13:00', slotDurationMins: 30 },
      ],
    },
  ];

  const doctors = [];
  for (const d of doctorDefs) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: {},
      create: {
        name: d.name, email: d.email, passwordHash: await hash(d.password),
        role: 'doctor', phone: d.phone, isActive: true,
      },
    });
    const prof = await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id, specialization: d.specialization,
        qualification: d.qualification, consultationFee: d.consultationFee,
        availableSlots: d.availableSlots,
        isAvailable: d.isAvailable !== false,
      },
    });
    doctors.push(prof);
  }
  console.log(`[seed] Doctors ready: ${doctors.length}`);

  // ---- Sample appointments (created as Pending/Confirmed) ----------------
  const alice = patients['alice@example.com'];
  const bob = patients['bob@example.com'];

  async function bookOrSkip(patient, doctor, dayOffset, time, status, symptoms) {
    const date = daysFromToday(dayOffset);
    const weekday = weekdayOf(date);
    const block = (doctor.availableSlots || []).find(
      (b) => b.day === weekday && toMin(time) >= toMin(b.startTime) && toMin(time) < toMin(b.endTime)
    );
    if (!block) return; // weekday mismatch in demo data -> skip silently
    const startMin = toMin(time);
    const endMin = startMin + block.slotDurationMins;

    const existing = await prisma.appointment.findFirst({
      where: {
        doctorId: doctor.id,
        date,
        startTime: time,
        status: { in: ['Pending', 'Confirmed'] },
      },
    });
    if (existing) return;

    const mm = String(endMin % 60).padStart(2, '0');
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${mm}`;
    await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.id,
        date,
        startTime: time,
        endTime,
        dateTime: new Date(`${date}T${time}:00`),
        status,
        symptoms,
      },
    });
    console.log(`[seed] booked ${status}: ${patient.name} @ ${doctor.specialization} ${date} ${time}`);
  }

  await bookOrSkip(alice, doctors[0], 1, '09:00', 'Confirmed', 'Chest discomfort and palpitations');
  await bookOrSkip(alice, doctors[1], 2, '10:40', 'Pending', 'Skin rash on arms');
  await bookOrSkip(bob, doctors[2], 1, '11:30', 'Confirmed', 'Fever and cough for three days');
  await bookOrSkip(bob, doctors[0], 3, '17:00', 'Pending', 'Follow-up blood pressure review');

  // Deterministic records — independent of the weekday the seed happens to run
  // on — so the admin revenue KPI, the ledger fee column, and the doctor's
  // day-view queue always have data (and a Completed visit to demo).
  const carol = patients['carol@example.com'];
  const mehta = doctors[0];

  async function createAppt(patient, doctor, date, time, durMin, status, extra = {}) {
    const startMin = toMin(time);
    const endMin = startMin + durMin;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    const existing = await prisma.appointment.findFirst({
      where: { doctorId: doctor.id, date, startTime: time, status: { in: ['Pending', 'Confirmed'] } },
    });
    if (existing && status !== 'Completed') return;
    await prisma.appointment.create({
      data: {
        patientId: patient.id, doctorId: doctor.id, date, startTime: time, endTime,
        dateTime: new Date(`${date}T${time}:00`), status, symptoms: extra.symptoms || '',
        diagnosis: extra.diagnosis || '', prescription: extra.prescription || '',
        consultationNotes: extra.consultationNotes || '',
        notesLastEditedAt: extra.consultationNotes ? new Date() : null,
      },
    });
    console.log(`[seed] ${status}: ${patient.name} @ ${doctor.specialization} ${date} ${time}`);
  }

  await createAppt(alice, mehta, daysFromToday(-2), '09:00', 30, 'Completed', {
    symptoms: 'Chest discomfort and palpitations after exertion',
    diagnosis: 'Stable angina; mild hypertension',
    prescription: 'Amlodipine 5mg once daily; Aspirin 75mg once daily',
    consultationNotes: 'BP 140/90. ECG normal. Advised low-salt diet and 30-min daily walk. Review in 4 weeks.',
  });
  await createAppt(bob, mehta, daysFromToday(0), '16:00', 30, 'Confirmed', {
    symptoms: 'Follow-up blood pressure review',
  });
  await createAppt(carol, mehta, daysFromToday(0), '16:30', 30, 'Pending', {
    symptoms: 'Occasional chest tightness',
  });

  console.log('[seed] Demo login accounts:');
  console.log('  admin   : admin@hospital.com / Admin@123');
  console.log('  doctor  : mehta@hospital.com / Doctor@123  (and sharma/verma/iyer)');
  console.log('  patient : alice@example.com / Patient@123  (and bob/carol)');

  await disconnectDB();
  console.log('[seed] Done.');
}

seed().catch(async (err) => {
  console.error('[seed] Failed:', err);
  try {
    await disconnectDB();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
