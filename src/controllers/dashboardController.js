const db = require('../config/db');

exports.getStats = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const [[sales]] = await db.execute('SELECT SUM(total_amount) as total FROM orders WHERE payment_status = "paid" AND DATE(created_at) = ?', [today]);
        const [[expenses]] = await db.execute('SELECT SUM(amount) as total FROM expenses WHERE expense_date = ?', [today]);
        const [[users]] = await db.execute('SELECT COUNT(*) as total FROM users');
        const [[pendingPayments]] = await db.execute('SELECT COUNT(*) as total FROM payments WHERE status = "pending"');
        const [[dueInvoices]] = await db.execute('SELECT COUNT(*) as total FROM orders WHERE payment_status != "paid"');
        const [[itemsCount]] = await db.execute('SELECT COUNT(*) as total FROM inventory');
        const [[lowStock]] = await db.execute(`
            SELECT COUNT(*) as total 
            FROM inventory 
            WHERE quantity <= low_stock_threshold 
              AND (
                LOWER(category) LIKE "%drink%" OR 
                LOWER(category) LIKE "%juice%" OR 
                LOWER(category) LIKE "%beer%" OR 
                LOWER(category) LIKE "%wine%" OR 
                LOWER(category) LIKE "%cocktail%" OR 
                LOWER(category) LIKE "%spirit%" OR 
                LOWER(category) LIKE "%beverage%" OR 
                LOWER(category) LIKE "%soda%" OR 
                LOWER(category) LIKE "%shake%" OR 
                item_type = "ingredient"
              )
        `);
        const [[storesCount]] = await db.execute('SELECT COUNT(DISTINCT supplier) as total FROM inventory WHERE supplier IS NOT NULL AND supplier != ""');
        const [[supplierValue]] = await db.execute('SELECT SUM(cost_price * quantity) as total FROM inventory');
        const [topProducts] = await db.execute(`
            SELECT COALESCE(oi.item_name, i.name, 'Unknown Item') as name, SUM(oi.quantity) as sold, SUM(oi.subtotal) as revenue
            FROM order_items oi
            LEFT JOIN inventory i ON oi.item_id = i.id
            GROUP BY COALESCE(oi.item_name, i.name, 'Unknown Item')
            ORDER BY sold DESC
            LIMIT 4
        `);
        const [[cashSales]] = await db.execute('SELECT SUM(amount) as total FROM payments WHERE payment_method = "Cash" AND status = "confirmed" AND YEAR(confirmed_at) = YEAR(CURDATE())');
        const [[mpesaSales]] = await db.execute('SELECT SUM(amount) as total FROM payments WHERE payment_method LIKE "%M-Pesa%" AND status = "confirmed" AND YEAR(confirmed_at) = YEAR(CURDATE())');
        const [[yearlyExpenses]] = await db.execute('SELECT SUM(amount) as total FROM expenses WHERE YEAR(expense_date) = YEAR(CURDATE())');

        const [recentOrders] = await db.execute(`
            SELECT o.*, o.customer_name, COALESCE(u.username, o.platform, 'Delivery') as cashier_name, p.methods as payment_method 
            FROM orders o 
            LEFT JOIN users u ON o.cashier_id = u.id 
            LEFT JOIN (
                SELECT order_id, GROUP_CONCAT(DISTINCT payment_method SEPARATOR ', ') as methods 
                FROM payments 
                WHERE status = 'confirmed'
                GROUP BY order_id
            ) p ON o.id = p.order_id
            WHERE o.platform IS NULL
            ORDER BY o.created_at DESC LIMIT 5
        `);

        res.json({
            success: true,
            data: {
                todaySales: sales.total || 0,
                todayExpenses: expenses.total || 0,
                allUsers: users.total || 0,
                smsOutbox: pendingPayments.total || 0,
                supplierBalances: supplierValue.total || 0,
                stores: storesCount.total || 0,
                dueInvoices: dueInvoices.total || 0,
                itemsCount: itemsCount.total || 0,
                itemsNeedsRestocking: lowStock.total || 0,
                openSales: dueInvoices.total || 0,
                topProducts,
                accountReport: [
                    {
                        account: 'Petty Cash',
                        code: '87328',
                        in: cashSales.total || 0,
                        out: yearlyExpenses.total || 0,
                        bal: (cashSales.total || 0) - (yearlyExpenses.total || 0)
                    },
                    {
                        account: 'Paybill 522123',
                        code: '522123',
                        in: mpesaSales.total || 0,
                        out: 0,
                        bal: mpesaSales.total || 0
                    },
                    { account: 'KCB', code: '1181575397', in: 0, out: 0, bal: 0 },
                    { account: 'Sasa', code: '000002', in: 0, out: 0, bal: 0 }
                ],
                recentOrders
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
