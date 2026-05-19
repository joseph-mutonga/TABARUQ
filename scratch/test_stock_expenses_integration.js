const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runTest() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });

    try {
        console.log('--- STARTING STOCK EXPENSES INTEGRATION TEST ---');

        // 1. Log in to get admin token
        console.log('1. Logging in as admin...');
        const loginResp = await axios.post('http://localhost:5001/api/auth/login', {
            username: 'admin',
            password: 'admin123'
        });
        const token = loginResp.data.token;
        console.log('Successfully logged in.');

        // 2. Insert/select a test item to make sure it has a known cost price
        console.log('2. Inserting test inventory item...');
        const itemName = `Test Restock Ingredient ${Date.now()}`;
        const [insertResult] = await conn.execute(
            'INSERT INTO inventory (name, category, cost_price, selling_price, unit, quantity, item_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [itemName, 'Ingredients', 150.00, 200.00, 'kg', 10.00, 'ingredient']
        );
        const itemId = insertResult.insertId;
        console.log(`Test item inserted with ID: ${itemId}, Cost Price: 150.00`);

        // 3. Restock the item via PUT /api/inventory/restock/:id
        console.log('3. Triggering RESTOCK endpoint for 20 units...');
        const restockResp = await axios.put(`http://localhost:5001/api/inventory/restock/${itemId}`, {
            quantity: 20.00,
            reason: 'Weekly Supplies Purchase'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Restock response:', restockResp.data);

        // 4. Verify item quantity in DB
        const [[itemRow]] = await conn.execute('SELECT quantity FROM inventory WHERE id = ?', [itemId]);
        console.log(`Updated inventory quantity: ${itemRow.quantity} kg (Expected: 30.00 kg)`);
        if (Number(itemRow.quantity) !== 30.00) {
            throw new Error(`Quantity mismatch! Expected 30.00 but got ${itemRow.quantity}`);
        }

        // 5. Verify the expense record was automatically generated
        console.log('5. Verification of automatically generated expense record...');
        const [expenseRows] = await conn.execute(
            'SELECT * FROM expenses WHERE description LIKE ? AND category = ? ORDER BY id DESC LIMIT 1',
            [`%Stock Restock - ${itemName}%`, 'Stock']
        );
        
        if (expenseRows.length === 0) {
            throw new Error('No expense log was found for this restock action!');
        }
        
        const expense = expenseRows[0];
        console.log('Generated Expense details:', {
            description: expense.description,
            category: expense.category,
            amount: expense.amount,
            expense_date: expense.expense_date
        });

        // 20 units * 150.00 cost price = 3000.00 KES
        if (Number(expense.amount) !== 3000.00) {
            throw new Error(`Expense amount mismatch! Expected 3000.00 but got ${expense.amount}`);
        }

        console.log('SUCCESS: Restocking and expense generation is completely integrated and matches money flow reports!');
        process.exit(0);

    } catch (e) {
        console.error('\nFAIL: Stock expenses integration test failed with error:', e.response?.data || e.message);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

runTest();
