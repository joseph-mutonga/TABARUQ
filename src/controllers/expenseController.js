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
