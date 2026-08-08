const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'tabaruq_foods'
    });

    try {
        await db.execute("ALTER TABLE inventory ADD COLUMN own_delivery_price DECIMAL(10, 2) DEFAULT NULL;");
        console.log("Added own_delivery_price to inventory");
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("own_delivery_price already exists.");
        } else {
            console.error(e);
        }
    }

    try {
        await db.execute("INSERT IGNORE INTO platform_commissions (platform, commission_percentage) VALUES ('Own Delivery', 0.00);");
        console.log("Inserted Own Delivery into platform_commissions");
    } catch (e) {
        console.error(e);
    }
    
    await db.end();
}

migrate();
