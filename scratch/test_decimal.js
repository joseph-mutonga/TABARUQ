const mysql = require('mysql2/promise');
require('dotenv').config();

async function test() {
    // 1. Without decimalNumbers: true
    const pool1 = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
    });
    
    // 2. With decimalNumbers: true
    const pool2 = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        decimalNumbers: true
    });

    try {
        const [rows1] = await pool1.query('SELECT CAST(12.34 AS DECIMAL(10,2)) as val');
        console.log('Without decimalNumbers option:', typeof rows1[0].val, rows1[0].val);

        const [rows2] = await pool2.query('SELECT CAST(12.34 AS DECIMAL(10,2)) as val');
        console.log('With decimalNumbers option:', typeof rows2[0].val, rows2[0].val);
    } catch (e) {
        console.error(e);
    } finally {
        await pool1.end();
        await pool2.end();
    }
}

test();
