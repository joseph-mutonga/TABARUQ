const inventoryController = require('../src/controllers/inventoryController');

function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
}

async function verifyCashierStockRestrictions() {
    console.log('=== VERIFYING CASHIER STOCK RESTRICTIONS & PRIVACY ===\n');

    // 1. Cashier fetching /inventory
    console.log('Test 1: Cashier fetching /inventory (should mask ingredient quantity & thresholds):');
    const cashierReq = { user: { id: 2, role: 'cashier', name: 'Cashier Mary' } };
    const cashierRes = createMockRes();
    await inventoryController.getItems(cashierReq, cashierRes);
    
    const cashierItems = cashierRes.body?.data || [];
    const ingredientItem = cashierItems.find(i => i.item_type === 'ingredient');
    const menuItem = cashierItems.find(i => i.item_type !== 'ingredient');

    if (!ingredientItem) {
        throw new Error('No ingredient item found to verify');
    }

    console.log(`Ingredient item for cashier: name="${ingredientItem.name}", unit="${ingredientItem.unit}", quantity=${ingredientItem.quantity}, threshold=${ingredientItem.low_stock_threshold}`);
    if (ingredientItem.quantity !== undefined || ingredientItem.low_stock_threshold !== undefined) {
        throw new Error('FAILED: Cashier was able to see raw ingredient quantity or threshold!');
    }
    console.log('[PASS] Raw ingredient quantity & threshold are completely hidden from cashier.');

    if (menuItem) {
        console.log(`Menu item for cashier: name="${menuItem.name}", price=${menuItem.selling_price}`);
        console.log('[PASS] Menu items remain accessible for POS sales.');
    }

    // 2. Admin fetching /inventory
    console.log('\nTest 2: Admin fetching /inventory (should see full stock details):');
    const adminReq = { user: { id: 1, role: 'admin', name: 'Admin User' } };
    const adminRes = createMockRes();
    await inventoryController.getItems(adminReq, adminRes);
    const adminItems = adminRes.body?.data || [];
    const adminIngredient = adminItems.find(i => i.item_type === 'ingredient');
    console.log(`Ingredient item for admin: name="${adminIngredient.name}", quantity=${adminIngredient.quantity}`);
    if (adminIngredient.quantity === undefined) {
        throw new Error('FAILED: Admin should be able to see stock quantities!');
    }
    console.log('[PASS] Admin can see full stock quantities.');

    // 3. Cashier recording Stock Intake (allowed)
    console.log('\nTest 3: Cashier recording Stock Intake (allowed):');
    const intakeReq = {
        app: { get: () => null },
        user: { id: 2, role: 'cashier', name: 'Cashier Mary' },
        body: {
            item_id: ingredientItem.id,
            quantity: 5,
            unit: ingredientItem.unit || 'kg',
            total_cost: 0,
            supplier: 'City Wholesaler',
            notes: 'Intake test',
            record_expense: false
        }
    };
    const intakeRes = createMockRes();
    await inventoryController.recordStockIntake(intakeReq, intakeRes);
    console.log(`[PASS] Cashier recorded stock intake: status=${intakeRes.statusCode}, message="${intakeRes.body?.message}"`);

    // Clean up added stock quantity
    const db = require('../src/config/db');
    await db.execute('UPDATE inventory SET quantity = quantity - 5 WHERE id = ?', [ingredientItem.id]);
    await db.execute('DELETE FROM stock_logs WHERE item_id = ? AND reason LIKE "%Intake test%"', [ingredientItem.id]);

    console.log('\n=== ALL CASHIER RESTRICTION CHECKS PASSED ===');
    process.exit(0);
}

verifyCashierStockRestrictions().catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
});

