const router = require('express').Router();
const ctrl = require('../controllers/patientController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('admin'), ctrl.listPatients);
router.get('/:id', requireAuth, ctrl.getPatient);
router.patch('/:id', requireAuth, ctrl.updatePatient);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.deletePatient);

module.exports = router;
