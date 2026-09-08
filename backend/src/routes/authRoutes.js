const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Public
router.post(
  '/register',
  validate([
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }).withMessage('Name is too long'),
    body('email').trim().isEmail().withMessage('A valid email address is required').normalizeEmail(),
    body('password').isLength({ min: 6, max: 128 }).withMessage('Password must be 6-128 characters'),
    body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 32 }).withMessage('Phone number is too long'),
    body('age').optional({ values: 'falsy' }).isInt({ min: 0, max: 130 }).withMessage('Age must be a number between 0 and 130'),
    body('gender').optional({ values: 'falsy' }).isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female or Other'),
    body('address').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Address is too long'),
    body('emergencyContact').optional({ values: 'falsy' }).trim().isLength({ max: 32 }).withMessage('Emergency contact is too long'),
  ]),
  ctrl.register
);
router.post(
  '/login',
  validate([
    body('email').trim().notEmpty().withMessage('Email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ]),
  ctrl.login
);

// Authenticated
router.get('/me', requireAuth, ctrl.me);
router.post('/refresh', requireAuth, ctrl.refresh);

// Allow the admin-only branches inside register to see req.user.
router.post('/register-admin', requireAuth, requireRole('admin'), ctrl.register);

module.exports = router;
