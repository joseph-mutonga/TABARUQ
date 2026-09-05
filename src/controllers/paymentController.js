const db = require('../config/db');

// Shared helper to check if order is fully paid and update its status
async function checkAndCompleteOrder(conn, oid) {
    const [orderRows] = await conn.execute('SELECT total_amount, status FROM orders WHERE id = ?', [oid]);
    if (orderRows.length === 0) return;
    if (orderRows[0].status === 'merged') return; // Do not update merged orders
    
    const totalNeeded = Number(orderRows[0].total_amount);

    const [payRows] = await conn.execute(
        'SELECT SUM(amount) as total_paid FROM payments WHERE order_id = ? AND status = "confirmed"',
        [oid]
    );
    const totalPaid = Number(payRows[0].total_paid || 0);

    if (totalPaid >= totalNeeded) {
        await conn.execute('UPDATE orders SET payment_status = "paid", status = "completed" WHERE id = ?', [oid]);
    } else {
        await conn.execute('UPDATE orders SET payment_status = "partial" WHERE id = ?', [oid]);
    }
}
const axios = require('axios');
const { getMpesaToken, generateTimestamp } = require('../utils/mpesa');
require('dotenv').config();

const RAW_BODY_LOG_MAX = 16 * 1024;

/** Safaricom ResultDesc / notes; VARCHAR(512) in DB */
function clipMpesaMessage(text, maxLen = 512) {
    if (text == null) return '';
    const s = String(text);
    return s.length <= maxLen ? s : s.slice(0, maxLen);
}

function serializeRawBodyForLog(body) {
    try {
        const s = JSON.stringify(body ?? null);
        return s.length <= RAW_BODY_LOG_MAX ? s : s.slice(0, RAW_BODY_LOG_MAX);
    } catch {
        return '{"_error":"unserializable"}';
    }
}

/** @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor */
async function insertMpesaCallbackRow(executor, { source, checkoutRequestId, rawBody, parsedSummary, paymentId }) {
    await executor.execute(
        'INSERT INTO mpesa_callbacks (source, checkout_request_id, raw_body, parsed_summary, payment_id) VALUES (?, ?, ?, ?, ?)',
        [source, checkoutRequestId || null, serializeRawBodyForLog(rawBody), clipMpesaMessage(parsedSummary || '', 512), paymentId || null]
    );
}

async function selectPaymentIdByCheckout(executor, checkoutId) {
    const [rows] = await executor.execute(
        'SELECT id FROM payments WHERE mpesa_checkout_id = ? ORDER BY id DESC LIMIT 1',
        [checkoutId]
    );
    return rows[0]?.id ?? null;
}

/**
 * Attach unlinked incoming payment to order, fail pending STK rows, mark order paid.
 * Caller must hold an open transaction and have locked the order row.
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function finalizeIncomingLink(conn, { orderId, paymentId, userId, payment }) {
    const appendApplied = ` — Applied to order #${orderId}`;
    const newMsg = clipMpesaMessage((payment.mpesa_result_message || '') + appendApplied);
    await conn.execute(
        'UPDATE payments SET order_id = ?, shift_id = (SELECT shift_id FROM orders WHERE id = ?), status = ?, confirmed_at = COALESCE(confirmed_at, CURRENT_TIMESTAMP), ' +
            'confirmed_by = COALESCE(confirmed_by, ?), mpesa_result_message = ? WHERE id = ?',
        [orderId, orderId, 'confirmed', userId, newMsg, paymentId]
    );
    const [pendingOthers] = await conn.execute(
        "SELECT id, mpesa_result_message FROM payments WHERE order_id = ? AND id <> ? AND status = 'pending'",
        [orderId, paymentId]
    );
    const supersedeSuffix = ' — Superseded by linked incoming payment';
    for (const row of pendingOthers) {
        const merged = clipMpesaMessage((row.mpesa_result_message || '') + supersedeSuffix);
        await conn.execute("UPDATE payments SET status = 'failed', mpesa_result_message = ? WHERE id = ?", [merged, row.id]);
    }
    await checkAndCompleteOrder(conn, orderId);
}

/** Human-readable line for staff: status text, amount, payer, receipt hint (clipped for DB). */
function buildStkCallbackDisplayMessage(resultDesc, amountDecimal, payerName, phonePaid, mpesaReceipt, txDate) {
    const parts = [resultDesc || 'M-Pesa callback'];
    if (amountDecimal != null && !Number.isNaN(Number(amountDecimal))) {
        parts.push(`KES ${Number(amountDecimal)}`);
    }
    const who = [payerName, phonePaid].filter(Boolean).join(' · ');
    if (who) parts.push(`From: ${who}`);
    if (mpesaReceipt) parts.push(`Receipt: ${mpesaReceipt}`);
    if (txDate) parts.push(`Time: ${txDate}`);
    return clipMpesaMessage(parts.join(' — '));
}

