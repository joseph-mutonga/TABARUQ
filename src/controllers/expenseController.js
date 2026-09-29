const db = require('../config/db');

exports.getExpenses = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT e.*, u.username as creator_name 
            FROM expenses e 
            LEFT JOIN users u ON e.created_by = u.id 
            ORDER BY e.expense_date DESC, e.id DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getExpenses error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.addExpense = async (req, res) => {
    const { description, category, amount, expense_date } = req.body;
    try {
        if (!description || typeof description !== 'string' || !description.trim()) {
            return res.status(400).json({ success: false, message: 'Expense description is required' });
        }
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid expense amount greater than zero is required' });
        }

        const dateVal = expense_date && !isNaN(Date.parse(expense_date))
            ? expense_date
            : new Date().toISOString().split('T')[0];
        const categoryVal = (category && String(category).trim()) || 'Other';

        const [result] = await db.execute(
            'INSERT INTO expenses (description, category, amount, expense_date, created_by) VALUES (?, ?, ?, ?, ?)',
            [description.trim(), categoryVal, parsedAmount, dateVal, req.user.id]
        );

        const io = req.app.get('io');
        if (io) io.emit('expense_update');

        res.status(201).json({ success: true, message: 'Expense recorded successfully', id: result.insertId });
    } catch (err) {
        console.error('addExpense error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteExpense = async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM expenses WHERE id = ?', [id]);
        const io = req.app.get('io');
        if (io) io.emit('expense_update');
        res.json({ success: true, message: 'Expense deleted' });
    } catch (err) {
        console.error('deleteExpense error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getExpenseStats = async (req, res) => {
    try {
        const [stats] = await db.execute(`
            SELECT 
                SUM(CASE WHEN DATE(expense_date) = CURDATE() THEN amount ELSE 0 END) as today,
                SUM(CASE WHEN YEARWEEK(expense_date, 1) = YEARWEEK(CURDATE(), 1) THEN amount ELSE 0 END) as week,
                SUM(CASE WHEN MONTH(expense_date) = MONTH(CURDATE()) AND YEAR(expense_date) = YEAR(CURDATE()) THEN amount ELSE 0 END) as month,
                SUM(CASE WHEN YEAR(expense_date) = YEAR(CURDATE()) THEN amount ELSE 0 END) as year
            FROM expenses
        `);
        res.json({ success: true, data: stats[0] || { today: 0, week: 0, month: 0, year: 0 } });
    } catch (err) {
        console.error('getExpenseStats error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
