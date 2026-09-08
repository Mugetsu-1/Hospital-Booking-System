const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
const { unauthorized, forbidden } = require('../utils/errors');
const { asyncHandler } = require('../utils/errors');

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/** Returns user + token payload used by login responses. */
function buildAuthPayload(user) {
  return { token: signToken(user), user };
}

/**
 * requireAuth: verifies the Bearer token, loads the user and attaches it
 * to req.user. Inactive (soft-deleted) accounts cannot proceed.
 */
const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized('Authentication token is required');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (_err) {
    throw unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.id);
  if (!user) throw unauthorized('Account no longer exists');

  if (user.isActive === false) {
    throw forbidden('Account has been deactivated. Contact an administrator.');
  }

  req.user = user;
  next();
});

/** requireRole(...roles): RBAC gate used after requireAuth. */
const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw forbidden(`Access restricted to: ${roles.join(', ')}`);
    }
    next();
  };

module.exports = { signToken, buildAuthPayload, requireAuth, requireRole };
