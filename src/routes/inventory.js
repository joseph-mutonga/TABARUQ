const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { verifyToken, isAdmin, isCashier } = require('../middleware/auth');

router.get('/', verifyToken, isCashier, inventoryController.getItems);

router.post('/', verifyToken, isAdmin, inventoryController.addItem);
router.put('/:id', verifyToken, isAdmin, inventoryController.updateItem);
router.put('/restock/:id', verifyToken, isAdmin, inventoryController.restockItem);
router.put('/use/:id', verifyToken, isAdmin, inventoryController.recordUsage);
router.delete('/:id', verifyToken, isAdmin, inventoryController.deleteItem);


module.exports = router;
