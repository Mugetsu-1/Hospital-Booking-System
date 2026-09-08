const { HttpError } = require('../utils/errors');
const config = require('../config');

/** 404 fallback for unknown API routes. */
function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/** Central error handler: normalises thrown errors to JSON responses. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  // Mongoose validation errors -> 400
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: 'Validation failed', details });
  }

  // Mongo duplicate key -> 409 (backstop for the double-booking index)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).join(', ');
    const message = /^doctorId/i.test(field)
      ? 'This time slot has just been booked by another patient.'
      : `Duplicate value detected on: ${field}`;
    return res.status(409).json({ error: message });
  }

  // Cast errors (bad ObjectId, etc.) -> 400
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid value for field "${err.path}"` });
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
