const db = require('../src/config/db');

async function checkTables() {
    try {
        const [rows] = await db.execute('SHOW TABLES');
        console.log('Current Tables:', rows.map(r => Object.values(r)[0]));
        
        const [ordersCols] = await db.execute('DESCRIBE orders');
        console.log('Orders Columns:', ordersCols.map(c => c.Field));
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkTables();
