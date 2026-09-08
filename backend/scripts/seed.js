/**
 * Development seed: admin, demo patients, doctors with weekly schedules and a
 * few sample appointments on the coming days.
 *
 *   npm run seed            -> resets collections and inserts demo data
 *   SEED_RESET=false npm run seed  -> only inserts what is missing
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Doctor = require('../src/models/Doctor');
const Appointment = require('../src/models/Appointment');
const { weekdayOf } = require('../src/utils/slots');

const config = require('../src/config');

function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function seed() {
  const reset = process.env.SEED_RESET !== 'false';
  await mongoose.connect(config.mongoUri);
  console.log(`[seed] Connected. reset=${reset}`);

  if (reset) {
    await Promise.all([
      Appointment.deleteMany({}),
      Doctor.deleteMany({}),
      User.deleteMany({}),
    ]);
    console.log('[seed] Cleared existing users/doctors/appointments');
  }

  const hash = (pw) => bcrypt.hash(pw, 10);

  const admin = await User.findOneAndUpdate(
    { email: 'admin@hospital.com' },
    {
      $setOnInsert: {
        name: 'System Administrator',
        email: 'admin@hospital.com',
        passwordHash: await hash('Admin@123'),
        role: 'admin',
        phone: '0000000000',
        isActive: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // ---- Patients ---------------------------------------------------------
  const patientDefs = [
    { name: 'Alice Johnson', email: 'alice@example.com', password: 'Patient@123', age: 28, gender: 'Female', phone: '5550101', emergencyContact: '5550199' },
    { name: 'Bob Williams', email: 'bob@example.com', password: 'Patient@123', age: 45, gender: 'Male', phone: '5550102', emergencyContact: '5550198' },
    { name: 'Carol Chen', email: 'carol@example.com', password: 'Patient@123', age: 34, gender: 'Female', phone: '5550103', emergencyContact: '5550197' },
  ];

  const patients = {};
  for (const p of patientDefs) {
    const doc = await User.findOneAndUpdate(
      { email: p.email },
      {
        $setOnInsert: {
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
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
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
    let user = await User.findOne({ email: d.email });
    if (!user) {
      user = await User.create({
        name: d.name, email: d.email, passwordHash: await hash(d.password),
        role: 'doctor', phone: d.phone, isActive: true,
      });
    }
    let prof = await Doctor.findOne({ userId: user._id });
    if (!prof) {
      prof = await Doctor.create({
        userId: user._id, specialization: d.specialization,
        qualification: d.qualification, consultationFee: d.consultationFee,
        availableSlots: d.availableSlots,
        isAvailable: d.isAvailable !== false,
      });
    }
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

    const existing = await Appointment.findOne({
      doctorId: doctor._id,
      date,
      startTime: time,
      status: { $in: ['Pending', 'Confirmed'] },
    });
    if (existing) return;

    const mm = String(endMin % 60).padStart(2, '0');
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${mm}`;
    await Appointment.create({
      patientId: patient._id,
      doctorId: doctor._id,
      date,
      startTime: time,
      endTime,
      dateTime: new Date(`${date}T${time}:00`),
      status,
      symptoms,
    });
    console.log(`[seed] booked ${status}: ${patient.name} @ ${doctor.specialization} ${date} ${time}`);
  }
  function toMin(h) { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm; }

  await bookOrSkip(alice, doctors[0], 1, '09:00', 'Confirmed', 'Chest discomfort and palpitations');
  await bookOrSkip(alice, doctors[1], 2, '10:40', 'Pending', 'Skin rash on arms');
  await bookOrSkip(bob, doctors[2], 1, '11:30', 'Confirmed', 'Fever and cough for three days');
  await bookOrSkip(bob, doctors[0], 3, '17:00', 'Pending', 'Follow-up blood pressure review');

  console.log('[seed] Demo login accounts:');
  console.log('  admin   : admin@hospital.com / Admin@123');
  console.log('  doctor  : mehta@hospital.com / Doctor@123  (and sharma/verma/iyer)');
  console.log('  patient : alice@example.com / Patient@123  (and bob/carol)');

  await mongoose.disconnect();
  console.log('[seed] Done.');
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
