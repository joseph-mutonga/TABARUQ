const db = require('./src/config/db');

async function run() {
    const [c] = await db.execute('SELECT * FROM mpesa_callbacks ORDER BY id DESC LIMIT 5');
    console.log('Callbacks:', c);
    const [p] = await db.execute('SELECT * FROM payments ORDER BY id DESC LIMIT 5');
    console.log('Payments:', p);
    process.exit(0);
}
run();
