const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const { verifyToken, isAdmin, isCashier } = require('../middleware/auth');

router.get('/current', verifyToken, isCashier, shiftController.getCurrent);
router.post('/start', verifyToken, isCashier, shiftController.start);
router.post('/admin-start', verifyToken, isAdmin, shiftController.adminStart);
router.post('/close', verifyToken, isCashier, shiftController.close);
router.get('/', verifyToken, isAdmin, shiftController.getSummaries);

module.exports = router;