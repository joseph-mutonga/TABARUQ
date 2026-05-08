const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken, isCashier, isAdmin } = require('../middleware/auth');

router.post('/stk-push', verifyToken, isCashier, paymentController.initiateSTKPush);
router.post('/callback', paymentController.mpesaCallback); // STK Callback
router.post('/c2b-confirmation', paymentController.mpesaC2BConfirmation); // Buy Goods Callback
router.post('/confirm/:paymentId', verifyToken, isCashier, paymentController.confirmPayment); // Cashier or Admin can confirm
router.get('/', verifyToken, isAdmin, paymentController.getPayments);
router.get('/pending-count', verifyToken, isAdmin, paymentController.getPendingCount);
router.post('/cash', verifyToken, isCashier, paymentController.processCashPayment);

module.exports = router;
