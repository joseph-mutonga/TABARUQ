const express = require('express');
const router = express.Router();
const workerController = require('../controllers/workerController');
const { verifyToken, isAdmin } = require('../middleware/auth');

router.get('/', verifyToken, isAdmin, workerController.getWorkers);
router.post('/', verifyToken, isAdmin, workerController.addWorker);
router.put('/:id', verifyToken, isAdmin, workerController.updateWorker);
router.delete('/:id', verifyToken, isAdmin, workerController.deleteWorker);

router.get('/payments', verifyToken, isAdmin, workerController.getWorkerPayments);
router.post('/payments', verifyToken, isAdmin, workerController.recordWorkerPayment);

router.get('/attendance', verifyToken, isAdmin, workerController.getAttendance);
router.get('/weekly-attendance', verifyToken, isAdmin, workerController.getWeeklyAttendance);
router.post('/attendance', verifyToken, isAdmin, workerController.markAttendance);


module.exports = router;