exports.mpesaCallback = async (req, res) => {
    console.log('--- Incoming M-Pesa Callback ---');
    console.log(JSON.stringify(req.body, null, 2));
    
    const acknowledge = () => res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    try {
        const stkCallback = req.body?.Body?.stkCallback;
        if (!stkCallback || stkCallback.CheckoutRequestID == null) {
            console.warn('M-Pesa STK callback: missing Body.stkCallback or CheckoutRequestID');
            try {
                await insertMpesaCallbackRow(db, {
                    source: 'stk',
                    checkoutRequestId: stkCallback?.CheckoutRequestID ?? null,
                    rawBody: req.body,
                    parsedSummary: 'STK callback missing stkCallback or CheckoutRequestID',
                    paymentId: null,
                });
            } catch (logErr) {
                console.error('mpesa_callbacks insert failed:', logErr);
            }
            return acknowledge();
        }

        const checkoutID = stkCallback.CheckoutRequestID;
        const resultCode = Number(stkCallback.ResultCode);
        const resultDesc = clipMpesaMessage(
            stkCallback.ResultDesc || (resultCode === 0 ? 'M-Pesa payment successful' : 'Payment failed or cancelled')
        );

        if (resultCode === 0) {
            const rawItems = stkCallback.CallbackMetadata?.Item;
            const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

            const mpesaReceipt = items.find((item) => item.Name === 'MpesaReceiptNumber')?.Value;
            const amountPaid = items.find((item) => item.Name === 'Amount')?.Value;
            const phonePaid = items.find((item) => item.Name === 'PhoneNumber')?.Value;

            const first = items.find((item) => item.Name === 'FirstName')?.Value;
            const middle = items.find((item) => item.Name === 'MiddleName')?.Value;
            const last = items.find((item) => item.Name === 'LastName')?.Value;
            let payerName = [first, middle, last].filter(Boolean).join(' ').trim() || undefined;
            if (payerName && payerName.length > 255) {
                payerName = payerName.substring(0, 252) + '...';
            }
            const txDate = items.find((item) => item.Name === 'TransactionDate')?.Value;

            const amountNum = amountPaid != null && amountPaid !== '' ? Number(amountPaid) : null;
            const amountDecimal = amountNum != null && !Number.isNaN(amountNum) ? amountNum : null;

            const displayMessage = buildStkCallbackDisplayMessage(
                resultDesc,
                amountDecimal,
                payerName,
                phonePaid,
                mpesaReceipt,
                txDate
            );

            if (!mpesaReceipt) {
                const pendingMsg = clipMpesaMessage(
                    `${displayMessage} — Awaiting receipt in callback; complete manually if needed.`
                );
                await db.execute(
                    'UPDATE payments SET shift_id = COALESCE(shift_id, (SELECT shift_id FROM orders WHERE id = order_id)), amount = COALESCE(?, amount), phone_number = COALESCE(?, phone_number), mpesa_result_message = ?, ' +
                        'customer_name = COALESCE(NULLIF(?, ""), customer_name) WHERE mpesa_checkout_id = ?',
                    [amountDecimal, phonePaid || null, pendingMsg, payerName || null, checkoutID]
                );
                try {
                    const pid = await selectPaymentIdByCheckout(db, checkoutID);
                    await insertMpesaCallbackRow(db, {
                        source: 'stk',
                        checkoutRequestId: checkoutID,
                        rawBody: req.body,
                        parsedSummary: clipMpesaMessage(`${pendingMsg} (no receipt in callback)`),
                        paymentId: pid,
                    });
                } catch (logErr) {
                    console.error('mpesa_callbacks insert failed:', logErr);
                }
                console.warn('M-Pesa STK callback: ResultCode 0 but no MpesaReceiptNumber', checkoutID);
                return acknowledge();
            }

            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();

                await conn.execute(
                    'UPDATE payments SET shift_id = COALESCE(shift_id, (SELECT shift_id FROM orders WHERE id = order_id)), transaction_id = ?, amount = COALESCE(?, amount), phone_number = COALESCE(?, phone_number), ' +
                        "status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP, mpesa_result_message = ?, " +
                        'customer_name = COALESCE(NULLIF(?, ""), customer_name) WHERE mpesa_checkout_id = ?',
                    [mpesaReceipt, amountDecimal, phonePaid || null, displayMessage, payerName || null, checkoutID]
                );

                const [payRows] = await conn.execute('SELECT order_id FROM payments WHERE mpesa_checkout_id = ? LIMIT 1', [
                    checkoutID,
                ]);
                const oid = payRows[0]?.order_id;
                if (oid) {
                    await checkAndCompleteOrder(conn, oid);
                }

                const paymentId = await selectPaymentIdByCheckout(conn, checkoutID);
                await insertMpesaCallbackRow(conn, {
                    source: 'stk',
                    checkoutRequestId: checkoutID,
                    rawBody: req.body,
                    parsedSummary: displayMessage,
                    paymentId,
                });

                await conn.commit();
            } catch (e) {
                await conn.rollback();
                throw e;
            } finally {
                conn.release();
            }
        } else {
            await db.execute(
                'UPDATE payments SET status = ?, mpesa_result_message = ? WHERE mpesa_checkout_id = ?',
                ['failed', resultDesc, checkoutID]
            );
            try {
                const pid = await selectPaymentIdByCheckout(db, checkoutID);
                await insertMpesaCallbackRow(db, {
                    source: 'stk',
                    checkoutRequestId: checkoutID,
                    rawBody: req.body,
                    parsedSummary: resultDesc,
                    paymentId: pid,
                });
            } catch (logErr) {
                console.error('mpesa_callbacks insert failed:', logErr);
            }
        }

        // Emit Real-time Update
        const io = req.app.get('io');
        if (io) io.emit('order_update', { type: 'payment', checkoutID });

        return acknowledge();
    } catch (err) {
        console.error('Callback Error:', err);
        return res.status(500).json({ ResultCode: 1, ResultDesc: 'Internal error' });
    }
};

