const db = require('../src/config/db');

async function checkInventory() {
    try {
        const [invCols] = await db.execute('DESCRIBE inventory');
        console.log('Inventory Columns:', invCols.map(c => c.Field));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkInventory();
