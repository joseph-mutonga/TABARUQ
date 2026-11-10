const db = require('../src/config/db');
const settingsController = require('../src/controllers/settingsController');
const inventoryController = require('../src/controllers/inventoryController');
const orderController = require('../src/controllers/orderController');

// Mock response helper
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

async function runTests() {
    console.log('=== STARTING END-TO-END VERIFICATION ===\n');

    // 1. Settings Delivery Locations
    console.log('--- Test 1: Delivery Locations CRUD in Settings ---');
    const listRes = createMockRes();
    await settingsController.getDeliveryLocations({}, listRes);
    console.log(`[PASS] getDeliveryLocations returned status ${listRes.statusCode}, count: ${listRes.body?.data?.length}`);
    if (!listRes.body?.data || listRes.body.data.length === 0) {
        throw new Error('Expected seeded delivery locations!');
    }

    // Create a new location
    const createReq = {
        body: {
            location_name: 'Test Estate Zone 9',
            distance_km: 7.2,
            transport_fee: 250,
            estimated_minutes: 35,
            notes: 'Test location'
        }
    };
    const createRes = createMockRes();
    await settingsController.saveDeliveryLocation(createReq, createRes);
    console.log(`[PASS] saveDeliveryLocation returned status ${createRes.statusCode}, id: ${createRes.body?.data?.id}`);
    const newLocId = createRes.body?.data?.id;

    // Update location
    const updateReq = {
        params: { id: newLocId },
        body: {
            location_name: 'Test Estate Zone 9 Updated',
            distance_km: 8.0,
            transport_fee: 280,
            estimated_minutes: 40,
            is_active: 1
        }
    };
    const updateRes = createMockRes();
    await settingsController.updateDeliveryLocation(updateReq, updateRes);
    console.log(`[PASS] updateDeliveryLocation returned status ${updateRes.statusCode}, message: ${updateRes.body?.message}`);

    // Verify it in DB
    const [testLocRows] = await db.execute('SELECT * FROM delivery_locations WHERE id = ?', [newLocId]);
    console.log(`[PASS] DB location: name="${testLocRows[0].location_name}", fee=${testLocRows[0].transport_fee}, dist=${testLocRows[0].distance_km}`);

    // Clean up test location
    const deleteReq = { params: { id: newLocId } };
    const deleteRes = createMockRes();
    await settingsController.deleteDeliveryLocation(deleteReq, deleteRes);
    console.log(`[PASS] deleteDeliveryLocation returned status ${deleteRes.statusCode}`);

    // 2. Tabaruq Delivery Sale & Fee Addition
    console.log('\n--- Test 2: Tabaruq Delivery Sale & Transport Fee Calculation ---');
    // Get an existing inventory item for order
    const [invRows] = await db.execute('SELECT * FROM inventory WHERE item_type != "ingredient" LIMIT 1');
    if (invRows.length === 0) {
        throw new Error('No menu item available to test order creation');
    }
    const testFood = invRows[0];
    const foodPrice = Number(testFood.selling_price);

    // Pick Eastleigh or first active delivery location
    const [locRows] = await db.execute('SELECT * FROM delivery_locations WHERE is_active = 1 LIMIT 1');
    const testLoc = locRows[0];
    const expectedFee = Number(testLoc.transport_fee);

    // Test 2a: Tabaruq Delivery without location should fail
    console.log('Testing Tabaruq Delivery without location_id (should reject):');
    const invalidOrderReq = {
        app: { get: () => null },
        user: { id: 1, role: 'cashier', name: 'Test Cashier' },
        body: {
            items: [{ id: testFood.id, quantity: 2, selling_price: foodPrice }],
            platform: 'Tabaruq Delivery',
            customer_name: 'Jane Doe Delivery'
            // missing delivery_location_id
        }
    };
    const invalidOrderRes = createMockRes();
    await orderController.createOrder(invalidOrderReq, invalidOrderRes);
    console.log(`[PASS] Correctly rejected order without location: status=${invalidOrderRes.statusCode}, error="${invalidOrderRes.body?.message}"`);

    // Test 2b: Tabaruq Delivery with location should succeed and add fee
    console.log('Testing Tabaruq Delivery with location (should add fee to food total):');
    const validOrderReq = {
        app: { get: () => null },
        user: { id: 1, role: 'cashier', name: 'Test Cashier' },
        body: {
            items: [{ id: testFood.id, quantity: 2, selling_price: foodPrice }],
            platform: 'Tabaruq Delivery',
            customer_name: 'Jane Doe Delivery',
            delivery_location_id: testLoc.id,
            delivery_address: 'Apartment 4B, 12th Street'
        }
    };
    const validOrderRes = createMockRes();
    await orderController.createOrder(validOrderReq, validOrderRes);
    console.log(`[PASS] Valid delivery order created: status=${validOrderRes.statusCode}, orderId=${validOrderRes.body?.orderId}`);
    const createdOrderId = validOrderRes.body?.orderId;

    // Verify order in database
    const [orderRows] = await db.execute('SELECT * FROM orders WHERE id = ?', [createdOrderId]);
    const savedOrder = orderRows[0];
    const expectedFoodTotal = foodPrice * 2;
    const expectedFinalTotal = expectedFoodTotal + expectedFee;

    console.log(`[PASS] DB Order values:`);
    console.log(`  - Food Total: KES ${expectedFoodTotal}`);
    console.log(`  - Delivery Location: ${savedOrder.delivery_location_name} (ID: ${savedOrder.delivery_location_id})`);
    console.log(`  - Distance km: ${savedOrder.delivery_distance}`);
    console.log(`  - Transport Fee: KES ${savedOrder.delivery_fee}`);
    console.log(`  - Total Amount: KES ${savedOrder.total_amount} (Expected: ${expectedFinalTotal})`);
    console.log(`  - Address: "${savedOrder.delivery_address}"`);

    if (Number(savedOrder.total_amount) !== expectedFinalTotal) {
        throw new Error(`Total amount mismatch! Expected ${expectedFinalTotal}, got ${savedOrder.total_amount}`);
    }
    if (Number(savedOrder.delivery_fee) !== expectedFee) {
        throw new Error(`Delivery fee mismatch! Expected ${expectedFee}, got ${savedOrder.delivery_fee}`);
    }

    // 3. Cashier Stock Intake
    console.log('\n--- Test 3: Cashier Stock Intake (Meat, Maize, Supplies) ---');
    // Test 3a: Restock existing ingredient
    let [ingRows] = await db.execute('SELECT * FROM inventory WHERE item_type = "ingredient" LIMIT 1');
    let testIng = ingRows[0];
    const prevQty = Number(testIng.quantity);

    const intakeExistingReq = {
        app: { get: () => null },
        user: { id: 1, role: 'cashier', name: 'Cashier Amina' },
        body: {
            is_new_item: false,
            item_id: testIng.id,
            quantity: 15.5,
            unit: testIng.unit || 'kg',
            total_cost: 3100,
            supplier: 'Nairobi Prime Meat Supplier',
            notes: 'Fresh morning delivery',
            create_expense: true
        }
    };
    const intakeExistingRes = createMockRes();
    await inventoryController.recordStockIntake(intakeExistingReq, intakeExistingRes);
    console.log(`[PASS] Existing ingredient stock intake: status=${intakeExistingRes.statusCode}, message="${intakeExistingRes.body?.message}"`);

    // Verify inventory updated
    const [updatedIngRows] = await db.execute('SELECT * FROM inventory WHERE id = ?', [testIng.id]);
    const newQty = Number(updatedIngRows[0].quantity);
    console.log(`[PASS] Stock updated: previous=${prevQty}, added=15.5, current=${newQty}`);
    if (Math.abs(newQty - (prevQty + 15.5)) > 0.001) {
        throw new Error('Stock quantity did not increase as expected!');
    }

    // Test 3b: Brand new ingredient arrival (e.g. Maize arrival when admin is away)
    const uniqueMaizeName = `White Maize (${Date.now()})`;
    const intakeNewReq = {
        app: { get: () => null },
        user: { id: 1, role: 'cashier', name: 'Cashier Amina' },
        body: {
            is_new_item: true,
            name: uniqueMaizeName,
            category: 'Grains & Cereals',
            quantity: 50,
            unit: 'kg',
            total_cost: 4500,
            supplier: 'Rift Valley Grain Dealers',
            notes: '50kg bag received by cashier',
            create_expense: true,
            low_stock_threshold: 10
        }
    };
    const intakeNewRes = createMockRes();
    await inventoryController.recordStockIntake(intakeNewReq, intakeNewRes);
    console.log(`[PASS] New ingredient stock intake: status=${intakeNewRes.statusCode}, message="${intakeNewRes.body?.message}", itemId=${intakeNewRes.body?.data?.itemId}`);

    // Verify new ingredient in database
    const [newIngRows] = await db.execute('SELECT * FROM inventory WHERE name = ?', [uniqueMaizeName]);
    if (newIngRows.length === 0) {
        throw new Error('New ingredient was not created in inventory!');
    }
    const savedMaize = newIngRows[0];
    console.log(`[PASS] New ingredient in DB: ID=${savedMaize.id}, Name="${savedMaize.name}", Qty=${savedMaize.quantity} ${savedMaize.unit}, CostPerUnit=KES ${savedMaize.cost_price}`);

    // Verify expense created
    const [expenseRows] = await db.execute('SELECT * FROM expenses WHERE description LIKE ?', [`%${uniqueMaizeName}%`]);
    if (expenseRows.length === 0) {
        throw new Error('Expense was not recorded for the new stock intake!');
    }
    console.log(`[PASS] Expense logged: Amount=KES ${expenseRows[0].amount}, Category="${expenseRows[0].category}", Desc="${expenseRows[0].description}"`);

    // Verify stock log created
    const [logRows] = await db.execute('SELECT * FROM stock_logs WHERE item_id = ? ORDER BY id DESC LIMIT 1', [savedMaize.id]);
    if (logRows.length === 0) {
        throw new Error('Stock log was not recorded for the new stock intake!');
    }
    console.log(`[PASS] Stock log recorded: Change=+${logRows[0].change_amount}, Reason="${logRows[0].reason}", User="${logRows[0].user_name}"`);

    // Clean up test order, test maize, and test expense
    await db.execute('DELETE FROM order_items WHERE order_id = ?', [createdOrderId]);
    await db.execute('DELETE FROM orders WHERE id = ?', [createdOrderId]);
    await db.execute('DELETE FROM expenses WHERE id = ?', [expenseRows[0].id]);
    await db.execute('DELETE FROM stock_logs WHERE item_id = ?', [savedMaize.id]);
    await db.execute('DELETE FROM inventory WHERE id = ?', [savedMaize.id]);
    // Revert existing item quantity back
    await db.execute('UPDATE inventory SET quantity = ? WHERE id = ?', [prevQty, testIng.id]);

    console.log('\n=== ALL END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY ===');
    process.exit(0);
}

runTests().catch(err => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
});
