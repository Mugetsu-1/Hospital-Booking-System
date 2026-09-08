/**
 * Small HTTP error helper + async wrapper so controllers can stay clean.
 */

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || `HTTP_${status}`;
  }
}

const notFound = (msg = 'Resource not found') => new HttpError(404, msg);
const badRequest = (msg = 'Invalid request') => new HttpError(400, msg);
const conflict = (msg = 'Conflict') => new HttpError(409, msg);
const forbidden = (msg = 'Forbidden') => new HttpError(403, msg);
const unauthorized = (msg = 'Unauthorized') => new HttpError(401, msg);

/** Wrap an async route handler so rejections reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  HttpError,
  notFound,
  badRequest,
  conflict,
  forbidden,
  unauthorized,
  asyncHandler,
};
