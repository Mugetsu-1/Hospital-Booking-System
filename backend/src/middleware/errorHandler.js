const { HttpError } = require('../utils/errors');
const config = require('../config');

/** 404 fallback for unknown API routes. */
function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Describe a Prisma unique-constraint violation (P2002) as a lowercase
 * string. Prisma 7 with a driver adapter reports the underlying Postgres
 * constraint inside `meta.driverAdapterError.cause`; plain Prisma
 * deployments report `meta.target`. Both shapes are handled.
 */
function uniqueViolationTarget(err) {
  const parts = [];
  const cause = err.meta && err.meta.driverAdapterError && err.meta.driverAdapterError.cause;
  if (cause) {
    if (cause.constraint && cause.constraint.index) parts.push(cause.constraint.index);
    if (cause.table) parts.push(cause.table);
    if (cause.originalMessage) parts.push(cause.originalMessage);
  }
  if (err.meta && err.meta.target) {
    parts.push(Array.isArray(err.meta.target) ? err.meta.target.join(', ') : String(err.meta.target));
  }
  if (err.meta && err.meta.modelName) parts.push(err.meta.modelName);
  return parts.join(' ').toLowerCase();
}

/** Central error handler: normalises thrown errors to JSON responses. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  // Postgres unique violations -> 409. The partial slot index is the
  // backstop that resolves simultaneous bookings of the same slot.
  if (err.code === 'P2002') {
    const target = uniqueViolationTarget(err);
    if (/appointment|slot|start_time/.test(target)) {
      return res.status(409).json({ error: 'This time slot has just been booked by another patient.' });
    }
    if (/email|users/.test(target)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    return res.status(409).json({ error: 'Duplicate value detected' });
  }

  // Record required by the operation was not found.
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Resource not found' });
  }

  // Foreign-key violations (e.g. a linked account disappeared mid-request).
  if (err.code === 'P2003') {
    return res.status(400).json({ error: 'Related record does not exist' });
  }

  // Malformed query data handed to Prisma (bad enum, wrong type…).
  if (err.name === 'PrismaClientValidationError') {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  if (err instanceof HttpError || err.status) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      // Validation middleware attaches a `details` array of field messages.
      ...(Array.isArray(err.details) && err.details.length ? { details: err.details } : {}),
    });
  }

  console.error('[error]', err);
  return res.status(500).json({
    error: 'Internal server error',
    // Expose the message only outside production to ease lab debugging.
    ...(process.env.NODE_ENV !== 'production' && config.jwtSecret.includes('dev') && { detail: err.message }),
  });
}

module.exports = { notFoundHandler, errorHandler };
