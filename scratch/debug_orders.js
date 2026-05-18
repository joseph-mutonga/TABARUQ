const db = require('../src/controllers/../config/db');

async function debug() {
    try {
        console.log('--- Orders 50-60 ---');
        const [orders] = await db.execute('SELECT * FROM orders WHERE id BETWEEN 50 AND 60');
        console.table(orders);

        console.log('\n--- Payments for Orders 50-60 ---');
        const [payments] = await db.execute('SELECT * FROM payments WHERE order_id BETWEEN 50 AND 60 OR order_id IS NULL ORDER BY id DESC LIMIT 20');
        console.table(payments);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
