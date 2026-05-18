const db = require('../src/config/db');

async function migrate() {
    try {
        console.log('Starting migration v4...');

        const [cols] = await db.execute('DESCRIBE inventory');
        const colNames = cols.map(c => c.Field);

        if (!colNames.includes('delivery_platform')) {
            await db.execute('ALTER TABLE inventory ADD COLUMN delivery_platform VARCHAR(50) DEFAULT NULL');
            console.log('Added delivery_platform column');
        }

        console.log('Migration v4 completed successfully!');
        process.exit(0);
    } catch (e) {
        console.error('Migration v4 failed:', e);
        process.exit(1);
    }
}
migrate();
