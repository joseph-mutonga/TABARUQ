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
        console.log('--- STARTING RECEIPT SETTINGS INTEGRATION TEST ---');

        // 1. Log in to get admin token
        console.log('1. Logging in as admin to get authentication token...');
        const loginResp = await axios.post('http://localhost:5001/api/auth/login', {
            username: 'admin',
            password: 'admin123'
        });
        const token = loginResp.data.token;
        console.log('Successfully logged in. Token acquired.');

        // 2. Fetch current settings (GET /api/settings/receipt)
        console.log('2. Fetching current settings...');
        const currentSettings = await axios.get('http://localhost:5001/api/settings/receipt', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Current settings:', currentSettings.data.data);

        // 3. Save new settings (POST /api/settings/receipt)
        console.log('3. Saving new receipt settings...');
        const uniqueHotelName = `TABARUQ CAFE - ${Date.now()}`;
        const saveResp = await axios.post('http://localhost:5001/api/settings/receipt', {
            hotel_name: uniqueHotelName,
            phone_number: '+254799999999',
            address: '1st Ave Mall, Nairobi',
            mpesa_paybill: '888222',
            mpesa_till: '111222',
            footer_message: 'Have a wonderful day!'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Save response:', saveResp.data);

        // 4. Create a mock order to test printing output injection
        console.log('4. Creating mock order...');
        const [orderResult] = await conn.execute(
            "INSERT INTO orders (total_amount, status, payment_status, customer_name) VALUES (400.00, 'pending', 'pending', 'Test Receipt Customer')"
        );
        const orderId = orderResult.insertId;
        console.log(`Mock order created with ID: ${orderId}`);

        // 5. Fetch order details (GET /api/orders/:id) with headers (verifyToken)
        console.log('5. Fetching order details and checking receipt settings payload...');
        const orderDetailsResp = await axios.get(`http://localhost:5001/api/orders/${orderId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const orderDetails = orderDetailsResp.data.data;
        console.log('Order Details Receipt Fields:', {
            hotel_name: orderDetails.hotel_name,
            phone_number: orderDetails.phone_number,
            address: orderDetails.address,
            mpesa_paybill: orderDetails.mpesa_paybill,
            mpesa_till: orderDetails.mpesa_till,
            footer_message: orderDetails.footer_message
        });

        // 6. Verify correct values
        if (orderDetails.hotel_name !== uniqueHotelName ||
            orderDetails.phone_number !== '+254799999999' ||
            orderDetails.address !== '1st Ave Mall, Nairobi' ||
            orderDetails.mpesa_paybill !== '888222' ||
            orderDetails.mpesa_till !== '111222' ||
            orderDetails.footer_message !== 'Have a wonderful day!') {
            throw new Error('Receipt settings mismatch in order details payload!');
        }

        console.log('SUCCESS: Receipt settings were successfully saved, persisted, and injected into printing payload!');
        process.exit(0);

    } catch (e) {
        console.error('\nFAIL: Receipt settings test failed with error:', e.response?.data || e.message);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

runTest();
