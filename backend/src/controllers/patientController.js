const User = require('../models/User');
const { asyncHandler, notFound, badRequest, forbidden } = require('../utils/errors');

/** GET /api/patients?q=&role= — admin directory of patient accounts. */
const listPatients = asyncHandler(async (req, res) => {
  const { q = '', includeInactive = 'false' } = req.query;

  const filter = { role: 'patient' };
  if (includeInactive !== 'true') filter.isActive = true;
  if (q.trim()) {
    filter.$or = [
      { name: new RegExp(q.trim(), 'i') },
      { email: new RegExp(q.trim(), 'i') },
      { phone: new RegExp(q.trim(), 'i') },
    ];
  }

  const users = await User.find(filter).sort({ createdAt: -1 });
  res.json({ count: users.length, data: users });
});

/** GET /api/patients/:id — patient themselves or an admin. */
const getPatient = asyncHandler(async (req, res) => {
  const patient = await User.findOne({ _id: req.params.id, role: 'patient' });
  if (!patient) throw notFound('Patient not found');

  const isSelf = req.user.role === 'patient' && req.user._id.equals(patient._id);
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) throw forbidden('You cannot view this profile');

  res.json({ data: patient });
});

/** PATCH /api/patients/:id — patient edits their own profile, or an admin. */
const updatePatient = asyncHandler(async (req, res) => {
  const patient = await User.findOne({ _id: req.params.id, role: 'patient' });
  if (!patient) throw notFound('Patient not found');

  const isSelf = req.user.role === 'patient' && req.user._id.equals(patient._id);
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) throw forbidden('You cannot edit this profile');

  const allowed = ['name', 'phone', 'age', 'gender', 'address', 'emergencyContact'];
  for (const key of allowed) {
    if (key in req.body) patient[key] = req.body[key];
  }
  await patient.save();
  res.json({ data: patient });
});

/**
 * DELETE /api/patients/:id — admin soft-delete (deactivate) + archive.
 * Historical appointments remain intact for the record trail.
 */
const deletePatient = asyncHandler(async (req, res) => {
  const patient = await User.findOne({ _id: req.params.id, role: 'patient' });
  if (!patient) throw notFound('Patient not found');

  const { isActive = false } = req.body;
  if (typeof isActive !== 'boolean') throw badRequest('isActive must be a boolean');

  patient.isActive = isActive;
  await patient.save();

  res.json({
    message: isActive ? 'Patient account reactivated' : 'Patient account deactivated',
    data: patient,
  });
});

module.exports = { listPatients, getPatient, updatePatient, deletePatient };
