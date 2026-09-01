const db = require('../config/db');

exports.getItems = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM inventory');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getStockFlow = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT sl.id, sl.item_id, i.name AS item_name, i.unit,
                   sl.change_amount, sl.reason, sl.created_at,
                   u.username AS user_name
            FROM stock_logs sl
            LEFT JOIN inventory i ON i.id = sl.item_id
            LEFT JOIN users u ON u.id = sl.user_id
            ORDER BY sl.created_at DESC
            LIMIT 40
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getStockFlow Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.recordProduction = async (req, res) => {
    const { item_id, item_name, quantity, unit, notes } = req.body;
    const qty = Number(quantity);

    if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ success: false, message: 'Production quantity must be greater than zero.' });
    }

    const selectedItemId = item_id ? Number(item_id) : null;
    const resolvedName = (item_name || '').trim() || 'Produced Item';
    const resolvedUnit = unit || 'pcs';

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        let itemName = resolvedName;
        if (selectedItemId) {
            const [itemRows] = await conn.execute('SELECT id, name, unit FROM inventory WHERE id = ? FOR UPDATE', [selectedItemId]);
            if (itemRows.length === 0) {
                await conn.rollback();
                return res.status(404).json({ success: false, message: 'Selected item not found.' });
            }

            itemName = itemRows[0].name;
            await conn.execute('UPDATE inventory SET quantity = quantity + ? WHERE id = ?', [qty, selectedItemId]);
            await conn.execute(
                'INSERT INTO stock_logs (item_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)',
                [selectedItemId, req.user.id, qty, notes || 'Production']
            );
        }

        const [result] = await conn.execute(
            'INSERT INTO production_records (item_id, item_name, quantity, unit, production_date, recorded_by, notes) VALUES (?, ?, ?, ?, CURDATE(), ?, ?)',
            [selectedItemId, itemName, qty, resolvedUnit || itemName, req.user.id, notes || 'Production']
        );

        await conn.commit();

        const io = req.app.get('io');
        if (io) io.emit('stock_update', { items: selectedItemId ? [selectedItemId] : [] });

        res.status(201).json({
            success: true,
            message: 'Production recorded successfully.',
            data: {
                id: result.insertId,
                item_id: selectedItemId,
                item_name: itemName,
                quantity: qty,
                unit: resolvedUnit || 'pcs',
                recorded_by: req.user.id,
                notes: notes || 'Production'
            }
        });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
};

exports.getProductionRecords = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT pr.*, u.username AS recorded_by_name
            FROM production_records pr
            LEFT JOIN users u ON u.id = pr.recorded_by
            WHERE pr.production_date = CURDATE()
            ORDER BY pr.created_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getProductionRecords Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.addItem = async (req, res) => {
    const { name, category, cost_price, selling_price, unit, quantity, item_type, uber_price, glovo_price, bolt_price, own_delivery_price, is_delivery, delivery_platform, low_stock_threshold } = req.body;
    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        const [result] = await conn.execute(
            'INSERT INTO inventory (name, category, cost_price, selling_price, unit, quantity, item_type, uber_price, glovo_price, bolt_price, own_delivery_price, is_delivery, delivery_platform, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, category, cost_price, selling_price || 0, unit || 'pcs', quantity || 0, item_type || 'saleable', uber_price || null, glovo_price || null, bolt_price || null, own_delivery_price || null, is_delivery || false, delivery_platform || null, low_stock_threshold || 10.00]
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
    const { name, category, cost_price, selling_price, unit, item_type, uber_price, glovo_price, bolt_price, own_delivery_price, is_delivery, delivery_platform, low_stock_threshold } = req.body;
    try {
        await db.execute(
            'UPDATE inventory SET name=?, category=?, cost_price=?, selling_price=?, unit=?, item_type=?, uber_price=?, glovo_price=?, bolt_price=?, own_delivery_price=?, is_delivery=?, delivery_platform=?, low_stock_threshold=? WHERE id=?',
            [name, category, cost_price, selling_price, unit, item_type, uber_price, glovo_price, bolt_price, own_delivery_price, is_delivery, delivery_platform || null, low_stock_threshold || 10.00, id]
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

        res.json({ success: true, message: 'Outgoing food recorded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


