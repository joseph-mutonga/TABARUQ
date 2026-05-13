const db = require('../src/config/db');

async function migrate() {
    try {
        console.log('Starting migration...');
        
        // 1. Extend orders table
        // We use COALESCE/IF NOT EXISTS logic or just handle errors if column already exists
        try {
            await db.query(`ALTER TABLE orders 
                ADD COLUMN platform VARCHAR(50) DEFAULT NULL, 
                ADD COLUMN platform_order_id VARCHAR(100) DEFAULT NULL`);
            await db.query(`ALTER TABLE orders ADD UNIQUE KEY platform_order (platform, platform_order_id)`);
            console.log('Orders table extended');
        } catch (e) { console.log('Orders table already extended or error:', e.message); }

        // 2. Extend order_items table
        try {
            await db.query(`ALTER TABLE order_items ADD COLUMN item_name VARCHAR(255) DEFAULT NULL`);
            console.log('Order Items table extended');
        } catch (e) { console.log('Order Items table already extended or error:', e.message); }

        // 3. Create settlements table
        await db.query(`CREATE TABLE IF NOT EXISTS settlements (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            platform VARCHAR(50) NOT NULL, 
            payout_id VARCHAR(100) NOT NULL, 
            amount DECIMAL(10,2) NOT NULL, 
            date_received DATE NOT NULL, 
            status ENUM('pending', 'completed') DEFAULT 'pending', 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('Settlements table created');

        // 4. Create order_settlements table
        await db.query(`CREATE TABLE IF NOT EXISTS order_settlements (
            order_id INT, 
            settlement_id INT, 
            PRIMARY KEY (order_id, settlement_id), 
            FOREIGN KEY (order_id) REFERENCES orders(id), 
            FOREIGN KEY (settlement_id) REFERENCES settlements(id)
        )`);
        console.log('Order Settlements table created');

        // 5. Create platform_fees table
        await db.query(`CREATE TABLE IF NOT EXISTS platform_fees (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            order_id INT, 
            fee_percentage DECIMAL(5,2), 
            fee_amount DECIMAL(10,2), 
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )`);
        console.log('Platform Fees table created');

        console.log('Migration completed successfully');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrate();
