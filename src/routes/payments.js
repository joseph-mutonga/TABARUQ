const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken, isCashier, isAdmin } = require('../middleware/auth');

router.post('/stk-push', verifyToken, isCashier, paymentController.initiateSTKPush);
router.post('/offline-mpesa', verifyToken, isCashier, paymentController.recordOfflineMpesa);
router.get('/unlinked-incoming', verifyToken, isCashier, paymentController.getUnlinkedIncoming);
router.post('/apply-incoming-to-order', verifyToken, isCashier, paymentController.applyIncomingToOrder);
router.post('/callback', paymentController.mpesaCallback); // STK Callback
router.post('/c2b-confirmation', paymentController.mpesaC2BConfirmation); // Buy Goods Callback
router.post('/confirm/:paymentId', verifyToken, isCashier, paymentController.confirmPayment); // Cashier or Admin can confirm
router.get('/', verifyToken, isCashier, paymentController.getPayments);
router.get('/pending-count', verifyToken, isCashier, paymentController.getPendingCount);
router.get('/:id', verifyToken, isCashier, paymentController.getPaymentById);
router.post('/cash', verifyToken, isCashier, paymentController.processCashPayment);
router.post('/c2b-validation', paymentController.mpesaC2BValidation); // Buy Goods Validation
router.post('/register-c2b', verifyToken, isAdmin, paymentController.registerC2BURLs);

module.exports = router;
