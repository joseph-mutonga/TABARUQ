const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { verifyToken, isAdmin } = require('../middleware/auth');

// ── Receipt Settings ──────────────────────────────────────────────────────────
router.get('/receipt', verifyToken, settingsController.getReceiptSettings);           // Allow cashiers to fetch it too for printing
router.post('/receipt', verifyToken, isAdmin, settingsController.saveReceiptSettings); // Only admin can save
router.post('/open-drawer', verifyToken, settingsController.openCashDrawer);           // Any logged-in staff can trigger drawer

// ── Stock Deduction Rules ─────────────────────────────────────────────────────
router.get('/deduction-rules', verifyToken, settingsController.getDeductionRules);
router.post('/deduction-rules', verifyToken, isAdmin, settingsController.saveDeductionRule);
router.delete('/deduction-rules/:id', verifyToken, isAdmin, settingsController.deleteDeductionRule);

// ── Combo / Bundle Recipes ────────────────────────────────────────────────────
router.get('/recipes', verifyToken, settingsController.getRecipes);
router.post('/recipes', verifyToken, isAdmin, settingsController.saveRecipe);
router.delete('/recipes/:combo_item_id', verifyToken, isAdmin, settingsController.deleteRecipe);

module.exports = router;