exports.mpesaC2BConfirmation = async (req, res) => {
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const {
            TransID,
            TransAmount,
            MSISDN,
            FirstName,
            MiddleName,
            LastName,
            BillRefNumber,
        } = body;

        if (!TransID) {
            console.warn('M-Pesa C2B confirmation: missing TransID');
            return res.json({ ResultCode: 0, ResultDesc: 'Success' });
        }

        const amountNum = TransAmount != null && TransAmount !== '' ? Number(TransAmount) : null;
        const amountDecimal = amountNum != null && !Number.isNaN(amountNum) ? amountNum : null;

        if (amountDecimal === null) {
            console.warn('M-Pesa C2B confirmation: missing or invalid TransAmount', TransID);
            try {
                await insertMpesaCallbackRow(db, {
                    source: 'c2b',
                    checkoutRequestId: null,
                    rawBody: body,
                    parsedSummary: clipMpesaMessage(`C2B missing TransAmount — TransID ${TransID}`),
                    paymentId: null,
                });
            } catch (logErr) {
                console.error('mpesa_callbacks insert failed:', logErr);
            }
            return res.json({ ResultCode: 0, ResultDesc: 'Success' });
        }

        let customerName =
            `${FirstName || ''} ${MiddleName || ''} ${LastName || ''}`.trim() || 'M-Pesa Customer';
        if (customerName.length > 255) {
            customerName = customerName.substring(0, 252) + '...';
        }

        let orderId = null;

        if (BillRefNumber && !isNaN(BillRefNumber)) {
            const [order] = await db.execute('SELECT id FROM orders WHERE id = ?', [BillRefNumber]);
            if (order.length > 0) orderId = BillRefNumber;
        }

        const c2bMessage = clipMpesaMessage(
            [
                'M-Pesa C2B callback (customer paid business directly)',
                `KES ${amountDecimal}`,
                `From: ${customerName}${MSISDN ? ` (${MSISDN})` : ''}`,
                TransID ? `Receipt: ${TransID}` : '',
                BillRefNumber ? `Bill ref: ${BillRefNumber}` : '',
            ]
                .filter(Boolean)
                .join(' — ')
        );

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Safaricom may retry callbacks. Do not create a second payment for
            // a transaction that has already been accepted.
            const [duplicateRows] = await conn.execute(
                'SELECT id FROM payments WHERE transaction_id = ? LIMIT 1 FOR UPDATE',
                [TransID]
            );
            if (duplicateRows.length > 0) {
                await conn.commit();
                return res.json({ ResultCode: 0, ResultDesc: 'Success' });
            }

            const [ins] = await conn.execute(
                'INSERT INTO payments (order_id, shift_id, amount, transaction_id, phone_number, status, customer_name, payment_method, confirmed_at, mpesa_result_message) VALUES (?, (SELECT shift_id FROM orders WHERE id = ?), ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
                [orderId, orderId, amountDecimal, TransID, MSISDN, 'confirmed', customerName, 'M-Pesa (Buy Goods)', c2bMessage]
            );
            const paymentId = ins.insertId;

            await insertMpesaCallbackRow(conn, {
                source: 'c2b',
                checkoutRequestId: null,
                rawBody: body,
                parsedSummary: c2bMessage,
                paymentId,
            });

            if (orderId) {
                await checkAndCompleteOrder(conn, orderId);
            }

            await conn.commit();
            
            // Emit Real-time Update
            const io = req.app.get('io');
            if (io) io.emit('order_update', { type: 'payment', transID: TransID });
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }

        return res.json({ ResultCode: 0, ResultDesc: 'Success' });
    } catch (err) {
        console.error('C2B Confirmation Error:', err);
        return res.json({ ResultCode: 1, ResultDesc: 'Failed' });
    }
};

