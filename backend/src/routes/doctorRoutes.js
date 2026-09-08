const router = require('express').Router();
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
router.post('/', requireAuth, requireRole('admin'), ctrl.createDoctor);
router.patch('/:id', requireAuth, ctrl.updateDoctor);
router.patch('/:id/status', requireAuth, requireRole('admin'), ctrl.setDoctorActive);

module.exports = router;
