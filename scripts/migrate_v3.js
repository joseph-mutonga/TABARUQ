const db = require('../src/config/db');

async function migrate() {
    try {
        console.log('Starting migration v3...');

        const [cols] = await db.execute('DESCRIBE inventory');
        const colNames = cols.map(c => c.Field);

        if (!colNames.includes('is_delivery')) {
            await db.execute('ALTER TABLE inventory ADD COLUMN is_delivery BOOLEAN DEFAULT FALSE');
            console.log('Added is_delivery column');
        }

        console.log('Migration v3 completed successfully!');
        process.exit(0);
    } catch (e) {
        console.error('Migration v3 failed:', e);
        process.exit(1);
    }
}
migrate();
