const db = require('../config/db');
const net = require('net');

exports.getReceiptSettings = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM receipt_settings WHERE id = 1');
        if (rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    hotel_name: 'TABARUQ FOODS',
                    phone_number: '',
                    address: '',
                    mpesa_paybill: '600000',
                    mpesa_till: '174379',
                    footer_message: 'Thank you for dining with us!',
                    printer_ip: '',
                    printer_port: 9100
                }
            });
        }
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.saveReceiptSettings = async (req, res) => {
    const { hotel_name, phone_number, address, mpesa_paybill, mpesa_till, footer_message, printer_ip, printer_port } = req.body;
    
    if (!hotel_name || !hotel_name.trim()) {
        return res.status(400).json({ success: false, message: 'Hotel name is required' });
    }

    try {
        await db.execute(`
            INSERT INTO receipt_settings (id, hotel_name, phone_number, address, mpesa_paybill, mpesa_till, footer_message, printer_ip, printer_port)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                hotel_name = VALUES(hotel_name),
                phone_number = VALUES(phone_number),
                address = VALUES(address),
                mpesa_paybill = VALUES(mpesa_paybill),
                mpesa_till = VALUES(mpesa_till),
                footer_message = VALUES(footer_message),
                printer_ip = VALUES(printer_ip),
                printer_port = VALUES(printer_port)
        `, [
            hotel_name.trim(),
            phone_number ? phone_number.trim() : null,
            address ? address.trim() : null,
            mpesa_paybill ? mpesa_paybill.trim() : null,
            mpesa_till ? mpesa_till.trim() : null,
            footer_message ? footer_message.trim() : null,
            printer_ip ? printer_ip.trim() : null,
            printer_port ? parseInt(printer_port) : 9100
        ]);

        res.json({ success: true, message: 'Receipt settings saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.openCashDrawer = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT printer_ip, printer_port FROM receipt_settings WHERE id = 1');
        const settings = rows[0];

        if (!settings || !settings.printer_ip) {
            return res.status(400).json({ success: false, message: 'Printer IP not configured in settings.' });
        }

        const ip = settings.printer_ip;
        const port = settings.printer_port || 9100;

        // ESC/POS cash drawer open command: ESC p m t1 t2
        // ESC=0x1B, p=0x70, pin2=0x00, on-time=0x19 (25ms), off-time=0xFA (250ms)
        const drawerCmd = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);

        await new Promise((resolve, reject) => {
            const client = new net.Socket();
            client.setTimeout(3000);
            client.connect(port, ip, () => {
                client.write(drawerCmd, () => {
                    client.destroy();
                    resolve();
                });
            });
            client.on('error', reject);
            client.on('timeout', () => { client.destroy(); reject(new Error('Printer connection timed out')); });
        });

        res.json({ success: true, message: 'Cash drawer opened.' });
    } catch (err) {
        console.error('Cash drawer error:', err.message);
        res.status(500).json({ success: false, message: 'Could not open cash drawer: ' + err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// STOCK DEDUCTION RULES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/settings/deduction-rules
 * Returns all deduction rules with menu item & stock item names.
 */
exports.getDeductionRules = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                sdr.id,
                sdr.menu_item_id,
                m.name  AS menu_item_name,
                m.unit  AS menu_item_unit,
                sdr.stock_item_id,
                s.name  AS stock_item_name,
                s.unit  AS stock_item_unit,
                sdr.deduct_qty
            FROM stock_deduction_rules sdr
            JOIN inventory m ON m.id = sdr.menu_item_id
            JOIN inventory s ON s.id = sdr.stock_item_id
            ORDER BY m.name, s.name
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * POST /api/settings/deduction-rules
 * Body: { menu_item_id, stock_item_id, deduct_qty }
 * Creates or updates a deduction rule (upsert on the unique key).
 */
exports.saveDeductionRule = async (req, res) => {
    const { menu_item_id, stock_item_id, deduct_qty } = req.body;

    if (!menu_item_id || !stock_item_id || !deduct_qty) {
        return res.status(400).json({ success: false, message: 'menu_item_id, stock_item_id and deduct_qty are required' });
    }
    if (Number(deduct_qty) <= 0) {
        return res.status(400).json({ success: false, message: 'deduct_qty must be greater than 0' });
    }
    if (Number(menu_item_id) === Number(stock_item_id)) {
        return res.status(400).json({ success: false, message: 'Menu item and stock item cannot be the same' });
    }

    try {
        await db.execute(`
            INSERT INTO stock_deduction_rules (menu_item_id, stock_item_id, deduct_qty)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE deduct_qty = VALUES(deduct_qty)
        `, [menu_item_id, stock_item_id, deduct_qty]);

        res.json({ success: true, message: 'Deduction rule saved' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * DELETE /api/settings/deduction-rules/:id
 */
exports.deleteDeductionRule = async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM stock_deduction_rules WHERE id = ?', [id]);
        res.json({ success: true, message: 'Deduction rule deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// COMBO / BUNDLE RECIPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/settings/recipes
 * Returns all recipes grouped by combo item.
 */
exports.getRecipes = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                ir.id,
                ir.combo_item_id,
                c.name  AS combo_item_name,
                ir.component_item_id,
                p.name  AS component_item_name,
                p.unit  AS component_unit,
                ir.component_qty
            FROM item_recipes ir
            JOIN inventory c ON c.id = ir.combo_item_id
            JOIN inventory p ON p.id = ir.component_item_id
            ORDER BY c.name, p.name
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * POST /api/settings/recipes
 * Replaces all recipe components for a combo item.
 * Body: { combo_item_id, components: [{ component_item_id, component_qty }] }
 */
exports.saveRecipe = async (req, res) => {
    const { combo_item_id, combo_name, selling_price, components } = req.body;

    if ((!combo_item_id && (typeof combo_name !== 'string' || !combo_name.trim())) || !Array.isArray(components) || components.length === 0) {
        return res.status(400).json({ success: false, message: 'A combo name or item and at least one component are required' });
    }
    if (!combo_item_id && (selling_price === undefined || !Number.isFinite(Number(selling_price)) || Number(selling_price) < 0)) {
        return res.status(400).json({ success: false, message: 'A combo name and valid selling price are required' });
    }

    // Validate components
    for (const c of components) {
        if (!c.component_item_id || !c.component_qty || Number(c.component_qty) <= 0) {
            return res.status(400).json({ success: false, message: 'Each component must have a valid item and quantity > 0' });
        }
        if (Number(c.component_item_id) === Number(combo_item_id)) {
            return res.status(400).json({ success: false, message: 'A combo cannot have itself as a component' });
        }
    }

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        let comboItemId = combo_item_id;
        if (!comboItemId) {
            const [itemResult] = await conn.execute(
                `INSERT INTO inventory
                    (name, category, cost_price, selling_price, unit, quantity, item_type, low_stock_threshold)
                 VALUES (?, 'Food', 0, ?, 'pcs', 0, 'saleable', 0)`,
                [combo_name.trim(), Number(selling_price)]
            );
            comboItemId = itemResult.insertId;
        }

        // Delete all existing recipe rows for this combo
        await conn.execute('DELETE FROM item_recipes WHERE combo_item_id = ?', [comboItemId]);

        // Insert new components
        for (const c of components) {
            await conn.execute(
                'INSERT INTO item_recipes (combo_item_id, component_item_id, component_qty) VALUES (?, ?, ?)',
                [comboItemId, c.component_item_id, c.component_qty]
            );
        }

        await conn.commit();
        res.json({ success: true, combo_item_id: comboItemId, message: 'Recipe saved successfully' });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
};

/**
 * DELETE /api/settings/recipes/:combo_item_id
 * Deletes all recipe components for a given combo item.
 */
exports.deleteRecipe = async (req, res) => {
    const { combo_item_id } = req.params;
    try {
        await db.execute('DELETE FROM item_recipes WHERE combo_item_id = ?', [combo_item_id]);
        res.json({ success: true, message: 'Recipe deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
