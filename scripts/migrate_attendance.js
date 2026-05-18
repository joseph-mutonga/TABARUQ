const db = require('../src/config/db');

async function migrate() {
    try {
        console.log('Starting migration for attendance...');

        await db.execute(`
            CREATE TABLE IF NOT EXISTS attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                worker_id INT NOT NULL,
                date DATE NOT NULL,
                status ENUM('present', 'absent', 'half-day') DEFAULT 'present',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_attendance (worker_id, date),
                FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
            )
        `);

        console.log('Attendance table created successfully!');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}
migrate();
