const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { verifyToken, isAdmin } = require('../middleware/auth');

router.get('/sales', verifyToken, isAdmin, reportController.getSalesReport);
router.get('/inventory', verifyToken, isAdmin, reportController.getInventoryReport);
router.get('/profit-loss', verifyToken, isAdmin, reportController.getProfitLossReport);
router.get('/transactions', verifyToken, isAdmin, reportController.getTransactionHistory);
router.get('/popular', verifyToken, isAdmin, reportController.getPopularItems);

module.exports = router;
