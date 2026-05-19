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
    const { name, category, cost_price, selling_price, unit, quantity, item_type, uber_price, glovo_price, bolt_price, is_delivery, delivery_platform, low_stock_threshold } = req.body;
    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        const [result] = await conn.execute(
            'INSERT INTO inventory (name, category, cost_price, selling_price, unit, quantity, item_type, uber_price, glovo_price, bolt_price, is_delivery, delivery_platform, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, category, cost_price, selling_price || 0, unit || 'pcs', quantity || 0, item_type || 'saleable', uber_price || null, glovo_price || null, bolt_price || null, is_delivery || false, delivery_platform || null, low_stock_threshold || 10.00]
        );
        
        const itemId = result.insertId;
        const qtyVal = Number(quantity) || 0;
        const costVal = Number(cost_price) || 0;

        // Initial stock log
        await conn.execute('INSERT INTO stock_logs (item_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)',
            [itemId, req.user.id, qtyVal, 'Initial Stock']
        );

        // Record stock purchase expense if qty > 0 and cost > 0
        if (qtyVal > 0 && costVal > 0) {
            const totalCost = qtyVal * costVal;
            await conn.execute(
                'INSERT INTO expenses (description, category, amount, expense_date, created_by) VALUES (?, ?, ?, CURRENT_DATE(), ?)',
                [`Initial Stock Purchase - ${name}`, 'Stock', totalCost, req.user.id]
            );
        }

        await conn.commit();

        const io = req.app.get('io');
        if (io) {
            io.emit('stock_update', { items: [itemId] });
            io.emit('expense_update');
        }

        res.status(201).json({ success: true, message: 'Item added successfully' });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
};

exports.updateItem = async (req, res) => {
    const { id } = req.params;
    const { name, category, cost_price, selling_price, unit, item_type, uber_price, glovo_price, bolt_price, is_delivery, delivery_platform, low_stock_threshold } = req.body;
    try {
        await db.execute(
            'UPDATE inventory SET name=?, category=?, cost_price=?, selling_price=?, unit=?, item_type=?, uber_price=?, glovo_price=?, bolt_price=?, is_delivery=?, delivery_platform=?, low_stock_threshold=? WHERE id=?',
            [name, category, cost_price, selling_price, unit, item_type, uber_price, glovo_price, bolt_price, is_delivery, delivery_platform || null, low_stock_threshold || 10.00, id]
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
    let conn;
    try {
        const qtyNum = parseFloat(quantity);
        if (isNaN(qtyNum) || qtyNum <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid quantity' });
        }

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [itemRows] = await conn.execute('SELECT name, cost_price, unit FROM inventory WHERE id = ? FOR UPDATE', [id]);
        if (itemRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Item not found' });
        }
        const item = itemRows[0];

        await conn.execute(
            'UPDATE inventory SET quantity = quantity + ? WHERE id = ?',
            [qtyNum, id]
        );
        
        await conn.execute(
            'INSERT INTO stock_logs (item_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)',
            [id, req.user.id, qtyNum, reason || 'Restock']
        );

        const costVal = Number(item.cost_price) || 0;
        if (costVal > 0) {
            const totalCost = qtyNum * costVal;
            await conn.execute(
                'INSERT INTO expenses (description, category, amount, expense_date, created_by) VALUES (?, ?, ?, CURRENT_DATE(), ?)',
                [`Stock Restock - ${item.name} (${qtyNum} ${item.unit || 'pcs'})`, 'Stock', totalCost, req.user.id]
            );
        }

        await conn.commit();

        const io = req.app.get('io');
        if (io) {
            io.emit('stock_update', { items: [id] });
            io.emit('expense_update');
        }

        res.json({ success: true, message: 'Stock updated successfully' });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
};

exports.recordUsage = async (req, res) => {
    const { id } = req.params;
    const { quantity, reason } = req.body;
    try {
        const qtyNum = parseFloat(quantity);
        if (isNaN(qtyNum) || qtyNum <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid quantity' });
        }

        const [rows] = await db.execute('SELECT quantity, name, unit FROM inventory WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }
        
        const currentQty = Number(rows[0].quantity);
        if (currentQty < qtyNum) {
            return res.status(400).json({ success: false, message: `Insufficient stock. Current stock is ${currentQty} ${rows[0].unit || ''}` });
        }
        
        await db.execute(
            'UPDATE inventory SET quantity = quantity - ? WHERE id = ?',
            [qtyNum, id]
        );
        
        await db.execute(
            'INSERT INTO stock_logs (item_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)',
            [id, req.user.id, -qtyNum, reason || 'Used in Hotel']
        );

        const io = req.app.get('io');
        if (io) io.emit('stock_update', { items: [id] });

        res.json({ success: true, message: 'Usage recorded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


