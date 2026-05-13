const db = require('./src/config/db');

async function fixDb() {
    try {
        console.log('Adding mpesa_result_message to payments...');
        try {
            await db.execute('ALTER TABLE payments ADD COLUMN mpesa_result_message VARCHAR(512) NULL');
            console.log('Added mpesa_result_message');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('Column already exists');
            } else {
                throw e;
            }
        }
        
        console.log('Creating mpesa_callbacks table if it does not exist...');
        await db.execute(`
            CREATE TABLE IF NOT EXISTS mpesa_callbacks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                source VARCHAR(16) NOT NULL,
                checkout_request_id VARCHAR(100) NULL,
                raw_body TEXT NOT NULL,
                parsed_summary VARCHAR(512) NULL,
                payment_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_mpesa_callbacks_checkout (checkout_request_id),
                INDEX idx_mpesa_callbacks_payment (payment_id),
                INDEX idx_mpesa_callbacks_created (created_at),
                FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
            )
        `);
        console.log('Database fixed!');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
fixDb();
