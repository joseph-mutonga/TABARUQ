const express = require('express');
const router = express.Router();
const discountRuleController = require('../controllers/discountRuleController');
const { verifyToken, isAdmin, isCashier } = require('../middleware/auth');

// Read-only preview of the currently-active rules, used by the POS/selling screens
// (cashier + admin) to show "this item has a discount right now" indicators.
// Placed before the admin-only "/" route so it isn't shadowed by it.
router.get('/active', verifyToken, isCashier, discountRuleController.getActiveDiscountRulesPreview);

// Platform-wide / food-specific / time-of-day / day-of-week automatic discount rules.
// Admin-only: this is a Settings/Discounts-page management feature.
router.get('/', verifyToken, isAdmin, discountRuleController.getDiscountRules);
router.post('/', verifyToken, isAdmin, discountRuleController.createDiscountRule);
router.put('/:id', verifyToken, isAdmin, discountRuleController.updateDiscountRule);
router.patch('/:id/toggle', verifyToken, isAdmin, discountRuleController.toggleDiscountRule);
router.delete('/:id', verifyToken, isAdmin, discountRuleController.deleteDiscountRule);

module.exports = router;
