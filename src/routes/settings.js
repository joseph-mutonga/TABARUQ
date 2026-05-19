const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { verifyToken, isAdmin } = require('../middleware/auth');

router.get('/receipt', verifyToken, settingsController.getReceiptSettings); // Allow cashiers to fetch it too for printing
router.post('/receipt', verifyToken, isAdmin, settingsController.saveReceiptSettings); // Only admin can save

module.exports = router;
