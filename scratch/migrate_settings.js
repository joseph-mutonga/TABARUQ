const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });

    try {
        console.log('Creating table receipt_settings if not exists...');
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS receipt_settings (
                id INT PRIMARY KEY DEFAULT 1,
                hotel_name VARCHAR(100) NOT NULL DEFAULT 'TABARUQ FOODS',
                phone_number VARCHAR(20) DEFAULT NULL,
                address VARCHAR(255) DEFAULT NULL,
                mpesa_paybill VARCHAR(50) DEFAULT '600000',
                mpesa_till VARCHAR(50) DEFAULT '174379',
                footer_message VARCHAR(255) DEFAULT 'Thank you for dining with us!'
            )
        `);
        console.log('Table receipt_settings created successfully.');

        console.log('Seeding default receipt settings...');
        await conn.execute(`
            INSERT IGNORE INTO receipt_settings (id, hotel_name, mpesa_paybill, mpesa_till, footer_message)
            VALUES (1, 'TABARUQ FOODS', '600000', '174379', 'Thank you for dining with us!')
        `);
        console.log('Default receipt settings seeded successfully.');
        
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e.message);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

migrate();
