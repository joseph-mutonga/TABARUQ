const db = require('../config/db');

exports.createOrder = async (req, res) => {
    const { items, total_amount, customer_name } = req.body;
    const connection = await db.getConnection();
    
    try {
        // 0. Check stock availability first
        for (const item of items) {
            const [stock] = await db.execute('SELECT quantity, name FROM inventory WHERE id = ?', [item.id]);
            if (stock.length === 0 || stock[0].quantity < item.quantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Insufficient stock for ${stock[0]?.name || 'unknown item'}. Available: ${stock[0]?.quantity || 0}` 
                });
            }
        }

        await connection.beginTransaction();

        const nameToSave = customer_name || 'Guest';

        const [orderResult] = await connection.execute(
            'INSERT INTO orders (cashier_id, total_amount, status, payment_status, customer_name) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, total_amount, 'pending', 'pending', nameToSave]
        );
        const orderId = orderResult.insertId;

        for (const item of items) {
            // 1. Record Order Item
            await connection.execute(
                'INSERT INTO order_items (order_id, item_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.id, item.quantity, item.selling_price, item.quantity * item.selling_price]
            );

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

        await connection.commit();
        res.status(201).json({ success: true, orderId, message: 'Order created successfully' });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
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
        const [order] = await db.execute('SELECT * FROM orders WHERE id = ?', [id]);
        if (order.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

        const [items] = await db.execute(`
            SELECT oi.*, i.name 
            FROM order_items oi 
            JOIN inventory i ON oi.item_id = i.id 
            WHERE oi.order_id = ?
        `, [id]);

        res.json({ success: true, data: { ...order[0], items } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { status, payment_status } = req.body;
    try {
        await db.execute('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?', [status, payment_status, id]);
        res.json({ success: true, message: 'Order status updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
