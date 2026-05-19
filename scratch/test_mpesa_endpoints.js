const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection to the test database
async function runTest() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });

    try {
        console.log('--- STARTING MPESA INTEGRATION ENDPOINT TEST ---');

        // 1. Create a dummy order and pending payment for STK push callback
        console.log('1. Creating mock order and pending payment...');
        const [orderResult] = await conn.execute(
            "INSERT INTO orders (total_amount, status, payment_status, customer_name) VALUES (100.00, 'pending', 'pending', 'Test STK Customer')"
        );
        const orderId = orderResult.insertId;
        console.log(`Mock order created with ID: ${orderId}`);

        const mockCheckoutId = `TEST-CHECKOUT-${Date.now()}`;
        const [paymentResult] = await conn.execute(
            "INSERT INTO payments (order_id, amount, mpesa_checkout_id, status, payment_method, customer_name) VALUES (?, 100.00, ?, 'pending', 'M-Pesa', 'Test STK Customer')",
            [orderId, mockCheckoutId]
        );
        const paymentId = paymentResult.insertId;
        console.log(`Mock pending payment created with ID: ${paymentId}, checkout ID: ${mockCheckoutId}`);

        // 2. Simulate Safaricom STK Push Callback (Success)
        console.log('2. Simulating Safaricom STK Push success callback...');
        const mockReceipt = `REC${Math.floor(Math.random() * 1000000)}`;
        const callbackPayload = {
            Body: {
                stkCallback: {
                    MerchantRequestID: "12345-67890-1",
                    CheckoutRequestID: mockCheckoutId,
                    ResultCode: 0,
                    ResultDesc: "The service request is processed successfully.",
                    CallbackMetadata: {
                        Item: [
                            { Name: "Amount", Value: 100.00 },
                            { Name: "MpesaReceiptNumber", Value: mockReceipt },
                            { Name: "TransactionDate", Value: 20260520000000 },
                            { Name: "PhoneNumber", Value: 254712345678 }
                        ]
                    }
                }
            }
        };

        const callbackResp = await axios.post(`http://localhost:5001/api/payments/callback`, callbackPayload);
        console.log('Callback response:', callbackResp.data);

        // Verify database updates
        console.log('3. Verifying STK payment status and order state in DB...');
        const [paymentRows] = await conn.execute("SELECT * FROM payments WHERE id = ?", [paymentId]);
        const payment = paymentRows[0];
        console.log(`Payment status: ${payment.status}, Transaction ID: ${payment.transaction_id}`);

        const [orderRows] = await conn.execute("SELECT * FROM orders WHERE id = ?", [orderId]);
        const order = orderRows[0];
        console.log(`Order status: ${order.status}, Payment status: ${order.payment_status}`);

        if (payment.status !== 'confirmed' || payment.transaction_id !== mockReceipt) {
            throw new Error(`STK Payment verification failed! Got status: ${payment.status}, expected: confirmed`);
        }
        if (order.status !== 'completed' || order.payment_status !== 'paid') {
            throw new Error(`STK Order verification failed! Got status: ${order.status}, expected: completed/paid`);
        }
        console.log('SUCCESS: STK Push callback successfully updated DB and completed order!');

        // 4. Simulate C2B confirmation callback (Offline / Pay Bill / Buy Goods)
        console.log('\n4. Creating a second mock order for C2B Confirmation...');
        const [c2bOrderResult] = await conn.execute(
            "INSERT INTO orders (total_amount, status, payment_status, customer_name) VALUES (250.00, 'pending', 'pending', 'Test C2B Customer')"
        );
        const c2bOrderId = c2bOrderResult.insertId;
        console.log(`C2B mock order created with ID: ${c2bOrderId}`);

        console.log('5. Simulating Safaricom C2B confirmation callback...');
        const c2bReceipt = `C2B${Math.floor(Math.random() * 1000000)}`;
        const c2bPayload = {
            TransactionType: "Pay Bill",
            TransID: c2bReceipt,
            TransTime: "20260520000000",
            TransAmount: "250.00",
            BusinessShortCode: "600000",
            BillRefNumber: String(c2bOrderId), // Passing order ID as BillRefNumber
            InvoiceNumber: "",
            OrgAccountBalance: "",
            ThirdPartyTransID: "",
            MSISDN: "254712345678",
            FirstName: "John",
            MiddleName: "C2B",
            LastName: "Doe"
        };

        const c2bResp = await axios.post(`http://localhost:5001/api/payments/c2b-confirmation`, c2bPayload);
        console.log('C2B confirmation response:', c2bResp.data);

        // Verify C2B updates
        console.log('6. Verifying C2B payment insertion and order completion in DB...');
        const [c2bPaymentRows] = await conn.execute("SELECT * FROM payments WHERE transaction_id = ?", [c2bReceipt]);
        if (c2bPaymentRows.length === 0) {
            throw new Error('C2B Payment record was not inserted!');
        }
        const c2bPayment = c2bPaymentRows[0];
        console.log(`C2B Payment status: ${c2bPayment.status}, Order ID: ${c2bPayment.order_id}, Amount: ${c2bPayment.amount}`);

        const [c2bOrderRows] = await conn.execute("SELECT * FROM orders WHERE id = ?", [c2bOrderId]);
        const c2bOrder = c2bOrderRows[0];
        console.log(`C2B Order status: ${c2bOrder.status}, Payment status: ${c2bOrder.payment_status}`);

        if (c2bPayment.status !== 'confirmed' || Number(c2bPayment.order_id) !== c2bOrderId) {
            throw new Error('C2B Payment status or order link verification failed!');
        }
        if (c2bOrder.status !== 'completed' || c2bOrder.payment_status !== 'paid') {
            throw new Error('C2B Order completion verification failed!');
        }
        console.log('SUCCESS: C2B Confirmation successfully inserted payment, linked reference, and completed order!');
        
        console.log('\n--- ALL MPESA INTEGRATION ENDPOINT TESTS PASSED SUCCESSFULLY! ---');
        process.exit(0);

    } catch (e) {
        console.error('\nFAIL: Test failed with error:', e.message);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

runTest();
