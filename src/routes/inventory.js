const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { verifyToken, isAdmin, isCashier } = require('../middleware/auth');

router.get('/', verifyToken, isCashier, inventoryController.getItems);
router.get('/deduction-rules', verifyToken, isAdmin, inventoryController.getDeductionRules);
router.get('/stock-logs', verifyToken, isCashier, inventoryController.getStockFlow);
router.get('/production', verifyToken, isCashier, inventoryController.getProductionRecords);

router.post('/', verifyToken, isAdmin, inventoryController.addItem);
router.post('/deduction-rules', verifyToken, isAdmin, inventoryController.saveDeductionRule);
router.delete('/deduction-rules/:id', verifyToken, isAdmin, inventoryController.deleteDeductionRule);
router.post('/production', verifyToken, isCashier, inventoryController.recordProduction);
router.put('/:id', verifyToken, isAdmin, inventoryController.updateItem);
router.put('/restock/:id', verifyToken, isAdmin, inventoryController.restockItem);
router.put('/use/:id', verifyToken, isAdmin, inventoryController.recordUsage);
router.delete('/:id', verifyToken, isAdmin, inventoryController.deleteItem);


module.exports = router;
