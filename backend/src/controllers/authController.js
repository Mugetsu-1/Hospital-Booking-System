const bcrypt = require('bcryptjs');
const { prisma } = require('../db');
const { buildAuthPayload, signToken } = require('../middleware/auth');
const {
  asyncHandler,
  badRequest,
  conflict,
  forbidden,
  unauthorized,
} = require('../utils/errors');

/** Normalise an optional numeric field (empty strings become NULL). */
function optionalInt(value) {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
}

/**
 * POST /api/auth/register
 * Public patient self-registration. Only an authenticated admin may create
 * doctor / admin accounts through this endpoint (otherwise they should use
 * the dedicated admin doctor-creation flow).
 */
const register = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    phone = '',
    age,
    gender = '',
    address = '',
    emergencyContact = '',
    role = 'patient',
  } = req.body;

  if (!name || !email || !password) {
    throw badRequest('name, email and password are required');
  }
  if (String(password).length < 6) {
    throw badRequest('Password must be at least 6 characters');
  }

  if (role !== 'patient') {
    const caller = req.user;
    if (!caller || caller.role !== 'admin') {
      throw forbidden('Only an administrator may create doctor/admin accounts');
    }
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash,
        role,
        phone,
        age: optionalInt(age),
        gender,
        address,
        emergencyContact,
      },
    });
  } catch (err) {
    // Race-condition guard on the unique email constraint.
    if (err.code === 'P2002') throw conflict('An account with this email already exists');
    throw err;
  }

  res.status(201).json(buildAuthPayload(user));
});

/**
 * POST /api/auth/login
 * Verifies credentials, rejects deactivated accounts, returns a signed JWT.
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw badRequest('email and password are required');

  const user = await prisma.user.findUnique({
    where: { email: String(email).trim().toLowerCase() },
  });
  if (!user) throw unauthorized('Invalid email or password');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw unauthorized('Invalid email or password');

  if (user.isActive === false) {
    throw forbidden('Account has been deactivated. Contact an administrator.');
  }

  res.json(buildAuthPayload(user));
});

/** GET /api/auth/me — current authenticated user. */
const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

/** POST /api/auth/refresh — returns a fresh token for an active session. */
const refresh = asyncHandler(async (req, res) => {
  res.json({ token: signToken(req.user) });
});

module.exports = { register, login, me, refresh };
