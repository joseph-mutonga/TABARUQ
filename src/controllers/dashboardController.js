const db = require('../config/db');

exports.getStats = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const [sales] = await db.execute('SELECT SUM(total_amount) as total FROM orders WHERE payment_status = "paid" AND DATE(created_at) = ?', [today]);
        const [expenses] = await db.execute('SELECT SUM(amount) as total FROM expenses WHERE expense_date = ?', [today]);

        const [recentOrders] = await db.execute(`
            SELECT o.*, o.customer_name, u.username as cashier_name, p.payment_method 
            FROM orders o 
            JOIN users u ON o.cashier_id = u.id 
            LEFT JOIN (SELECT order_id, MIN(payment_method) as payment_method FROM payments GROUP BY order_id) p ON o.id = p.order_id
            ORDER BY o.created_at DESC LIMIT 5
        `);

        res.json({
            success: true,
            data: {
                todaySales: sales[0].total || 0,
                todayExpenses: expenses[0].total || 0,

                recentOrders
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
