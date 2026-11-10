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

// ── Order Discount Settings ───────────────────────────────────────────────────
router.get('/discounts', verifyToken, settingsController.getDiscountSettings);           // Allow cashiers to check if enabled
router.post('/discounts', verifyToken, isAdmin, settingsController.saveDiscountSettings); // Only admin can save

// ── Combo / Bundle Recipes ────────────────────────────────────────────────────
router.get('/recipes', verifyToken, settingsController.getRecipes);
router.post('/recipes', verifyToken, isAdmin, settingsController.saveRecipe);
router.delete('/recipes/:combo_item_id', verifyToken, isAdmin, settingsController.deleteRecipe);

// ── Tabaruq Delivery Distance & Transport Fees ────────────────────────────────
router.get('/delivery-locations', verifyToken, settingsController.getDeliveryLocations); // Cashier & admin
router.post('/delivery-locations', verifyToken, isAdmin, settingsController.saveDeliveryLocation); // Only admin
router.put('/delivery-locations/:id', verifyToken, isAdmin, settingsController.updateDeliveryLocation); // Only admin
router.delete('/delivery-locations/:id', verifyToken, isAdmin, settingsController.deleteDeliveryLocation); // Only admin

module.exports = router;