exports.confirmPayment = async (req, res) => {
    const { paymentId } = req.params;
    const { orderId } = req.body;
    
    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        const [paymentRows] = await conn.execute(
            'SELECT amount, status, order_id FROM payments WHERE id = ? FOR UPDATE',
            [paymentId]
        );
        const [orderRows] = await conn.execute('SELECT id FROM orders WHERE id = ? FOR UPDATE', [orderId]);
        if (paymentRows.length === 0 || orderRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Payment or order not found' });
        }
        if (!Number.isFinite(Number(paymentRows[0].amount)) || Number(paymentRows[0].amount) <= 0) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero' });
        }
        if (paymentRows[0].status === 'confirmed' && Number(paymentRows[0].order_id) === Number(orderId)) {
            await conn.commit();
            return res.json({ success: true, message: 'Payment was already confirmed' });
        }
        if (paymentRows[0].status === 'confirmed') {
            await conn.rollback();
            return res.status(409).json({ success: false, message: 'Payment is already linked to another order' });
        }

        // Update payment with orderId and status
        await conn.execute(
            'UPDATE payments SET order_id = ?, shift_id = (SELECT shift_id FROM orders WHERE id = ?), status = ?, confirmed_at = CURRENT_TIMESTAMP, confirmed_by = ? WHERE id = ?',
            [orderId, orderId, 'confirmed', req.user.id, paymentId]
        );

        // Update order status
        await checkAndCompleteOrder(conn, orderId);

        await conn.commit();

        // Emit Real-time Update
        const io = req.app.get('io');
        if (io) io.emit('order_update', { type: 'confirm', paymentId, orderId });

        res.json({ success: true, message: 'Payment linked and confirmed successfully' });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
};

