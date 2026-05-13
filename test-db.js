const db = require('./src/config/db');

async function testConnection() {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS solution');
        console.log('Database connected successfully. Solution:', rows[0].solution);
        process.exit(0);
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
}

testConnection();
