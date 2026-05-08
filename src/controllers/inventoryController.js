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
    const { name, category, cost_price, selling_price, unit, quantity } = req.body;
    try {
        const [result] = await db.execute(
            'INSERT INTO inventory (name, category, cost_price, selling_price, unit, quantity) VALUES (?, ?, ?, ?, ?, ?)',
            [name, category, cost_price, selling_price, unit || 'pcs', quantity || 0]
        );
        
        // Initial stock log
        await db.execute('INSERT INTO stock_logs (item_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)',
            [result.insertId, req.user.id, quantity || 0, 'Initial Stock']
        );

        res.status(201).json({ success: true, message: 'Item added successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateItem = async (req, res) => {
    const { id } = req.params;
    const { name, category, cost_price, selling_price, unit } = req.body;
    try {
        await db.execute(
            'UPDATE inventory SET name=?, category=?, cost_price=?, selling_price=?, unit=? WHERE id=?',
            [name, category, cost_price, selling_price, unit, id]
        );
        res.json({ success: true, message: 'Item updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteItem = async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM inventory WHERE id = ?', [id]);
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

        res.json({ success: true, message: 'Stock updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


