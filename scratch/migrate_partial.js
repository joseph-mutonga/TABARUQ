const db = require('../src/config/db');

async function migrate() {
    try {
        await db.execute("ALTER TABLE orders MODIFY COLUMN payment_status ENUM('pending', 'paid', 'failed', 'partial') DEFAULT 'pending';");
        console.log('Migration successful: added "partial" to payment_status enum.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
