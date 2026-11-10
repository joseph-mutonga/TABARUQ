const db = require('../src/config/db');

async function run() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS delivery_locations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            location_name VARCHAR(150) NOT NULL,
            distance_km DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
            transport_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            notes VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_delivery_locations_active (is_active)
        )
    `);
    console.log('delivery_locations table ready');

    const [rows] = await db.execute('SELECT COUNT(*) as cnt FROM delivery_locations');
    if (rows[0].cnt === 0) {
        await db.execute(`
            INSERT INTO delivery_locations (location_name, distance_km, transport_fee, notes) VALUES
                ('Eastleigh (Within 2km)', 2.00, 100.00, 'Immediate local delivery'),
                ('Pangani / Ngara', 3.50, 150.00, 'Short distance delivery'),
                ('CBD / City Center', 4.50, 200.00, 'Town delivery'),
                ('Parklands / Highridge', 5.50, 250.00, 'Medium distance delivery'),
                ('Kilimani / Hurlingham', 7.00, 300.00, 'Long distance delivery'),
                ('Westlands', 8.00, 350.00, 'Westlands and environs'),
                ('South B / South C', 6.50, 250.00, 'South B and South C areas')
        `);
        console.log('Seeded delivery locations');
    }

    const cols = [
        { name: 'delivery_location_id', sql: 'ALTER TABLE orders ADD COLUMN delivery_location_id INT DEFAULT NULL' },
        { name: 'delivery_location_name', sql: 'ALTER TABLE orders ADD COLUMN delivery_location_name VARCHAR(150) DEFAULT NULL' },
        { name: 'delivery_distance', sql: 'ALTER TABLE orders ADD COLUMN delivery_distance DECIMAL(6, 2) DEFAULT NULL' },
        { name: 'delivery_fee', sql: 'ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00' },
        { name: 'delivery_address', sql: 'ALTER TABLE orders ADD COLUMN delivery_address VARCHAR(255) DEFAULT NULL' }
    ];

    for (const col of cols) {
        const [existing] = await db.execute(
            'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = "orders" AND column_name = ?',
            [col.name]
        );
        if (existing.length === 0) {
            await db.execute(col.sql);
            console.log('Added column ' + col.name);
        } else {
            console.log('Column ' + col.name + ' already exists');
        }
    }

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