exports.getPayments = async (req, res) => {
    try {
        let query = 'SELECT p.*, o.total_amount, o.customer_name as order_customer_name, u.username as confirmed_by_user FROM payments p LEFT JOIN orders o ON p.order_id = o.id LEFT JOIN users u ON p.confirmed_by = u.id';
        let params = [];

        if (req.query.status === 'incomplete') {
            // === Part 1: All unpaid/incomplete orders (one row per order) ===
            // Start from every order that is not paid/cancelled/merged
            // LEFT JOIN to the single most relevant non-confirmed payment for that order (if any)
            // This guarantees every unpaid order appears exactly once.
            query = `
                SELECT
                    p.id,
                    o.id AS order_id,
                    COALESCE(p.amount, o.total_amount) AS amount,
                    p.transaction_id,
                    p.phone_number,
                    COALESCE(p.payment_method,
                        CASE WHEN o.platform IS NOT NULL THEN o.platform ELSE 'Pending' END
                    ) AS payment_method,
                    COALESCE(p.status, 'pending') AS status,
                    p.mpesa_checkout_id,
                    o.created_at,
                    p.confirmed_at,
                    p.confirmed_by,
                    COALESCE(p.customer_name, o.customer_name) AS customer_name,
                    (SELECT GROUP_CONCAT(CONCAT(COALESCE(oi.item_name, 'Item'), ' × ', oi.quantity) ORDER BY oi.id SEPARATOR ', ')
                     FROM order_items oi WHERE oi.order_id = o.id) AS items_summary,
                    COALESCE(p.mpesa_result_message,
                        CASE WHEN o.platform IS NOT NULL
                             THEN CONCAT('Delivery Order: ', o.platform)
                             ELSE 'No payment attempt yet'
                        END
                    ) AS mpesa_result_message,
                    o.total_amount,
                    o.customer_name AS order_customer_name,
                    u.username AS confirmed_by_user
                FROM orders o
                LEFT JOIN payments p
                    ON p.order_id = o.id
                    AND p.status != 'confirmed'
                    AND p.id = (
                        SELECT p2.id FROM payments p2
                        WHERE p2.order_id = o.id
                          AND p2.status != 'confirmed'
                        ORDER BY
                            CASE WHEN p2.status = 'pending' AND p2.transaction_id IS NOT NULL THEN 0
                                 WHEN p2.status = 'pending' THEN 1
                                 ELSE 2
                            END ASC,
                            p2.id DESC
                        LIMIT 1
                    )
                LEFT JOIN users u ON p.confirmed_by = u.id
                WHERE o.payment_status != 'paid'
                  AND o.status NOT IN ('cancelled', 'merged')
                  AND (o.platform IS NULL OR o.platform = 'Tabaruq Delivery')

                UNION ALL

                -- === Part 2: Unlinked payments (no order attached) ===
                SELECT
                    p.id,
                    p.order_id,
                    p.amount,
                    p.transaction_id,
                    p.phone_number,
                    p.payment_method,
                    p.status,
                    p.mpesa_checkout_id,
                    p.created_at,
                    p.confirmed_at,
                    p.confirmed_by,
                    p.customer_name,
                    NULL AS items_summary,
                    p.mpesa_result_message,
                    NULL AS total_amount,
                    NULL AS order_customer_name,
                    u.username AS confirmed_by_user
                FROM payments p
                LEFT JOIN users u ON p.confirmed_by = u.id
                WHERE p.status != 'confirmed'
                  AND p.order_id IS NULL
            `;
        }

        const [rows] = await db.execute(query + ' ORDER BY COALESCE(confirmed_at, created_at) DESC, id DESC LIMIT 200', params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
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

exports.getPaymentById = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.execute('SELECT p.*, o.total_amount, u.username AS confirmed_by_user FROM payments p LEFT JOIN orders o ON p.order_id = o.id LEFT JOIN users u ON p.confirmed_by = u.id WHERE p.id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Payment not found' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


exports.processCashPayment = async (req, res) => {
    const { orderId, amount } = req.body;
    
    try {
        // Create payment record
        await db.execute(
            'INSERT INTO payments (order_id, shift_id, amount, payment_method, status, confirmed_at, confirmed_by) VALUES (?, (SELECT shift_id FROM orders WHERE id = ?), ?, ?, ?, CURRENT_TIMESTAMP, ?)',
            [orderId, orderId, amount, 'Cash', 'confirmed', req.user.id]
        );

        // Update order status
        await db.execute(
            'UPDATE orders SET payment_status = ?, status = ? WHERE id = ?',
            ['paid', 'completed', orderId]
        );

        // Emit Real-time Update
        const io = req.app.get('io');
        if (io) io.emit('order_update', { type: 'cash', orderId });

        res.json({ success: true, message: 'Cash payment processed successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.processBankPayment = async (req, res) => {
    const { orderId, amount, transaction_id } = req.body;
    const confirmationCode = String(transaction_id || '').trim();
    if (!confirmationCode) {
        return res.status(400).json({ success: false, message: 'Bank confirmation code is required' });
    }

    try {
        await db.execute(
            'INSERT INTO payments (order_id, shift_id, amount, transaction_id, payment_method, status, confirmed_at, confirmed_by) VALUES (?, (SELECT shift_id FROM orders WHERE id = ?), ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
            [orderId, orderId, amount, confirmationCode, 'Bank', 'confirmed', req.user.id]
        );

        await db.execute(
            'UPDATE orders SET payment_status = ?, status = ? WHERE id = ?',
            ['paid', 'completed', orderId]
        );

        const io = req.app.get('io');
        if (io) io.emit('order_update', { type: 'bank', orderId });

        res.json({ success: true, message: 'Bank payment processed successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Customer paid via Pay Bill, Till, or manual M-Pesa (not STK). Call after the payment is complete.
 * Updates the pending STK row for this order when one exists; otherwise inserts a new confirmed payment.
 */
exports.recordOfflineMpesa = async (req, res) => {
    const { orderId, amount, transaction_id, phone_number, customer_name } = req.body;
    const oid = Number(orderId);
    if (!oid || Number.isNaN(oid)) {
        return res.status(400).json({ success: false, message: 'Valid order ID is required' });
    }
    const cleanReceipt = transaction_id != null ? String(transaction_id).trim() : '';
    if (!cleanReceipt) {
        return res.status(400).json({ success: false, message: 'M-Pesa confirmation code (receipt) is required' });
    }

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        const [orders] = await conn.execute(
            'SELECT id, shift_id, total_amount, payment_status, status, customer_name FROM orders WHERE id = ? FOR UPDATE',
            [oid]
        );
        if (orders.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        const order = orders[0];
        if (order.payment_status === 'paid') {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'This order is already marked as paid' });
        }

        const expected = Number(order.total_amount);
        const payAmount = amount != null && amount !== '' ? Number(amount) : expected;
        if (Number.isNaN(payAmount) || Math.abs(payAmount - expected) > 0.02) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Amount must match the order total' });
        }

        const [payList] = await conn.execute('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC', [oid]);
        const hasConfirmed = payList.some((p) => p.status === 'confirmed');
        if (hasConfirmed) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'This order already has a confirmed payment' });
        }

        const pendingRow = payList.find((p) => p.status === 'pending');

        const phone = phone_number != null ? String(phone_number).trim() : '';
        const nameFromReq = customer_name != null ? String(customer_name).trim() : '';
        let custMerge = nameFromReq || null;
        if (custMerge && custMerge.length > 255) {
            custMerge = custMerge.substring(0, 252) + '...';
        }

        const [dup] = await conn.execute(
            "SELECT id FROM payments WHERE transaction_id = ? AND transaction_id IS NOT NULL AND TRIM(transaction_id) <> ''",
            [cleanReceipt]
        );
        if (dup.length > 0) {
            const dupId = dup[0].id;
            if (!pendingRow || dupId !== pendingRow.id) {
                const [dupRows] = await conn.execute('SELECT * FROM payments WHERE id = ? FOR UPDATE', [dupId]);
                const df = dupRows[0];
                if (!df || df.order_id != null || Math.abs(Number(df.amount) - expected) > 0.02) {
                    await conn.rollback();
                    return res.status(409).json({ success: false, message: 'This M-Pesa receipt is already recorded' });
                }
                const [otherConfirmed] = await conn.execute(
                    "SELECT id FROM payments WHERE order_id = ? AND status = 'confirmed' AND id <> ? LIMIT 1",
                    [oid, dupId]
                );
                if (otherConfirmed.length > 0) {
                    await conn.rollback();
                    return res.status(400).json({ success: false, message: 'This order already has a confirmed payment' });
                }
                await finalizeIncomingLink(conn, {
                    orderId: oid,
                    paymentId: dupId,
                    userId: req.user.id,
                    payment: df,
                });
                await conn.execute(
                    'UPDATE orders SET customer_name = COALESCE(NULLIF(?, ""), customer_name) WHERE id = ?',
                    [custMerge, oid]
                );
                await conn.commit();
                return res.json({
                    success: true,
                    message: 'Unlinked incoming M-Pesa matched this receipt and was linked to the order',
                });
            }
        }

        const msg = clipMpesaMessage(
            'Offline M-Pesa: customer paid via Pay Bill, Till, or send money (not STK). Recorded after payment completed.'
        );

        if (pendingRow) {
            await conn.execute(
                    'UPDATE payments SET shift_id = ?, transaction_id = ?, amount = ?, phone_number = COALESCE(NULLIF(?, ""), phone_number), ' +
                    "status = 'confirmed', payment_method = 'M-Pesa (Offline)', confirmed_at = CURRENT_TIMESTAMP, confirmed_by = ?, " +
                    'mpesa_result_message = ?, customer_name = COALESCE(NULLIF(?, ""), customer_name) WHERE id = ? AND order_id = ?',
                [order.shift_id, cleanReceipt, payAmount, phone, req.user.id, msg, custMerge, pendingRow.id, oid]
            );
        } else {
            let cust = nameFromReq || order.customer_name || 'Guest';
            if (cust.length > 255) {
                cust = cust.substring(0, 252) + '...';
            }
            await conn.execute(
                'INSERT INTO payments (order_id, shift_id, amount, transaction_id, phone_number, payment_method, status, confirmed_at, confirmed_by, customer_name, mpesa_result_message) VALUES (?, ?, ?, ?, NULLIF(?, ""), ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)',
                [oid, order.shift_id, payAmount, cleanReceipt, phone, 'M-Pesa (Offline)', 'confirmed', req.user.id, cust, msg]
            );
        }

        await conn.execute(
            'UPDATE orders SET payment_status = ?, status = ?, customer_name = COALESCE(NULLIF(?, ""), customer_name) WHERE id = ?',
            ['paid', 'completed', custMerge, oid]
        );

        await conn.commit();
        const io = req.app.get('io');
        if (io) io.emit('order_update', { type: 'offline_payment', orderId: oid });
        res.json({ success: true, message: 'Offline M-Pesa payment recorded and order completed' });
    } catch (err) {
        if (conn) {
            try {
                await conn.rollback();
            } catch (rbErr) {
                /* ignore */
            }
        }
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message, stack: err.stack });
    } finally {
        if (conn) conn.release();
    }
};

/**
 * Incoming M-Pesa (e.g. C2B) saved with no order match — cashier picks one to attach to an open order.
 * Rows with order_id set or whose receipt already exists on a confirmed linked payment are excluded.
 */
exports.getUnlinkedIncoming = async (req, res) => {
    try {
        // Optional: filter by amount (order total) with ±1 KES tolerance
        const filterAmount = req.query.amount != null ? Number(req.query.amount) : null;
        const hasAmountFilter = filterAmount != null && !Number.isNaN(filterAmount) && filterAmount > 0;

        let sql = `
            SELECT id, amount, transaction_id, phone_number, payment_method, status, mpesa_checkout_id,
                   created_at, confirmed_at, customer_name, mpesa_result_message
             FROM payments
             WHERE (
                    (order_id IS NULL AND status IN ('confirmed', 'pending'))
                 OR (order_id IS NOT NULL AND status = 'pending' AND mpesa_checkout_id IS NOT NULL)
               )
               AND (
                    (transaction_id IS NOT NULL AND TRIM(transaction_id) <> '')
                 OR (status = 'pending' AND mpesa_result_message IS NOT NULL AND CHAR_LENGTH(TRIM(mpesa_result_message)) > 0)
                 OR (mpesa_checkout_id IS NOT NULL AND status = 'pending')
               )
               AND (payment_method IS NULL OR payment_method <> 'Cash')
               AND NOT EXISTS (
                 SELECT 1 FROM payments p2
                 WHERE p2.transaction_id IS NOT NULL
                   AND TRIM(p2.transaction_id) <> ''
                   AND p2.transaction_id = payments.transaction_id
                   AND p2.order_id IS NOT NULL
                   AND p2.status = 'confirmed'
                   AND p2.id <> payments.id
               )
        `;

        const params = [];
        if (hasAmountFilter) {
            // Only show messages whose amount is within ±1 KES of the order total
            sql += ` AND ABS(CAST(amount AS DECIMAL(10,2)) - ?) <= 1.00`;
            params.push(filterAmount);
        }

        sql += ` ORDER BY COALESCE(confirmed_at, created_at) DESC, id DESC`;

        const [rows] = await db.execute(sql, params);
        res.json({ success: true, data: rows, amountFilter: hasAmountFilter ? filterAmount : null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Link an unlinked incoming payment to an order in one transaction (amount vs order total within 0.02 KES).
 */
exports.applyIncomingToOrder = async (req, res) => {
    const paymentId = Number(req.body.paymentId);
    const orderId = Number(req.body.orderId);
    if (!paymentId || Number.isNaN(paymentId) || !orderId || Number.isNaN(orderId)) {
        return res.status(400).json({ success: false, message: 'paymentId and orderId are required' });
    }

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        const [orders] = await conn.execute(
            'SELECT id, total_amount, payment_status, status, customer_name FROM orders WHERE id = ? FOR UPDATE',
            [orderId]
        );
        if (orders.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        const order = orders[0];

        const [payRows] = await conn.execute('SELECT * FROM payments WHERE id = ? FOR UPDATE', [paymentId]);
        if (payRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        const payment = payRows[0];

        if (payment.order_id != null && Number(payment.order_id) !== orderId) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'This payment is already linked to another order' });
        }

        if (
            payment.order_id != null &&
            Number(payment.order_id) === orderId &&
            payment.status === 'confirmed' &&
            order.payment_status === 'paid'
        ) {
            await conn.commit();
            return res.json({ success: true, message: 'Payment already applied to this order', idempotent: true });
        }

        const [otherConfirmed] = await conn.execute(
            "SELECT id FROM payments WHERE order_id = ? AND status = 'confirmed' AND id <> ? LIMIT 1",
            [orderId, paymentId]
        );
        if (otherConfirmed.length > 0) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'This order already has a confirmed payment' });
        }

        if (order.payment_status === 'paid' && order.status === 'completed') {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'This order is already marked as paid' });
        }

        const expected = Number(order.total_amount);
        const payAmt = Number(payment.amount);
        if (Number.isNaN(expected) || Number.isNaN(payAmt) || Math.abs(payAmt - expected) > 0.02) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: `Payment amount (KES ${payAmt}) does not match order total (KES ${expected}). Maximum difference allowed is KES 0.02.`,
            });
        }

        await finalizeIncomingLink(conn, { orderId, paymentId, userId: req.user.id, payment });

        await conn.commit();
        res.json({ success: true, message: 'Incoming M-Pesa linked and order completed' });
    } catch (err) {
        if (conn) {
            try {
                await conn.rollback();
            } catch (rbErr) {
                /* ignore */
            }
        }
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
};

