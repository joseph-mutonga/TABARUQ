const db = require('../src/config/db');

async function migrate() {
    try {
        console.log('Starting migration v5 (Adding "merged" status/payment_status)...');

        // Modify status enum to include 'merged'
        console.log('Altering orders.status to include "merged"...');
        await db.execute("ALTER TABLE orders MODIFY COLUMN status ENUM('pending', 'completed', 'cancelled', 'merged') DEFAULT 'pending'");
        console.log('Successfully altered orders.status column.');

        // Modify payment_status enum to include 'merged'
        console.log('Altering orders.payment_status to include "merged"...');
        await db.execute("ALTER TABLE orders MODIFY COLUMN payment_status ENUM('pending', 'paid', 'failed', 'partial', 'merged') DEFAULT 'pending'");
        console.log('Successfully altered orders.payment_status column.');

        console.log('Migration v5 completed successfully!');
        process.exit(0);
    } catch (e) {
        console.error('Migration v5 failed:', e);
        process.exit(1);
    }
}
migrate();
