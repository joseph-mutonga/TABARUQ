const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Routes for C2B Confirmation and Validation
router.post('/confirmation', paymentController.mpesaC2BConfirmation);
router.post('/validation', paymentController.mpesaC2BValidation);

module.exports = router;
