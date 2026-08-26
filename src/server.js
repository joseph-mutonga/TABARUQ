const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const db = require('./config/db');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// Attach io to app to be accessible in routes/controllers
app.set('io', io);

// Start Background Job to automatically release scheduled orders when preparation is due (30 minutes prep window)
function startScheduledOrderReleaseJob(io) {
    setInterval(async () => {
        try {
            // Find orders where scheduled_released = 0 and scheduled_for <= NOW() + 30 minutes
            const [rows] = await db.execute(`
                SELECT * FROM orders 
                WHERE scheduled_released = 0 
                  AND status != 'cancelled' 
                  AND status != 'merged'
                  AND scheduled_for IS NOT NULL 
                  AND scheduled_for <= DATE_ADD(NOW(), INTERVAL 30 MINUTE)
            `);

            if (rows.length === 0) return;

            console.log(`[Scheduler] Found ${rows.length} scheduled order(s) due for release.`);

            for (const order of rows) {
                // Update order to released
                await db.execute(
                    'UPDATE orders SET scheduled_released = 1, scheduled_for = CURRENT_TIMESTAMP WHERE id = ?',
                    [order.id]
                );

                // Fetch items to emit to kitchen if platform is set
                const [items] = await db.execute(`
                    SELECT oi.*, COALESCE(i.name, oi.item_name) as name 
                    FROM order_items oi 
                    LEFT JOIN inventory i ON oi.item_id = i.id 
                    WHERE oi.order_id = ?
                `, [order.id]);

                // Emit to cashier order updates
                io.emit('order_update', { type: 'status', orderId: order.id, status: order.status, payment_status: order.payment_status });

                if (order.platform) {
                    const formattedItems = items.map(item => ({
                        name: item.name || item.item_name || 'Item',
                        quantity: item.quantity,
                        price: Number(item.price) || 0
                    }));

                    io.emit('new_delivery_order', {
                        id: order.id,
                        platform: order.platform,
                        platform_order_id: order.platform_order_id || `#${order.id}`,
                        customer_name: order.customer_name,
                        items: formattedItems,
                        total: Number(order.total_amount),
                        status: order.status
                    });
                }
                console.log(`[Scheduler] Released order #${order.id} to the kitchen.`);
            }
        } catch (err) {
            console.error('[Scheduler] Error in scheduled release tick:', err);
        }
    }, 60000); // Check every 60 seconds
    console.log('[Scheduler] Background scheduled order release job started (60s tick).');
}

startScheduledOrderReleaseJob(io);

server.listen(PORT, () => {
    console.log(`Server running on port http://localhost:${PORT}`);
});
