const db = require('../config/db');

exports.getExpenses = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT e.*, u.username as creator_name 
            FROM expenses e 
            JOIN users u ON e.created_by = u.id 
            ORDER BY e.expense_date DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.addExpense = async (req, res) => {
    const { description, category, amount, expense_date } = req.body;
    try {
        await db.execute(
            'INSERT INTO expenses (description, category, amount, expense_date, created_by) VALUES (?, ?, ?, ?, ?)',
            [description, category, amount, expense_date, req.user.id]
        );

        const io = req.app.get('io');
        if (io) io.emit('expense_update');

        res.status(201).json({ success: true, message: 'Expense recorded' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteExpense = async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM expenses WHERE id = ?', [id]);
        res.json({ success: true, message: 'Expense deleted' });
    } catch (err) {
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
        res.json({ success: true, data: stats[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
