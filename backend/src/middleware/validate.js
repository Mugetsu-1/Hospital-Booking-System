/**
 * Request-validation middleware built on express-validator.
 *
 * `validate([...rules])` runs the supplied validation chain and, when any
 * rule fails, raises a 400 with the existing `{ error, details[] }` shape so
 * the frontend's error formatter and the e2e assertions keep working.
 */
const { validationResult } = require('express-validator');
const { HttpError } = require('../utils/errors');

function validate(rules) {
  return [
    ...rules,
    (req, _res, next) => {
      const errors = validationResult(req);
      if (errors.isEmpty()) return next();
      const messages = errors.array().map((e) => e.msg);
      // The first failure becomes the headline error; every message is also
      // exposed in `details` so clients can render them all together.
      const err = new HttpError(400, messages[0] || 'Validation failed', 'VALIDATION_ERROR');
      err.details = messages;
      next(err);
    },
  ];
}

module.exports = { validate };