const db = require('../config/db');

const ALLOWED_PLATFORMS = ['Uber Eats', 'Glovo', 'Bolt Food', 'Tabaruq Delivery'];

function validateRulePayload(body) {
    const { name, platform, item_id, discount_type, discount_value, days_of_week, start_time, end_time } = body;

    if (!name || !String(name).trim()) {
        return { error: 'Rule name is required' };
    }
    if (platform != null && platform !== '' && !ALLOWED_PLATFORMS.includes(platform)) {
        return { error: 'Invalid platform' };
    }
    if (!['percentage', 'fixed'].includes(discount_type)) {
        return { error: 'Discount type must be percentage or fixed' };
    }
    const value = Number(discount_value);
    if (!Number.isFinite(value) || value <= 0) {
        return { error: 'Discount value must be greater than zero' };
    }
    if (discount_type === 'percentage' && value > 100) {
        return { error: 'Percentage discount cannot exceed 100%' };
    }
    let daysCsv = null;
    if (Array.isArray(days_of_week) && days_of_week.length > 0) {
        const days = days_of_week.map((d) => Number(d));
        if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
            return { error: 'Invalid day of week' };
        }
        daysCsv = [...new Set(days)].sort().join(',');
    }
    let startTime = start_time || null;
    let endTime = end_time || null;
    if ((startTime && !endTime) || (!startTime && endTime)) {
        return { error: 'Both a start time and an end time are required for a time-of-day discount' };
    }

    return {
        name: String(name).trim().substring(0, 150),
        platform: platform || null,
        item_id: item_id ? Number(item_id) : null,
        discount_type,
        discount_value: value,
        days_of_week: daysCsv,
        start_time: startTime,
        end_time: endTime
    };
}

// ── List all discount rules (with item name / platform for display) ──────────
exports.getDiscountRules = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT dr.*, i.name AS item_name, u.username AS created_by_name
            FROM discount_rules dr
            LEFT JOIN inventory i ON dr.item_id = i.id
            LEFT JOIN users u ON dr.created_by = u.id
            ORDER BY dr.created_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getDiscountRules error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── Lightweight preview of active rules for the POS/selling screens ──────────
// Cashiers need to know "does this item have a discount right now?" while selling,
// without exposing the full admin management data (created_by, timestamps, etc.).
exports.getActiveDiscountRulesPreview = async (req, res) => {
    try {
        const [settingsRows] = await db.execute('SELECT * FROM discount_settings WHERE id = 1');
        const settings = settingsRows[0] || { enabled: 1, max_percentage: 100 };
        if (!settings.enabled) {
            return res.json({ success: true, data: [], maxPercentage: Number(settings.max_percentage) || 100 });
        }

        const [rows] = await db.execute(`
            SELECT dr.id, dr.name, dr.platform, dr.item_id, i.name AS item_name,
                   dr.discount_type, dr.discount_value, dr.days_of_week, dr.start_time, dr.end_time
            FROM discount_rules dr
            LEFT JOIN inventory i ON dr.item_id = i.id
            WHERE dr.is_active = 1
        `);
        res.json({ success: true, data: rows, maxPercentage: Number(settings.max_percentage) || 100 });
    } catch (err) {
        console.error('getActiveDiscountRulesPreview error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── Create a new discount rule ────────────────────────────────────────────────
exports.createDiscountRule = async (req, res) => {
    const parsed = validateRulePayload(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

    try {
        if (parsed.item_id) {
            const [items] = await db.execute('SELECT id FROM inventory WHERE id = ?', [parsed.item_id]);
            if (items.length === 0) return res.status(400).json({ success: false, message: 'Selected food item does not exist' });
        }

        const [result] = await db.execute(
            `INSERT INTO discount_rules (name, platform, item_id, discount_type, discount_value, days_of_week, start_time, end_time, is_active, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [parsed.name, parsed.platform, parsed.item_id, parsed.discount_type, parsed.discount_value, parsed.days_of_week, parsed.start_time, parsed.end_time, req.user.id]
        );

        await db.execute(
            'INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, 'Created discount rule', `Rule "${parsed.name}" (#${result.insertId}) created`]
        );

        res.status(201).json({ success: true, message: 'Discount rule created', data: { id: result.insertId } });
    } catch (err) {
        console.error('createDiscountRule error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── Update an existing discount rule ──────────────────────────────────────────
exports.updateDiscountRule = async (req, res) => {
    const { id } = req.params;
    const parsed = validateRulePayload(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

    try {
        const [existingRows] = await db.execute('SELECT id FROM discount_rules WHERE id = ?', [id]);
        if (existingRows.length === 0) return res.status(404).json({ success: false, message: 'Discount rule not found' });

        if (parsed.item_id) {
            const [items] = await db.execute('SELECT id FROM inventory WHERE id = ?', [parsed.item_id]);
            if (items.length === 0) return res.status(400).json({ success: false, message: 'Selected food item does not exist' });
        }

        await db.execute(
            `UPDATE discount_rules SET
                name = ?, platform = ?, item_id = ?, discount_type = ?, discount_value = ?,
                days_of_week = ?, start_time = ?, end_time = ?
             WHERE id = ?`,
            [parsed.name, parsed.platform, parsed.item_id, parsed.discount_type, parsed.discount_value, parsed.days_of_week, parsed.start_time, parsed.end_time, id]
        );

        await db.execute(
            'INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, 'Updated discount rule', `Rule #${id} updated to "${parsed.name}"`]
        );

        res.json({ success: true, message: 'Discount rule updated' });
    } catch (err) {
        console.error('updateDiscountRule error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── Toggle a rule's active state ──────────────────────────────────────────────
exports.toggleDiscountRule = async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;
    try {
        const [result] = await db.execute('UPDATE discount_rules SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Discount rule not found' });

        await db.execute(
            'INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, is_active ? 'Enabled discount rule' : 'Disabled discount rule', `Rule #${id}`]
        );

        res.json({ success: true, message: `Discount rule ${is_active ? 'enabled' : 'disabled'}` });
    } catch (err) {
        console.error('toggleDiscountRule error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ── Delete a discount rule ─────────────────────────────────────────────────────
exports.deleteDiscountRule = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.execute('DELETE FROM discount_rules WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Discount rule not found' });

        await db.execute(
            'INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)',
            [req.user.id, 'Deleted discount rule', `Rule #${id} deleted`]
        );

        res.json({ success: true, message: 'Discount rule deleted' });
    } catch (err) {
        console.error('deleteDiscountRule error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
