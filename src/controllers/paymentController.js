const db = require('../config/db');
const axios = require('axios');
const { getMpesaToken, generateTimestamp } = require('../utils/mpesa');
require('dotenv').config();

exports.initiateSTKPush = async (req, res) => {
    const { orderId, phoneNumber, amount, customer_name } = req.body;

    try {
        const token = await getMpesaToken();
        const timestamp = generateTimestamp();
        const shortCode = process.env.MPESA_SHORTCODE;
        const passkey = process.env.MPESA_PASSKEY;
        const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');

        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            {
                BusinessShortCode: shortCode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: Math.round(amount),
                PartyA: phoneNumber, // Phone number to be charged
                PartyB: shortCode,
                PhoneNumber: phoneNumber,
                CallBackURL: process.env.MPESA_CALLBACK_URL,
                AccountReference: `TABARUQ-${orderId}`,
                TransactionDesc: `Payment for Order #${orderId}`,
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        if (response.data.ResponseCode === '0') {
            const checkoutID = response.data.CheckoutRequestID;
            
            // Log payment initiation
            await db.execute(
                'INSERT INTO payments (order_id, amount, phone_number, mpesa_checkout_id, status, customer_name) VALUES (?, ?, ?, ?, ?, ?)',
                [orderId, amount, phoneNumber, checkoutID, 'pending', customer_name || 'Guest']
            );

            res.json({ success: true, message: 'STK Push initiated', checkoutID });
        } else {
            res.status(400).json({ success: false, message: 'STK Push failed to initiate' });
        }
    } catch (error) {
        console.error('STK Push Error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Payment gateway error' });
    }
};

exports.mpesaCallback = async (req, res) => {
    const callbackData = req.body.Body.stkCallback;
    const checkoutID = callbackData.CheckoutRequestID;
    const resultCode = callbackData.ResultCode;
    
    try {
        if (resultCode === 0) {
            // Payment successful
            const items = callbackData.CallbackMetadata.Item;
            const mpesaReceipt = items.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
            const amountPaid = items.find(item => item.Name === 'Amount')?.Value;
            const phonePaid = items.find(item => item.Name === 'PhoneNumber')?.Value;
            
            // Sometimes Safaricom sends name in certain transaction types, or we can use the one from our record
            // For STK Push it's rare, but we check for any item with 'Name' or 'Customer' or 'Payer'
            const payerName = items.find(item => item.Name.includes('Name') || item.Name.includes('Customer'))?.Value;
            
            await db.execute(
                'UPDATE payments SET transaction_id = ?, amount = ?, phone_number = ?, status = ?' + (payerName ? ', customer_name = ?' : '') + ' WHERE mpesa_checkout_id = ?',
                payerName ? [mpesaReceipt, amountPaid, phonePaid, 'pending', payerName, checkoutID] : [mpesaReceipt, amountPaid, phonePaid, 'pending', checkoutID]
            );
        } else {
            // Payment failed
            await db.execute(
                'UPDATE payments SET status = ? WHERE mpesa_checkout_id = ?',
                ['failed', checkoutID]
            );
        }
        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    } catch (err) {
        console.error('Callback Error:', err);
        res.status(500).json({ ResultCode: 1, ResultDesc: 'Internal error' });
    }
};

exports.mpesaC2BConfirmation = async (req, res) => {
    const {
        TransID,
        TransAmount,
        MSISDN,
        FirstName,
        MiddleName,
        LastName,
        BillRefNumber
    } = req.body;

    const customerName = `${FirstName || ''} ${MiddleName || ''} ${LastName || ''}`.trim() || 'M-Pesa Customer';

    try {
        let orderId = null;
        
        // Try to see if BillRefNumber is a valid Order ID
        if (BillRefNumber && !isNaN(BillRefNumber)) {
            const [order] = await db.execute('SELECT id FROM orders WHERE id = ?', [BillRefNumber]);
            if (order.length > 0) orderId = BillRefNumber;
        }

        // Record the payment
        await db.execute(
            'INSERT INTO payments (order_id, amount, transaction_id, phone_number, status, customer_name, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [orderId, TransAmount, TransID, MSISDN, 'pending', customerName, 'M-Pesa (Buy Goods)']
        );
        
        res.json({ ResultCode: 0, ResultDesc: 'Success' });
    } catch (err) {
        console.error('C2B Confirmation Error:', err);
        res.json({ ResultCode: 1, ResultDesc: 'Failed' });
    }
};

exports.confirmPayment = async (req, res) => {
    const { paymentId } = req.params;
    const { orderId } = req.body;
    
    try {
        const [payment] = await db.execute('SELECT * FROM payments WHERE id = ?', [paymentId]);
        if (payment.length === 0) return res.status(404).json({ success: false, message: 'Payment not found' });

        // Update payment with orderId and status
        await db.execute(
            'UPDATE payments SET order_id = ?, status = ?, confirmed_at = CURRENT_TIMESTAMP, confirmed_by = ? WHERE id = ?',
            [orderId, 'confirmed', req.user.id, paymentId]
        );

        // Update order status
        await db.execute(
            'UPDATE orders SET payment_status = ?, status = ? WHERE id = ?',
            ['paid', 'completed', orderId]
        );

        res.json({ success: true, message: 'Payment linked and confirmed successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getPayments = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT p.*, o.total_amount, o.customer_name, u.username as confirmed_by_user FROM payments p LEFT JOIN orders o ON p.order_id = o.id LEFT JOIN users u ON p.confirmed_by = u.id ORDER BY p.created_at DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getPendingCount = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT COUNT(*) as count FROM payments WHERE status = "pending" AND (transaction_id IS NOT NULL OR payment_method = "M-Pesa")');
        res.json({ success: true, count: rows[0].count });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.processCashPayment = async (req, res) => {
    const { orderId, amount } = req.body;
    
    try {
        // Create payment record
        await db.execute(
            'INSERT INTO payments (order_id, amount, payment_method, status, confirmed_at, confirmed_by) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
            [orderId, amount, 'Cash', 'confirmed', req.user.id]
        );

        // Update order status
        await db.execute(
            'UPDATE orders SET payment_status = ?, status = ? WHERE id = ?',
            ['paid', 'completed', orderId]
        );

        res.json({ success: true, message: 'Cash payment processed successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
