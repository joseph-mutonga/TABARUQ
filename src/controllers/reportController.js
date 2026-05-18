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
            SELECT DATE(o.created_at) as date, u.username as cashier_name, SUM(o.total_amount) as total_sales, COUNT(*) as order_count
            FROM orders o
            JOIN users u ON o.cashier_id = u.id
            WHERE o.payment_status = 'paid' AND o.created_at BETWEEN ? AND ?
            GROUP BY DATE(o.created_at), o.cashier_id
            ORDER BY date DESC, total_sales DESC
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
        const [payroll] = await db.execute('SELECT SUM(amount) as total FROM worker_payments WHERE payment_date BETWEEN ? AND ?', [startDate, endDate]);
        
        const totalSales = Number(sales[0].total) || 0;
        const totalGeneralExpenses = Number(expenses[0].total) || 0;
        const totalPayroll = Number(payroll[0].total) || 0;
        
        const totalExpenses = totalGeneralExpenses + totalPayroll;
        const netProfit = totalSales - totalExpenses;

        res.json({
            success: true,
            data: {
                totalSales,
                totalExpenses,
                totalPayroll,
                totalGeneralExpenses,
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
            SELECT o.*, o.customer_name, u.username as cashier_name, p.methods as payment_method, p.receipts as transaction_id,
                   (SELECT GROUP_CONCAT(CONCAT(oi.quantity, 'x ', i.name) SEPARATOR ', ') 
                    FROM order_items oi 
                    JOIN inventory i ON oi.item_id = i.id 
                    WHERE oi.order_id = o.id) as items_list
            FROM orders o
            JOIN users u ON o.cashier_id = u.id
            LEFT JOIN (
                SELECT order_id, 
                       GROUP_CONCAT(DISTINCT payment_method SEPARATOR ', ') as methods,
                       GROUP_CONCAT(DISTINCT transaction_id SEPARATOR ', ') as receipts
                FROM payments 
                WHERE status = 'confirmed'
                GROUP BY order_id
            ) p ON o.id = p.order_id
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
