const router = require('express').Router();
const ctrl = require('../controllers/appointmentController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Booking (patient) & role-scoped listing
router.post('/', requireAuth, requireRole('patient'), ctrl.createAppointment);
router.get('/my', requireAuth, requireRole('patient'), ctrl.listMine);
router.get('/doctor', requireAuth, requireRole('doctor'), ctrl.listForDoctor);
router.get('/', requireAuth, requireRole('admin'), ctrl.listAll);

// Single-appointment operations (visibility enforced in controller)
router.get('/:id', requireAuth, ctrl.getOne);
router.post('/:id/reschedule', requireAuth, ctrl.reschedule);
router.post('/:id/cancel', requireAuth, ctrl.cancelAppointment);
router.patch('/:id/status', requireAuth, ctrl.updateStatus);
router.patch('/:id/notes', requireAuth, ctrl.saveNotes);

// Hard delete of a medical record (Module 4 "Delete") — administrators only.
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.purgeAppointment);

module.exports = router;
