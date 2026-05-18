const db = require('../config/db');

exports.createOrder = async (req, res) => {
    const { items, total_amount, customer_name, platform, platform_order_id, isMerge } = req.body;
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        const nameToSave = customer_name || (platform ? `${platform} Order` : 'Guest');

        const [orderResult] = await connection.execute(
            'INSERT INTO orders (cashier_id, total_amount, status, payment_status, customer_name, platform, platform_order_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, Number(total_amount) || 0, 'pending', 'pending', nameToSave, platform || null, platform_order_id || null]
        );
        const orderId = orderResult.insertId;

        for (const item of items) {
            // Determine price to record
            let itemPrice = Number(item.selling_price) || Number(item.price) || 0;
            if (platform === 'Uber Eats' && item.uber_price) itemPrice = Number(item.uber_price);
            else if (platform === 'Glovo' && item.glovo_price) itemPrice = Number(item.glovo_price);
            else if (platform === 'Bolt Food' && item.bolt_price) itemPrice = Number(item.bolt_price);

            const quantity = Number(item.quantity) || 0;
            const subtotal = quantity * itemPrice;

            // 1. Record Order Item
            await connection.execute(
                'INSERT INTO order_items (order_id, item_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.id, quantity, itemPrice, subtotal]
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
            SELECT o.*, u.username as cashier_name 
            FROM orders o 
            JOIN users u ON o.cashier_id = u.id 
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

        res.json({ 
            success: true, 
            data: { 
                ...order[0], 
                items,
                hotel_name: 'TABARUQ FOODS',
                mpesa_paybill: process.env.MPESA_C2B_SHORTCODE || '600000',
                mpesa_till: process.env.MPESA_STK_SHORTCODE || '174379'
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

        await db.execute('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?', [status, payment_status, id]);
        
        // Emit Real-time Update
        const io = req.app.get('io');
        if (io) io.emit('order_update', { type: 'status', orderId: id, status, payment_status });

        res.json({ success: true, message: 'Order status updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
