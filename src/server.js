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

async function ensureSchemaCompatibility() {
    const migrations = [
        {
            table: 'users',
            column: 'is_active',
            query: 'ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1'
        },
        {
            table: 'settlements',
            column: 'attachment_name',
            query: 'ALTER TABLE settlements ADD COLUMN attachment_name VARCHAR(255) NULL'
        },
        {
            table: 'settlements',
            column: 'attachment_data',
            query: 'ALTER TABLE settlements ADD COLUMN attachment_data LONGTEXT NULL'
        }
    ];

    const productionTableSql = `
        CREATE TABLE IF NOT EXISTS production_records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            item_id INT DEFAULT NULL,
            item_name VARCHAR(255) NOT NULL,
            quantity DECIMAL(10, 2) NOT NULL,
            unit VARCHAR(20) DEFAULT 'pcs',
            production_date DATE NOT NULL,
            recorded_by INT DEFAULT NULL,
            notes VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE SET NULL,
            FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `;

    for (const migration of migrations) {
        try {
            const [existing] = await db.execute(
                'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
                [migration.table, migration.column]
            );

            if (existing.length === 0) {
                await db.execute(migration.query);
            }
        } catch (err) {
            console.warn('[Schema] Migration warning:', err.message || err);
        }
    }

    try {
        await db.execute(productionTableSql);
    } catch (err) {
        console.warn('[Schema] Production table warning:', err.message || err);
    }
}

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
                const [releaseResult] = await db.execute(
                    'UPDATE orders SET scheduled_released = 1, scheduled_for = CURRENT_TIMESTAMP WHERE id = ? AND scheduled_released = 0 AND status != "cancelled" AND status != "merged"',
                    [order.id]
                );
                if (releaseResult.affectedRows !== 1) continue;

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

async function bootstrap() {
    await ensureSchemaCompatibility();
    startScheduledOrderReleaseJob(io);
    server.listen(PORT, () => {
        console.log(`Server running on port http://localhost:${PORT}`);
    });
}

bootstrap().catch((err) => {
    console.error('Bootstrap failed:', err);
    process.exit(1);
});
