const db = require('../config/db');

exports.getItems = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM inventory');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.addItem = async (req, res) => {
    const { name, category, cost_price, selling_price, unit, quantity, item_type, uber_price, glovo_price, bolt_price, is_delivery, delivery_platform } = req.body;
    try {
        const [result] = await db.execute(
            'INSERT INTO inventory (name, category, cost_price, selling_price, unit, quantity, item_type, uber_price, glovo_price, bolt_price, is_delivery, delivery_platform) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, category, cost_price, selling_price || 0, unit || 'pcs', quantity || 0, item_type || 'saleable', uber_price || null, glovo_price || null, bolt_price || null, is_delivery || false, delivery_platform || null]
        );
        
        // Initial stock log
        await db.execute('INSERT INTO stock_logs (item_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)',
            [result.insertId, req.user.id, quantity || 0, 'Initial Stock']
        );

        const io = req.app.get('io');
        if (io) io.emit('stock_update', { items: [result.insertId] });

        res.status(201).json({ success: true, message: 'Item added successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateItem = async (req, res) => {
    const { id } = req.params;
    const { name, category, cost_price, selling_price, unit, item_type, uber_price, glovo_price, bolt_price, is_delivery, delivery_platform } = req.body;
    try {
        await db.execute(
            'UPDATE inventory SET name=?, category=?, cost_price=?, selling_price=?, unit=?, item_type=?, uber_price=?, glovo_price=?, bolt_price=?, is_delivery=?, delivery_platform=? WHERE id=?',
            [name, category, cost_price, selling_price, unit, item_type, uber_price, glovo_price, bolt_price, is_delivery, delivery_platform || null, id]
        );

        const io = req.app.get('io');
        if (io) io.emit('stock_update', { items: [id] });

        res.json({ success: true, message: 'Item updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteItem = async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM inventory WHERE id = ?', [id]);

        const io = req.app.get('io');
        if (io) io.emit('stock_update', { type: 'delete', items: [id] });

        res.json({ success: true, message: 'Item deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.restockItem = async (req, res) => {
    const { id } = req.params;
    const { quantity, reason } = req.body;
    try {
        await db.execute(
            'UPDATE inventory SET quantity = quantity + ? WHERE id = ?',
            [quantity, id]
        );
        
        await db.execute(
            'INSERT INTO stock_logs (item_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)',
            [id, req.user.id, quantity, reason || 'Restock']
        );

        const io = req.app.get('io');
        if (io) io.emit('stock_update', { items: [id] });

        res.json({ success: true, message: 'Stock updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


