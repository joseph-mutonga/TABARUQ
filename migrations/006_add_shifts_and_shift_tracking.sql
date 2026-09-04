-- Migration: Track cashier shifts, payment totals, and worker attendance by shift
CREATE TABLE IF NOT EXISTS shifts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cashier_id INT NOT NULL,
    shift_name VARCHAR(50) NOT NULL DEFAULT 'Day',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME DEFAULT NULL,
    opening_cash DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    closing_cash DECIMAL(10, 2) DEFAULT NULL,
    status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    notes VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_shifts_cashier_status (cashier_id, status),
    INDEX idx_shifts_started_at (started_at),
    FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE RESTRICT
);

ALTER TABLE orders ADD COLUMN shift_id INT DEFAULT NULL;
ALTER TABLE orders ADD INDEX idx_orders_shift (shift_id);
ALTER TABLE orders ADD CONSTRAINT fk_orders_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;

ALTER TABLE payments ADD COLUMN shift_id INT DEFAULT NULL;
ALTER TABLE payments ADD INDEX idx_payments_shift (shift_id);
ALTER TABLE payments ADD CONSTRAINT fk_payments_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;

ALTER TABLE attendance ADD COLUMN shift_id INT DEFAULT NULL;
ALTER TABLE attendance ADD INDEX idx_attendance_shift (shift_id);
ALTER TABLE attendance ADD CONSTRAINT fk_attendance_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;