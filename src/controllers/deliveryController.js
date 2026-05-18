const db = require('../config/db');

/**
 * Delivery Module Controller
 * Handles Uber Eats, Bolt Food, Glovo webhooks and reconciliation.
 */

// 1. Order Receiving via Webhook
exports.handleWebhookOrder = async (req, res) => {
    // Standardize incoming data (Deliverect / Platform format)
    const { 
        platform, 
        order_id, 
        customer_name, 
        items, 
        total, 
        currency, 
        status = 'pending',
        fees = [] // Expecting [{type: 'commission', percentage: 25, amount: 100}]
    } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Check for duplicate order ID
        const [existing] = await connection.execute(
            'SELECT id FROM orders WHERE platform = ? AND platform_order_id = ?',
            [platform, order_id]
        );

        if (existing.length > 0) {
            await connection.rollback();
            return res.status(200).json({ success: true, message: 'Duplicate order ignored' });
        }

        // Save order
        const [orderResult] = await connection.execute(
            'INSERT INTO orders (platform, platform_order_id, total_amount, status, customer_name) VALUES (?, ?, ?, ?, ?)',
            [platform, order_id, total, status, customer_name || 'Delivery Customer']
        );
        const internalOrderId = orderResult.insertId;

        // Save order items
        for (const item of items) {
            await connection.execute(
                'INSERT INTO order_items (order_id, item_name, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [internalOrderId, item.name, item.quantity, item.price, item.quantity * item.price]
            );
        }

        // Save fees if provided
        for (const fee of fees) {
            await connection.execute(
                'INSERT INTO platform_fees (order_id, fee_percentage, fee_amount) VALUES (?, ?, ?)',
                [internalOrderId, fee.percentage, fee.amount]
            );
        }

        await connection.commit();

        // Emit via WebSocket to kitchen display
        const io = req.app.get('io');
        if (io) {
            io.emit('new_delivery_order', { 
                id: internalOrderId, 
                platform, 
                platform_order_id: order_id, 
                customer_name, 
                items, 
                total, 
                status 
            });
        }

        res.status(200).json({ success: true, orderId: internalOrderId });
    } catch (err) {
        await connection.rollback();
        console.error('Webhook Error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    } finally {
        connection.release();
    }
};

// 2. Order Confirmation / Status Updates
exports.updateDeliveryStatus = async (req, res) => {
    const { id } = req.params;
    const { status, reason } = req.body; // status: accepted, ready, rejected, collected

    try {
        const [order] = await db.execute('SELECT * FROM orders WHERE id = ?', [id]);
        if (order.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

        // Update local status
        await db.execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);

        // MOCK: Notify Platform API (Uber/Bolt/Glovo)
        // In real scenario, we would axios.post to Uber API here
        console.log(`Notifying ${order[0].platform} that order #${order[0].platform_order_id} is now ${status}`);

        res.json({ success: true, message: `Order status updated to ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// 3. Payment Reconciliation
exports.recordSettlement = async (req, res) => {
    const { platform, payout_id, amount, date_received, orderIds } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Record settlement
        const [result] = await connection.execute(
            'INSERT INTO settlements (platform, payout_id, amount, date_received, status) VALUES (?, ?, ?, ?, ?)',
            [platform, payout_id, amount, date_received, 'completed']
        );
        const settlementId = result.insertId;

        // Link orders to settlement and mark them paid
        if (orderIds && orderIds.length > 0) {
            for (const orderId of orderIds) {
                await connection.execute(
                    'INSERT INTO order_settlements (order_id, settlement_id) VALUES (?, ?)',
                    [orderId, settlementId]
                );
                await connection.execute(
                    "UPDATE orders SET payment_status = 'paid' WHERE id = ?",
                    [orderId]
                );
            }
        }

        await connection.commit();
        res.json({ success: true, settlementId, message: 'Settlement recorded and orders reconciled' });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        connection.release();
    }
};

exports.getReconciliationReport = async (req, res) => {
    try {
        // Total orders vs Settled amount
        const [summary] = await db.execute(`
            SELECT 
                platform,
                COUNT(id) as total_orders,
                SUM(total_amount) as gross_revenue,
                SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as settled_revenue,
                SUM(CASE WHEN payment_status != 'paid' THEN total_amount ELSE 0 END) as pending_revenue
            FROM orders 
            WHERE platform IS NOT NULL
            GROUP BY platform
        `);

        // Commissions/Fees
        const [fees] = await db.execute(`
            SELECT 
                o.platform,
                SUM(f.fee_amount) as total_fees
            FROM platform_fees f
            JOIN orders o ON f.order_id = o.id
            GROUP BY o.platform
        `);

        // Merge results
        const report = summary.map(s => {
            const platformFee = fees.find(f => f.platform === s.platform)?.total_fees || 0;
            return {
                ...s,
                total_fees: platformFee,
                net_revenue: s.gross_revenue - platformFee
            };
        });

        res.json({ success: true, data: report });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getDeliveryOrders = async (req, res) => {
    const { status } = req.query;
    try {
        let query = 'SELECT * FROM orders WHERE platform IS NOT NULL';
        const params = [];
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        query += ' ORDER BY created_at DESC';
        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getDeliveryStats = async (req, res) => {
    try {
        const [daily] = await db.execute(`
            SELECT SUM(total_amount) as total, COUNT(id) as count 
            FROM orders 
            WHERE platform IS NOT NULL AND DATE(created_at) = CURDATE()
        `);

        const [weekly] = await db.execute(`
            SELECT SUM(total_amount) as total, COUNT(id) as count 
            FROM orders 
            WHERE platform IS NOT NULL AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
        `);

        const [monthly] = await db.execute(`
            SELECT SUM(total_amount) as total, COUNT(id) as count 
            FROM orders 
            WHERE platform IS NOT NULL AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())
        `);

        res.json({
            success: true,
            data: {
                daily: daily[0] || { total: 0, count: 0 },
                weekly: weekly[0] || { total: 0, count: 0 },
                monthly: monthly[0] || { total: 0, count: 0 }
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


