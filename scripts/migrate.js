const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

async function migrate() {
    try {
        const migrationFiles = ['006_add_shifts_and_shift_tracking.sql', '007_add_shift_period.sql'];
        for (const file of migrationFiles) {
            console.log(`Running ${file}...`);
            const sql = fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8');
            const queries = sql.split(';').map(q => q.trim()).filter(q => q.length > 0);
            for (const query of queries) {
                try {
                    await db.execute(query);
                } catch (err) {
                    const duplicate = ['ER_DUP_COLUMN', 'ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_CANT_CREATE_TABLE', 'ER_FK_DUP_NAME'].includes(err.code) || /Duplicate column|Duplicate key name|already exists|constraint .* already exists/i.test(err.message);
                    if (!duplicate) throw err;
                    console.log('Already applied, skipping statement.');
                }
            }
        }
        
        console.log('Migration successful!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}
migrate();
