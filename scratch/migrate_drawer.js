const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function migrate() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'tabaruq_foods'
    });

    try {
        await db.execute("ALTER TABLE receipt_settings ADD COLUMN printer_ip VARCHAR(50) DEFAULT NULL");
        console.log("Added printer_ip column");
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') console.log("printer_ip already exists.");
        else console.error(e);
    }

    try {
        await db.execute("ALTER TABLE receipt_settings ADD COLUMN printer_port INT DEFAULT 9100");
        console.log("Added printer_port column");
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') console.log("printer_port already exists.");
        else console.error(e);
    }

    await db.end();
    console.log("Migration done.");
}

migrate();
