const db = require('../config/db');

exports.getSalesReport = async (req, res) => {
    let { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
    }
    try {
        const [rows] = await db.execute(`
            SELECT DATE(created_at) as date, SUM(total_amount) as total_sales, COUNT(*) as order_count
            FROM orders
            WHERE payment_status = 'paid' AND created_at BETWEEN ? AND ?
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `, [`${startDate} 00:00:00`, `${endDate} 23:59:59`]);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getSalesReport Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getInventoryReport = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT name, quantity, unit, cost_price, selling_price, (quantity * cost_price) as stock_value FROM inventory');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getProfitLossReport = async (req, res) => {
    let { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
    }
    try {
        const [sales] = await db.execute('SELECT SUM(total_amount) as total FROM orders WHERE payment_status = "paid" AND created_at BETWEEN ? AND ?', [`${startDate} 00:00:00`, `${endDate} 23:59:59`]);
        const [expenses] = await db.execute('SELECT SUM(amount) as total FROM expenses WHERE expense_date BETWEEN ? AND ?', [startDate, endDate]);
        
        const totalSales = sales[0].total || 0;
        const totalExpenses = expenses[0].total || 0;
        const netProfit = totalSales - totalExpenses;

        res.json({
            success: true,
            data: {
                totalSales,
                totalExpenses,
                netProfit
            }
        });
    } catch (err) {
        console.error('getProfitLossReport Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getTransactionHistory = async (req, res) => {
    let { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
    }
    try {
        const [rows] = await db.execute(`
            SELECT o.*, o.customer_name, u.username as cashier_name, p.payment_method, p.transaction_id
            FROM orders o
            JOIN users u ON o.cashier_id = u.id
            LEFT JOIN (SELECT order_id, MIN(payment_method) as payment_method, MIN(transaction_id) as transaction_id FROM payments GROUP BY order_id) p ON o.id = p.order_id
            WHERE o.created_at BETWEEN ? AND ?
            ORDER BY o.created_at DESC
        `, [`${startDate} 00:00:00`, `${endDate} 23:59:59`]);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getTransactionHistory Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getPopularItems = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT i.name, SUM(oi.quantity) as total_sold, i.unit, SUM(oi.subtotal) as total_revenue
            FROM order_items oi
            JOIN inventory i ON oi.item_id = i.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.payment_status = 'paid'
            GROUP BY i.id
            ORDER BY total_sold DESC
            LIMIT 10
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
