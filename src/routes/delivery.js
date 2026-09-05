const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const { verifyToken, isAdmin, isCashier } = require('../middleware/auth');

// Webhook (Public or platform-authenticated)
router.post('/webhook', deliveryController.handleWebhookOrder);

// Status Management (Cashier/Admin)
router.get('/orders', verifyToken, isCashier, deliveryController.getDeliveryOrders);
router.post('/orders/:id/status', verifyToken, isCashier, deliveryController.updateDeliveryStatus);

// Reconciliation (Admin only)
router.post('/settlements', verifyToken, isAdmin, deliveryController.recordSettlement);
router.get('/settlements', verifyToken, isAdmin, deliveryController.getSettlements);
router.get('/reports/reconciliation', verifyToken, isAdmin, deliveryController.getReconciliationReport);
router.get('/reports/stats', verifyToken, isAdmin, deliveryController.getDeliveryStats);
router.get('/commissions', verifyToken, isAdmin, deliveryController.getCommissions);
router.post('/commissions', verifyToken, isAdmin, deliveryController.saveCommissions);

module.exports = router;
