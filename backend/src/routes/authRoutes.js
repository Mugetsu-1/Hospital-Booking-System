const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Public
router.post('/register', ctrl.register);
router.post('/login', ctrl.login);

// Authenticated
router.get('/me', requireAuth, ctrl.me);
router.post('/refresh', requireAuth, ctrl.refresh);

// Allow the admin-only branches inside register to see req.user.
router.post('/register-admin', requireAuth, requireRole('admin'), ctrl.register);

module.exports = router;
