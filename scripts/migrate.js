const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

async function migrate() {
    try {
        console.log('Running scheduled orders migration...');
        const sql = fs.readFileSync(path.join(__dirname, '../migrations/005_add_scheduled_orders.sql'), 'utf8');
        
        // Split queries by semicolon in case we run multiple statements
        const queries = sql.split(';').map(q => q.trim()).filter(q => q.length > 0);
        for (const query of queries) {
            await db.execute(query);
        }
        
        console.log('Migration successful!');
        process.exit(0);
    } catch (err) {
        if (err.code === 'ER_DUP_COLUMN' || err.message.includes('Duplicate column name')) {
            console.log('Columns already exist, migration skipped.');
            process.exit(0);
        }
        console.error('Migration failed:', err);
        process.exit(1);
    }
}
migrate();
