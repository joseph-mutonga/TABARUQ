const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { verifyToken, isAdmin } = require('../middleware/auth');

router.get('/', verifyToken, isAdmin, expenseController.getExpenses);
router.post('/', verifyToken, isAdmin, expenseController.addExpense);
router.delete('/:id', verifyToken, isAdmin, expenseController.deleteExpense);

module.exports = router;
