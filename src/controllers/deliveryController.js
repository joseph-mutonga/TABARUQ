const db = require('../config/db');

// Initialize database table if not exists
(async () => {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS platform_commissions (
                platform VARCHAR(50) PRIMARY KEY,
                commission_percentage DECIMAL(5, 2) DEFAULT 0.00
            )
        `);
        // Seed initial values for platforms if not present
        await db.execute(`INSERT IGNORE INTO platform_commissions (platform, commission_percentage) VALUES 
            ('Uber Eats', 0.00),
            ('Glovo', 0.00),
            ('Bolt Food', 0.00)
        `);
        // Add index on orders(created_at) if not exists
        try {
            await db.execute('ALTER TABLE orders ADD INDEX idx_orders_created_at (created_at)');
            console.log('Added index idx_orders_created_at to orders');
        } catch (e) {
            if (e.code !== 'ER_DUP_KEYNAME') {
                console.error('Failed to add index idx_orders_created_at:', e);
            }
        }
    } catch (err) {
        console.error('Failed to initialize platform_commissions table:', err);
    }
})();

/**
 * Delivery Module Controller
 * Handles Uber Eats, Bolt Food, Glovo webhooks and reconciliation.
 */

// 1. Order Receiving via Webhook
exports.handleWebhookOrder = async (req, res) => {
    const configuredSecret = process.env.DELIVERY_WEBHOOK_SECRET;
    if (!configuredSecret || req.get('x-delivery-webhook-secret') !== configuredSecret) {
        return res.status(401).json({ success: false, message: 'Invalid delivery webhook credentials' });
    }

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

    const allowedPlatforms = ['Uber Eats', 'Glovo', 'Bolt Food', 'Tabaruq Delivery'];
    const allowedStatuses = ['pending', 'accepted', 'ready', 'rejected', 'collected', 'cancelled'];
    if (!allowedPlatforms.includes(platform) || !order_id || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid delivery order payload' });
    }
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid delivery order status' });
    }
    const totalAmount = Number(total);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Delivery order total must be greater than zero' });
    }
    for (const item of items) {
        if (!item.name || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 ||
            !Number.isFinite(Number(item.price)) || Number(item.price) < 0) {
            return res.status(400).json({ success: false, message: 'Invalid delivery order item' });
        }
    }

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
            [platform, order_id, totalAmount, status, customer_name || 'Delivery Customer']
        );
        const internalOrderId = orderResult.insertId;

        // Save order items
        for (const item of items) {
            await connection.execute(
                'INSERT INTO order_items (order_id, item_name, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [internalOrderId, item.name, item.quantity, item.price, item.quantity * item.price]
            );
        }

        // Save fees if provided, otherwise fetch platform settings and calculate
        if (fees && fees.length > 0) {
            for (const fee of fees) {
                await connection.execute(
                    'INSERT INTO platform_fees (order_id, fee_percentage, fee_amount) VALUES (?, ?, ?)',
                    [internalOrderId, Number(fee.percentage) || 0, Number(fee.amount) || 0]
                );
            }
        } else {
            // Fetch platform commission percentage
            const [commissions] = await connection.execute(
                'SELECT commission_percentage FROM platform_commissions WHERE platform = ?',
                [platform]
            );
            const commissionPct = commissions.length > 0 ? Number(commissions[0].commission_percentage) : 0;
            if (commissionPct > 0) {
                const feeAmount = totalAmount * (commissionPct / 100);
                await connection.execute(
                    'INSERT INTO platform_fees (order_id, fee_percentage, fee_amount) VALUES (?, ?, ?)',
                    [internalOrderId, commissionPct, feeAmount]
                );
            }
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
        const validStatuses = ['pending', 'accepted', 'ready', 'rejected', 'collected', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid delivery status' });
        }
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
    const { platform, payout_id, amount, date_received } = req.body;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Record settlement
        const [result] = await connection.execute(
            'INSERT INTO settlements (platform, payout_id, amount, date_received, status) VALUES (?, ?, ?, ?, ?)',
            [platform, payout_id, amount, date_received, 'completed']
        );
        const settlementId = result.insertId;

        // Fetch all pending orders for this platform in FIFO order (oldest first)
        const [pendingOrders] = await connection.execute(
            "SELECT id, total_amount, customer_name FROM orders WHERE platform = ? AND payment_status != 'paid' ORDER BY created_at ASC",
            [platform]
        );

        let remainingAmount = Number(amount) || 0;

        for (const order of pendingOrders) {
            const orderTotal = Number(order.total_amount) || 0;
            
            // Get the fee that was recorded at the time of the order
            const [feeRow] = await connection.execute(
                'SELECT fee_amount FROM platform_fees WHERE order_id = ?',
                [order.id]
            );
            const feeAmount = feeRow.length > 0 ? Number(feeRow[0].fee_amount) : 0;
            const netAmount = orderTotal - feeAmount;

            // Stop if the remaining settlement amount cannot cover the net order total (allowing 0.1 rounding tolerance)
            if (remainingAmount < netAmount - 0.1) {
                break;
            }

            // Link order to settlement
            await connection.execute(
                'INSERT INTO order_settlements (order_id, settlement_id) VALUES (?, ?)',
                [order.id, settlementId]
            );

            // Mark order as paid
            await connection.execute(
                "UPDATE orders SET payment_status = 'paid' WHERE id = ?",
                [order.id]
            );

            // Insert payment record so it registers in transaction reports/history (using netAmount!)
            await connection.execute(
                'INSERT INTO payments (order_id, amount, transaction_id, payment_method, status, customer_name, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    order.id,
                    netAmount,
                    payout_id,
                    platform,
                    'confirmed',
                    order.customer_name || 'Delivery Customer',
                    date_received
                ]
            );

            remainingAmount -= netAmount;
        }

        await connection.commit();
        res.json({ success: true, settlementId, message: 'Settlement recorded and orders reconciled auto-sequentially' });
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
                pc.platform,
                pc.commission_percentage,
                COUNT(o.id) as total_orders,
                COALESCE(SUM(o.total_amount), 0) as gross_revenue,
                COUNT(CASE WHEN YEARWEEK(o.created_at, 1) = YEARWEEK(CURDATE(), 1) THEN o.id END) as weekly_orders,
                COALESCE(SUM(CASE WHEN YEARWEEK(o.created_at, 1) = YEARWEEK(CURDATE(), 1) THEN o.total_amount ELSE 0 END), 0) as weekly_revenue,
                COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN 
                    COALESCE(
                        (SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id AND p.status = 'confirmed'),
                        o.total_amount
                    )
                ELSE 0 END), 0) as settled_revenue,
                COALESCE(SUM(
                    (SELECT SUM(pf.fee_amount) FROM platform_fees pf WHERE pf.order_id = o.id)
                ), 0) as commission_fees,
                COALESCE(SUM(CASE WHEN o.payment_status != 'paid' THEN o.total_amount ELSE 0 END), 0) as pending_revenue
            FROM platform_commissions pc
            LEFT JOIN orders o ON o.platform = pc.platform
            GROUP BY pc.platform, pc.commission_percentage
        `);

        res.json({ success: true, data: summary });
    } catch (err) {
        console.error('getReconciliationReport Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Commission Settings Controllers
exports.getCommissions = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM platform_commissions');
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getCommissions Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.saveCommissions = async (req, res) => {
    const { uber_percentage, glovo_percentage, bolt_percentage, own_delivery_percentage } = req.body;
    try {
        await db.execute(
            'UPDATE platform_commissions SET commission_percentage = ? WHERE platform = ?',
            [parseFloat(uber_percentage || 0), 'Uber Eats']
        );
        await db.execute(
            'UPDATE platform_commissions SET commission_percentage = ? WHERE platform = ?',
            [parseFloat(glovo_percentage || 0), 'Glovo']
        );
        await db.execute(
            'UPDATE platform_commissions SET commission_percentage = ? WHERE platform = ?',
            [parseFloat(bolt_percentage || 0), 'Bolt Food']
        );
        await db.execute(
            'UPDATE platform_commissions SET commission_percentage = ? WHERE platform = ?',
            [parseFloat(own_delivery_percentage || 0), 'Tabaruq Delivery']
        );
        res.json({ success: true, message: 'Platform commission settings updated successfully' });
    } catch (err) {
        console.error('saveCommissions Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getDeliveryOrders = async (req, res) => {
    const { status, period, platform } = req.query;
    try {
        let query = `SELECT o.*, u.username as cashier_name,
            (SELECT GROUP_CONCAT(CONCAT(oi.quantity, 'x ', COALESCE(oi.item_name, i.name, 'Food')) SEPARATOR ', ')
             FROM order_items oi LEFT JOIN inventory i ON i.id = oi.item_id
             WHERE oi.order_id = o.id) AS delivered_food
            FROM orders o LEFT JOIN users u ON o.cashier_id = u.id
            WHERE o.platform IS NOT NULL AND (o.scheduled_for IS NULL OR o.scheduled_released = 1)`;
        const params = [];
        
        if (req.user.role !== 'admin') {
            query += ' AND o.cashier_id = ?';
            params.push(req.user.id);
        }

        if (status) {
            query += ' AND o.status = ?';
            params.push(status);
        }

        if (platform) {
            query += ' AND o.platform = ?';
            params.push(platform);
        }

        if (period === 'day') {
            query += ' AND DATE(o.created_at) = CURDATE()';
        } else if (period === 'week') {
            query += ' AND YEARWEEK(o.created_at, 1) = YEARWEEK(CURDATE(), 1)';
        } else if (period === 'month') {
            query += ' AND MONTH(o.created_at) = MONTH(CURDATE()) AND YEAR(o.created_at) = YEAR(CURDATE())';
        } else if (period === 'year') {
            query += ' AND YEAR(o.created_at) = YEAR(CURDATE())';
        }
        query += ' ORDER BY o.created_at DESC';
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


