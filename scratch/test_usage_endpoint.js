const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function test() {
    const token = jwt.sign(
        { id: 1, username: 'admin', role: 'admin' },
        process.env.JWT_SECRET || 'tabaruq_secret_key_2024',
        { expiresIn: '1h' }
    );

    // Let's first query the current quantity of an item
    const db = require('../src/config/db');
    const [rows] = await db.execute('SELECT id, name, quantity FROM inventory LIMIT 1');
    if (rows.length === 0) {
        console.log('No inventory item to test with.');
        process.exit(1);
    }
    const item = rows[0];
    console.log(`Testing with item: ${item.name} (ID: ${item.id}, Current Qty: ${item.quantity})`);

    const data = {
        quantity: 1,
        reason: 'Hotel Kitchen Use'
    };

    try {
        const response = await axios.put(`http://localhost:5001/api/inventory/use/${item.id}`, data, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        console.log('Success response:', response.data);
        const [updatedRows] = await db.execute('SELECT quantity FROM inventory WHERE id = ?', [item.id]);
        console.log(`Updated Qty: ${updatedRows[0].quantity}`);
        process.exit(0);
    } catch (err) {
        console.error('Error status:', err.response?.status);
        console.error('Error response data:', err.response?.data);
        process.exit(1);
    }
}

test();
