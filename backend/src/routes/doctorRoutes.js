const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/doctorController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Public-ish directory reads (any authenticated user may browse; the guard
// inside the controller relaxes/strengthens visibility per role).
router.get('/', requireAuth, ctrl.listDoctors);
// Must be registered before /:id so it is not shadowed.
router.get('/me', requireAuth, requireRole('doctor'), ctrl.getMyProfile);
router.get('/:id', requireAuth, ctrl.getDoctor);
router.get('/:id/slots', requireAuth, ctrl.getSlots);

// Write operations
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validate([
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }).withMessage('Name is too long'),
    body('email').trim().isEmail().withMessage('A valid email address is required').normalizeEmail(),
    body('password').isLength({ min: 6, max: 128 }).withMessage('Password must be 6-128 characters'),
    body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 32 }).withMessage('Phone number is too long'),
    body('specialization').trim().notEmpty().withMessage('Specialization is required').isLength({ max: 120 }).withMessage('Specialization is too long'),
    body('qualification').optional({ values: 'falsy' }).trim().isLength({ max: 200 }).withMessage('Qualification is too long'),
    body('consultationFee').isFloat({ min: 0 }).withMessage('Consultation fee must be zero or more'),
    body('isAvailable').optional({ values: 'falsy' }).isBoolean().withMessage('isAvailable must be a boolean'),
    body('availableSlots').isArray({ min: 1 }).withMessage('At least one working block is required'),
    // Nested wildcard rules validate each block inside availableSlots[].
    body('availableSlots.*.day').notEmpty().withMessage('Every block needs a weekday'),
    body('availableSlots.*.startTime').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('startTime must be HH:MM (24-hour)'),
    body('availableSlots.*.endTime').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('endTime must be HH:MM (24-hour)'),
    body('availableSlots.*.slotDurationMins').isInt({ min: 5, max: 240 }).withMessage('Slot length must be 5-240 minutes'),
  ]),
  ctrl.createDoctor
);
router.patch(
  '/:id',
  requireAuth,
  validate([
    body('name').optional({ values: 'falsy' }).trim().isLength({ max: 120 }).withMessage('Name is too long'),
    body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 32 }).withMessage('Phone number is too long'),
    body('specialization').optional({ values: 'falsy' }).trim().isLength({ max: 120 }).withMessage('Specialization is too long'),
    body('qualification').optional({ values: 'falsy' }).trim().isLength({ max: 200 }).withMessage('Qualification is too long'),
    body('consultationFee').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Consultation fee must be zero or more'),
    body('isAvailable').optional({ values: 'falsy' }).isBoolean().withMessage('isAvailable must be a boolean'),
    body('availableSlots').optional({ values: 'falsy' }).isArray().withMessage('availableSlots must be an array'),
  ]),
  ctrl.updateDoctor
);
router.patch('/:id/status', requireAuth, requireRole('admin'), ctrl.setDoctorActive);

module.exports = router;
