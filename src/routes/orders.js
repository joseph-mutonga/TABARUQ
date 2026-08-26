const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken, isCashier, isAdmin } = require('../middleware/auth');

router.post('/', verifyToken, isCashier, orderController.createOrder);
router.get('/', verifyToken, isCashier, orderController.getOrders);
router.get('/scheduled', verifyToken, isCashier, orderController.getScheduledOrders);
router.post('/:id/release', verifyToken, isCashier, orderController.releaseScheduledOrder);
router.get('/:id', verifyToken, isCashier, orderController.getOrderDetails);
router.put('/:id/status', verifyToken, isCashier, orderController.updateOrderStatus);

module.exports = router;
