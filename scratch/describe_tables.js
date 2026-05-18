const db = require('../src/config/db');

async function run() {
    try {
        console.log('--- DESCRIBE orders ---');
        const [ordersDesc] = await db.execute('DESCRIBE orders');
        console.table(ordersDesc);

        console.log('--- DESCRIBE payments ---');
        const [paymentsDesc] = await db.execute('DESCRIBE payments');
        console.table(paymentsDesc);

        console.log('--- DESCRIBE order_items ---');
        const [orderItemsDesc] = await db.execute('DESCRIBE order_items');
        console.table(orderItemsDesc);

        console.log('--- Recent Orders ---');
        const [orders] = await db.execute('SELECT * FROM orders ORDER BY id DESC LIMIT 5');
        console.log(orders);

        process.exit(0);
    } catch (err) {
        console.error('Error during description:', err);
        process.exit(1);
    }
}
run();
