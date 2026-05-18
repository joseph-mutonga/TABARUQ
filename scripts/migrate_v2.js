const db = require('../src/config/db');

async function migrate() {
    try {
        console.log('Starting migration...');

        // 1. Update Inventory for Platform Prices and Item Type
        console.log('Updating inventory table...');
        const [invCols] = await db.execute('DESCRIBE inventory');
        const colNames = invCols.map(c => c.Field);

        if (!colNames.includes('item_type')) {
            await db.execute("ALTER TABLE inventory ADD COLUMN item_type ENUM('saleable', 'ingredient') DEFAULT 'saleable'");
            console.log('Added item_type to inventory');
        }
        if (!colNames.includes('uber_price')) {
            await db.execute("ALTER TABLE inventory ADD COLUMN uber_price DECIMAL(10, 2) DEFAULT NULL");
            console.log('Added uber_price to inventory');
        }
        if (!colNames.includes('glovo_price')) {
            await db.execute("ALTER TABLE inventory ADD COLUMN glovo_price DECIMAL(10, 2) DEFAULT NULL");
            console.log('Added glovo_price to inventory');
        }
        if (!colNames.includes('bolt_price')) {
            await db.execute("ALTER TABLE inventory ADD COLUMN bolt_price DECIMAL(10, 2) DEFAULT NULL");
            console.log('Added bolt_price to inventory');
        }

        // 2. Create Workers table
        console.log('Creating workers table...');
        await db.execute(`
            CREATE TABLE IF NOT EXISTS workers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(20),
                role VARCHAR(50),
                weekly_salary DECIMAL(10, 2) DEFAULT 0.00,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Create Worker Payments table
        console.log('Creating worker_payments table...');
        await db.execute(`
            CREATE TABLE IF NOT EXISTS worker_payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                worker_id INT,
                amount DECIMAL(10, 2) NOT NULL,
                payment_date DATE NOT NULL,
                week_start DATE,
                week_end DATE,
                status ENUM('paid', 'pending') DEFAULT 'paid',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
            )
        `);

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

migrate();
