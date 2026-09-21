-- Migration: Track admin-applied discounts on orders (mainly delivery/online platform orders)
-- so the amount the system expects to be paid matches the discounted amount actually charged.
ALTER TABLE orders ADD COLUMN original_total_amount DECIMAL(10, 2) DEFAULT NULL AFTER total_amount;
ALTER TABLE orders ADD COLUMN discount_type ENUM('none', 'percentage', 'fixed') NOT NULL DEFAULT 'none' AFTER original_total_amount;
ALTER TABLE orders ADD COLUMN discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER discount_type;
ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER discount_value;
ALTER TABLE orders ADD COLUMN discount_reason VARCHAR(255) DEFAULT NULL AFTER discount_amount;
ALTER TABLE orders ADD COLUMN discount_given_by INT DEFAULT NULL AFTER discount_reason;
ALTER TABLE orders ADD COLUMN discount_given_at TIMESTAMP NULL DEFAULT NULL AFTER discount_given_by;
ALTER TABLE orders ADD CONSTRAINT fk_orders_discount_given_by FOREIGN KEY (discount_given_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS discount_settings (
    id INT PRIMARY KEY DEFAULT 1,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    max_percentage DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO discount_settings (id, enabled, max_percentage) VALUES (1, 1, 100.00);
