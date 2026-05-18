const db = require('../src/config/db');

async function checkOrderItems() {
    try {
        const [cols] = await db.execute('DESCRIBE order_items');
        console.log('Order Items Columns:', cols.map(c => c.Field));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkOrderItems();
