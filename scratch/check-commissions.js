const db = require('../src/config/db');

async function checkCommissions() {
    try {
        const [commissions] = await db.query('SELECT * FROM platform_commissions');
        console.log('Platform Commissions:', commissions);
        process.exit(0);
    } catch (error) {
        console.error('Failed to get commissions:', error);
        process.exit(1);
    }
}

checkCommissions();
