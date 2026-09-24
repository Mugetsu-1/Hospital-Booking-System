const { prisma } = require('../db');
const { publicUser } = require('../utils/serialize');
const { asyncHandler, notFound, badRequest, forbidden } = require('../utils/errors');

/** GET /api/patients?q=&includeInactive= — admin directory of patient accounts. */
const listPatients = asyncHandler(async (req, res) => {
  const { q = '', includeInactive = 'false' } = req.query;

  const where = { role: 'patient' };
  if (includeInactive !== 'true') where.isActive = true;
  if (q.trim()) {
    const term = q.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json({ count: users.length, data: users.map(publicUser) });
});

/** GET /api/patients/:id — patient themselves or an admin. */
const getPatient = asyncHandler(async (req, res) => {
  const patient = await prisma.user.findFirst({
    where: { id: req.params.id, role: 'patient' },
  });
  if (!patient) throw notFound('Patient not found');

  const isSelf = req.user.role === 'patient' && req.user.id === patient.id;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) throw forbidden('You cannot view this profile');

  res.json({ data: publicUser(patient) });
});

/** PATCH /api/patients/:id — patient edits their own profile, or an admin. */
const updatePatient = asyncHandler(async (req, res) => {
  const patient = await prisma.user.findFirst({
    where: { id: req.params.id, role: 'patient' },
  });
  if (!patient) throw notFound('Patient not found');

  const isSelf = req.user.role === 'patient' && req.user.id === patient.id;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) throw forbidden('You cannot edit this profile');

  const data = {};
  const allowed = ['name', 'phone', 'age', 'gender', 'address', 'emergencyContact'];
  for (const key of allowed) {
    if (key in req.body) data[key] = req.body[key];
  }
  if ('age' in data) {
    data.age = data.age === '' || data.age === null ? null : Number(data.age);
  }

  const updated = await prisma.user.update({ where: { id: patient.id }, data });
  res.json({ data: publicUser(updated) });
});

/**
 * DELETE /api/patients/:id — admin soft-delete (deactivate) + archive.
 * Historical appointments remain intact for the record trail.
 */
const deletePatient = asyncHandler(async (req, res) => {
  const patient = await prisma.user.findFirst({
    where: { id: req.params.id, role: 'patient' },
  });
  if (!patient) throw notFound('Patient not found');

  const { isActive = false } = req.body;
  if (typeof isActive !== 'boolean') throw badRequest('isActive must be a boolean');

  const updated = await prisma.user.update({ where: { id: patient.id }, data: { isActive } });

  res.json({
    message: isActive ? 'Patient account reactivated' : 'Patient account deactivated',
    data: publicUser(updated),
  });
});

module.exports = { listPatients, getPatient, updatePatient, deletePatient };
