/**
 * Response shaping helpers. Every API payload passes through one of these so
 * that:
 *  - `passwordHash` can never leak into a response,
 *  - relation rows (Prisma `include`) are flattened into the field names the
 *    React client already renders (`doctorName`, `patientPhone`, …).
 */

/** User row without credentials — safe to embed in any response. */
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

/** Directory/listing projection of a Doctor with its User relation included. */
function doctorSummary(doctor) {
  const user = doctor.user || {};
  return {
    id: doctor.id,
    doctorName: user.name || '',
    phone: user.phone || '',
    email: user.email || '',
    specialization: doctor.specialization,
    qualification: doctor.qualification,
    consultationFee: doctor.consultationFee,
    availableSlots: doctor.availableSlots,
    isAvailable: doctor.isAvailable,
    isActive: doctor.isActive,
    createdAt: doctor.createdAt,
  };
}

/**
 * Appointment projection. Expects `doctor: { user: {...} }` and `patient`
 * relations to be included; falls back to bare foreign keys otherwise.
 */
function appointmentSummary(appointment) {
  const doctor = appointment.doctor || {};
  const doctorUser = doctor.user || {};
  const patient = appointment.patient || {};
  return {
    id: appointment.id,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    dateTime: appointment.dateTime,
    status: appointment.status,
    symptoms: appointment.symptoms,
    consultationNotes: appointment.consultationNotes,
    diagnosis: appointment.diagnosis,
    prescription: appointment.prescription,
    notesLastEditedAt: appointment.notesLastEditedAt,
    cancelledBy: appointment.cancelledBy,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
    doctorName: doctorUser.name || '',
    doctorSpecialization: doctor.specialization || '',
    doctorQualification: doctor.qualification || '',
    doctorPhone: doctorUser.phone || '',
    doctorConsultationFee: doctor.consultationFee ?? null,
    patientName: patient.name || '',
    patientPhone: patient.phone || '',
    patientEmail: patient.email || '',
    patientAge: patient.age ?? null,
    patientGender: patient.gender || '',
  };
}

module.exports = { publicUser, doctorSummary, appointmentSummary };
