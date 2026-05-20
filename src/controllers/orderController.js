const db = require('../config/db');

exports.createOrder = async (req, res) => {
    const { items, total_amount, customer_name, platform, platform_order_id, isMerge, mergedOrderIds } = req.body;
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        let nameToSave = customer_name || (platform ? `${platform} Order` : 'Guest');
        if (nameToSave && nameToSave.length > 255) {
            nameToSave = nameToSave.substring(0, 252) + '...';
        }

        const [orderResult] = await connection.execute(
            'INSERT INTO orders (cashier_id, total_amount, status, payment_status, customer_name, platform, platform_order_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, Number(total_amount) || 0, 'pending', 'pending', nameToSave, platform || null, platform_order_id || null]
        );
        const orderId = orderResult.insertId;

        // If it's a delivery platform order, insert platform fees based on settings
        if (platform) {
            const [commissions] = await connection.execute(
                'SELECT commission_percentage FROM platform_commissions WHERE platform = ?',
                [platform]
            );
            const commissionPct = commissions.length > 0 ? Number(commissions[0].commission_percentage) : 0;
            if (commissionPct > 0) {
                const feeAmount = (Number(total_amount) || 0) * (commissionPct / 100);
                await connection.execute(
                    'INSERT INTO platform_fees (order_id, fee_percentage, fee_amount) VALUES (?, ?, ?)',
                    [orderId, commissionPct, feeAmount]
                );
            }
        }

        // Consolidate items with the same item_id into a single line (important for merged orders)
        const consolidatedMap = new Map();
        for (const item of items) {
            let itemPrice = Number(item.selling_price) || Number(item.price) || 0;
            if (platform === 'Uber Eats' && item.uber_price) itemPrice = Number(item.uber_price);
            else if (platform === 'Glovo' && item.glovo_price) itemPrice = Number(item.glovo_price);
            else if (platform === 'Bolt Food' && item.bolt_price) itemPrice = Number(item.bolt_price);

            const key = `${item.id}_${itemPrice}`; // group by item + price
            const qty = Number(item.quantity) || 0;
            if (consolidatedMap.has(key)) {
                consolidatedMap.get(key).quantity += qty;
            } else {
                consolidatedMap.set(key, {
                    id: item.id,
                    quantity: qty,
                    price: itemPrice,
                    name: item.name || item.item_name || null
                });
            }
        }

        for (const item of consolidatedMap.values()) {
            const subtotal = item.quantity * item.price;

            // 1. Record Order Item (one consolidated row per item)
            await connection.execute(
                'INSERT INTO order_items (order_id, item_id, quantity, price, subtotal, item_name) VALUES (?, ?, ?, ?, ?, ?)',
                [orderId, item.id, item.quantity, item.price, subtotal, item.name || null]
            );

            if (!isMerge) {
                // 2. Deduct Stock
                await connection.execute(
                    'UPDATE inventory SET quantity = quantity - ? WHERE id = ?',
                    [item.quantity, item.id]
                );

                // 3. Log Stock Change
                await connection.execute(
                    'INSERT INTO stock_logs (item_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)',
                    [item.id, req.user.id, -item.quantity, `Sale - Order #${orderId}`]
                );
            }
        }

        // Handle merging of old orders and their payments
        if (isMerge && Array.isArray(mergedOrderIds) && mergedOrderIds.length > 0) {
            for (const oldId of mergedOrderIds) {
                // Mark old order as merged
                await connection.execute(
                    'UPDATE orders SET status = "merged", payment_status = "merged" WHERE id = ?',
                    [oldId]
                );
                // Re-link all payments from old order to the new combined order
                await connection.execute(
                    'UPDATE payments SET order_id = ? WHERE order_id = ?',
                    [orderId, oldId]
                );
            }
        }

        await connection.commit();
        
        // Emit Real-time Events
        const io = req.app.get('io');
        if (io) {
            io.emit('order_update', { type: 'new', orderId });
            io.emit('stock_update', { items: items.map(i => i.id) });
        }

        res.status(201).json({ success: true, orderId, message: 'Order created successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('ERROR IN CREATE_ORDER:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    } finally {
        connection.release();
    }
};

exports.getOrders = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT o.*, COALESCE(u.username, o.platform, 'Delivery') as cashier_name 
            FROM orders o 
            LEFT JOIN users u ON o.cashier_id = u.id 
            WHERE o.status != 'merged'
            ORDER BY o.created_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getOrderDetails = async (req, res) => {
    const { id } = req.params;
    try {
        const [order] = await db.execute(`
            SELECT o.*, u.username as cashier_name 
            FROM orders o 
            LEFT JOIN users u ON o.cashier_id = u.id 
            WHERE o.id = ?
        `, [id]);
        if (order.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

        const [items] = await db.execute(`
            SELECT oi.*, COALESCE(i.name, oi.item_name) as name 
            FROM order_items oi 
            LEFT JOIN inventory i ON oi.item_id = i.id 
            WHERE oi.order_id = ?
        `, [id]);

        const [settingsRows] = await db.execute('SELECT * FROM receipt_settings WHERE id = 1');
        const settings = settingsRows[0] || {};

        res.json({ 
            success: true, 
            data: { 
                ...order[0], 
                items,
                hotel_name: settings.hotel_name || 'TABARUQ FOODS',
                phone_number: settings.phone_number || '',
                address: settings.address || '',
                mpesa_paybill: settings.mpesa_paybill || '600000',
                mpesa_till: settings.mpesa_till || '174379',
                footer_message: settings.footer_message || 'Thank you for dining with us!'
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { status, payment_status } = req.body;
    try {
        if (status === 'cancelled' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only administrators can cancel orders' });
        }

        // Sanitize payment_status — the DB ENUM only allows: pending, paid, failed, partial, merged
        // 'cancelled' is NOT a valid ENUM value; use 'pending' when cancelling (order.status handles exclusion)
        const validPaymentStatuses = ['pending', 'paid', 'failed', 'partial', 'merged'];
        const safePaymentStatus = validPaymentStatuses.includes(payment_status) ? payment_status : 'pending';

        await db.execute('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?', [status, safePaymentStatus, id]);
        
        // Emit Real-time Update
        const io = req.app.get('io');
        if (io) io.emit('order_update', { type: 'status', orderId: id, status, payment_status: safePaymentStatus });

        res.json({ success: true, message: 'Order status updated' });
    } catch (err) {
        console.error('updateOrderStatus error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};
