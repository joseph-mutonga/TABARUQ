const db = require('../config/db');

async function getOpenShift(cashierId, executor = db) {
    const [rows] = await executor.execute(
        "SELECT * FROM shifts WHERE cashier_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1",
        [cashierId]
    );
    return rows[0] || null;
}

function normalizePeriod(value) {
    const period = String(value || '').toLowerCase();
    return period === 'evening' ? 'evening' : period === 'morning' ? 'morning' : null;
}

exports.getCurrent = async (req, res) => {
    try {
        res.json({ success: true, data: await getOpenShift(req.user.id) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.start = async (req, res) => {
    const { shift_name, shift_period, opening_cash } = req.body;
    const period = normalizePeriod(shift_period);
    if (!period) return res.status(400).json({ success: false, message: 'Choose a morning or evening shift' });
    const openingCash = Number(opening_cash || 0);
    if (!Number.isFinite(openingCash) || openingCash < 0) {
        return res.status(400).json({ success: false, message: 'Opening cash must be zero or more' });
    }
    try {
        if (await getOpenShift(req.user.id)) {
            return res.status(409).json({ success: false, message: 'You already have an open shift' });
        }
        const [result] = await db.execute(
            "INSERT INTO shifts (cashier_id, shift_name, shift_period, opening_cash) VALUES (?, ?, ?, ?)",
            [req.user.id, String(shift_name || period).slice(0, 50), period, openingCash]
        );
        const [rows] = await db.execute('SELECT * FROM shifts WHERE id = ?', [result.insertId]);
        res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not start shift' });
    }
};

exports.adminStart = async (req, res) => {
    const { cashier_id, shift_period, opening_cash } = req.body;
    const period = normalizePeriod(shift_period);
    const openingCash = Number(opening_cash || 0);
    if (!cashier_id || !period || !Number.isFinite(openingCash) || openingCash < 0) {
        return res.status(400).json({ success: false, message: 'Cashier, shift period, and valid opening cash are required' });
    }
    try {
        const [cashiers] = await db.execute("SELECT id FROM users WHERE id = ? AND role = 'cashier' AND is_active = 1", [cashier_id]);
        if (!cashiers.length) return res.status(404).json({ success: false, message: 'Active cashier not found' });
        if (await getOpenShift(cashier_id)) return res.status(409).json({ success: false, message: 'This cashier already has an open shift' });
        await db.execute("INSERT INTO shifts (cashier_id, shift_name, shift_period, opening_cash) VALUES (?, ?, ?, ?)", [cashier_id, period, period, openingCash]);
        res.status(201).json({ success: true, message: 'Cashier shift assigned' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not assign cashier shift' });
    }
};

exports.close = async (req, res) => {
    const { closing_cash, notes } = req.body;
    const closingCash = Number(closing_cash);
    if (!Number.isFinite(closingCash) || closingCash < 0) {
        return res.status(400).json({ success: false, message: 'Closing cash must be zero or more' });
    }
    try {
        const shift = await getOpenShift(req.user.id);
        if (!shift) return res.status(400).json({ success: false, message: 'No open shift to close' });
        await db.execute(
            "UPDATE shifts SET closing_cash = ?, notes = ?, ended_at = CURRENT_TIMESTAMP, status = 'closed' WHERE id = ? AND status = 'open'",
            [closingCash, notes ? String(notes).slice(0, 255) : null, shift.id]
        );
        res.json({ success: true, message: 'Shift closed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Could not close shift' });
    }
};

exports.getSummaries = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT s.id, s.shift_name, s.started_at, s.ended_at, s.status, s.opening_cash, s.closing_cash,
                   u.username AS cashier_name,
                   COALESCE(SUM(CASE WHEN p.payment_method = 'Cash' AND p.status = 'confirmed' THEN p.amount ELSE 0 END), 0) AS cash_taken,
                   COALESCE(SUM(CASE WHEN p.payment_method = 'Bank' AND p.status = 'confirmed' THEN p.amount ELSE 0 END), 0) AS bank_taken,
                   COALESCE(SUM(CASE WHEN p.payment_method LIKE 'M-Pesa%' AND p.status = 'confirmed' THEN p.amount ELSE 0 END), 0) AS mpesa_taken,
                   COUNT(DISTINCT CASE WHEN p.status = 'confirmed' THEN p.id END) AS payment_count
            FROM shifts s
            JOIN users u ON u.id = s.cashier_id
            LEFT JOIN payments p ON p.shift_id = s.id
            GROUP BY s.id
            ORDER BY s.started_at DESC
            LIMIT 200
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getOpenShift = getOpenShift;