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
        console.log('--- STARTING OFFLINE MPESA ROUTE INTEGRATION TEST ---');

        // 1. Log in to get auth token
        console.log('1. Logging in to get authentication token...');
        const loginResp = await axios.post('http://localhost:5001/api/auth/login', {
            username: 'admin',
            password: 'admin123'
        });
        const token = loginResp.data.token;
        console.log('Successfully logged in. Token acquired.');

        // 2. Create mock order
        console.log('2. Creating mock order...');
        const [orderResult] = await conn.execute(
            "INSERT INTO orders (total_amount, status, payment_status, customer_name) VALUES (350.00, 'pending', 'pending', 'Test Offline Cashier Customer')"
        );
        const orderId = orderResult.insertId;
        console.log(`Mock order created with ID: ${orderId}`);

        // 3. Make the offline M-Pesa payment request
        console.log('3. Submitting offline M-Pesa receipt confirmation...');
        const offlineReceipt = `OFF${Math.floor(Math.random() * 1000000)}`;
        const payload = {
            orderId: orderId,
            amount: 350.00,
            transaction_id: offlineReceipt,
            phone_number: '254700000000',
            customer_name: 'Test Offline Cashier Customer'
        };

        const offlineResp = await axios.post(
            'http://localhost:5001/api/payments/offline-mpesa',
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );
        console.log('Offline M-Pesa API response:', offlineResp.data);

        // 4. Verify DB updates
        console.log('4. Verifying payment and order status in DB...');
        const [paymentRows] = await conn.execute("SELECT * FROM payments WHERE transaction_id = ?", [offlineReceipt]);
        if (paymentRows.length === 0) {
            throw new Error('Offline payment record not found in database!');
        }
        const payment = paymentRows[0];
        console.log(`Payment status: ${payment.status}, Confirmed By (User ID): ${payment.confirmed_by}`);

        const [orderRows] = await conn.execute("SELECT * FROM orders WHERE id = ?", [orderId]);
        const order = orderRows[0];
        console.log(`Order status: ${order.status}, Payment status: ${order.payment_status}`);

        if (payment.status !== 'confirmed' || Number(payment.confirmed_by) !== 1) {
            throw new Error('Payment status or confirmed_by verification failed!');
        }
        if (order.status !== 'completed' || order.payment_status !== 'paid') {
            throw new Error('Order status or payment_status verification failed!');
        }

        console.log('SUCCESS: Offline M-Pesa payment route authenticated and processed successfully!');
        process.exit(0);

    } catch (e) {
        console.error('\nFAIL: Offline test failed with error:', e.response?.data || e.message);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

runTest();