exports.mpesaC2BValidation = async (req, res) => {
    // Safaricom sends a request here first to validate the customer's payment before confirming.
    // We auto-accept all payments by default (ResultCode: 0).
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
};

const registerC2BURLsInternal = async () => {
    const token = await getMpesaToken();
    const shortCode = process.env.MPESA_C2B_SHORTCODE || process.env.MPESA_SHORTCODE;
    const callbackBase = process.env.MPESA_CALLBACK_URL ? process.env.MPESA_CALLBACK_URL.replace('/api/payments/callback', '/api/payments') : '';
    const confirmationUrl = process.env.MPESA_C2B_CONFIRMATION_URL || `${callbackBase}/c2b-confirmation`;
    const validationUrl = process.env.MPESA_C2B_VALIDATION_URL || `${callbackBase}/c2b-validation`;
    
    const response = await axios.post(
        process.env.MPESA_C2B_REGISTER_URL || 'https://sandbox.safaricom.co.ke/mpesa/c2b/v2/registerurl',
        {
            ShortCode: shortCode,
            ResponseType: 'Completed',
            ConfirmationURL: confirmationUrl,
            ValidationURL: validationUrl,
        },
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
    return response.data;
};

exports.registerC2BURLsInternal = registerC2BURLsInternal;

exports.registerC2BURLs = async (req, res) => {
    try {
        const data = await registerC2BURLsInternal();
        res.json({ success: true, message: 'C2B URLs registered successfully', data });
    } catch (error) {
        console.error('C2B Register Error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Failed to register C2B URLs', error: error.response?.data });
    }
};

exports.deletePayment = async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // Get the payment first to know the orderId
        const [paymentRows] = await conn.execute('SELECT order_id FROM payments WHERE id = ? FOR UPDATE', [id]);
        if (paymentRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        const orderId = paymentRows[0].order_id;

        // Delete the payment record
        await conn.execute('DELETE FROM payments WHERE id = ?', [id]);

        // If it was linked to an order, update the order status
        if (orderId) {
            await checkAndCompleteOrder(conn, orderId);
        }

        await conn.commit();
        res.json({ success: true, message: 'Payment deleted successfully' });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
};
