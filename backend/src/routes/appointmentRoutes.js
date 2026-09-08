const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/appointmentController');
const Appointment = require('../models/Appointment');
const { isRealDate } = require('../utils/slots');
const { requireAuth, requireRole } = require('../middleware/auth');

/** Shared rules for a slot: real calendar day + 24-hour HH:MM start time. */
const slotRules = () => [
  body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be a valid YYYY-MM-DD value'),
  body('date').custom(isRealDate).withMessage('date is not a real calendar day'),
  body('time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('time must be in HH:MM (24-hour) format'),
];

// Booking (patient) & role-scoped listing
router.post(
  '/',
  requireAuth,
  requireRole('patient'),
  validate([
    body('doctorId').notEmpty().withMessage('doctorId is required').isMongoId().withMessage('Invalid doctorId'),
    ...slotRules(),
    body('symptoms').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }).withMessage('Symptoms must be 2000 characters or fewer'),
  ]),
  ctrl.createAppointment
);
router.get('/my', requireAuth, requireRole('patient'), ctrl.listMine);
router.get('/doctor', requireAuth, requireRole('doctor'), ctrl.listForDoctor);
router.get('/', requireAuth, requireRole('admin'), ctrl.listAll);

// Single-appointment operations (visibility enforced in controller)
router.get('/:id', requireAuth, ctrl.getOne);
router.post('/:id/reschedule', requireAuth, validate(slotRules()), ctrl.reschedule);
router.post('/:id/cancel', requireAuth, ctrl.cancelAppointment);
router.patch(
  '/:id/status',
  requireAuth,
  validate([body('status').isIn(Appointment.STATUSES).withMessage('Invalid appointment status')]),
  ctrl.updateStatus
);
router.patch(
  '/:id/notes',
  requireAuth,
  validate([
    body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }).withMessage('Notes must be 5000 characters or fewer'),
    body('diagnosis').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }).withMessage('Diagnosis must be 2000 characters or fewer'),
    body('prescription').optional({ values: 'falsy' }).trim().isLength({ max: 2000 }).withMessage('Prescription must be 2000 characters or fewer'),
  ]),
  ctrl.saveNotes
);

// Hard delete of a medical record (Module 4 "Delete") — administrators only.
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.purgeAppointment);

module.exports = router;
