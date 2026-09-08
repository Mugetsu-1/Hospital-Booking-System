const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/patientController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('admin'), ctrl.listPatients);
router.get('/:id', requireAuth, ctrl.getPatient);
router.patch(
  '/:id',
  requireAuth,
  validate([
    body('name').optional({ values: 'falsy' }).trim().isLength({ min: 1, max: 120 }).withMessage('Name is too long'),
    body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 32 }).withMessage('Phone number is too long'),
    body('age').optional({ values: 'falsy' }).isInt({ min: 0, max: 130 }).withMessage('Age must be a number between 0 and 130'),
    body('gender').optional({ values: 'falsy' }).isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female or Other'),
    body('address').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Address is too long'),
    body('emergencyContact').optional({ values: 'falsy' }).trim().isLength({ max: 32 }).withMessage('Emergency contact is too long'),
  ]),
  ctrl.updatePatient
);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.deletePatient);

module.exports = router;
