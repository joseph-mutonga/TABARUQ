-- Migration: Platform-wide automatic discount rules (by online platform, by specific food item,
-- by time-of-day and by day-of-week). Unlike the per-order discount added in migration 010, these
-- rules are configured once and then applied automatically to every matching online-platform order
-- at the moment it is created - no per-transaction action is required from the admin.

CREATE TABLE IF NOT EXISTS discount_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    platform VARCHAR(50) DEFAULT NULL, -- NULL = applies to every online platform (Uber Eats, Glovo, Bolt Food, Tabaruq Delivery)
    item_id INT DEFAULT NULL,          -- NULL applies to the whole order total, set applies only to that food item's line amount
    discount_type ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
    discount_value DECIMAL(10, 2) NOT NULL,
    days_of_week VARCHAR(20) DEFAULT NULL, -- comma separated 0-6 (0=Sunday) e.g. "1,2,3,4,5" for weekdays, NULL = every day
    start_time TIME DEFAULT NULL,          -- NULL together with end_time = all day
    end_time TIME DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_discount_rules_active (is_active),
    INDEX idx_discount_rules_platform (platform),
    FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Track whether an order's discount was applied manually by an admin or automatically by a rule.
ALTER TABLE orders ADD COLUMN discount_source ENUM('manual', 'auto') DEFAULT NULL AFTER discount_given_at;
ALTER TABLE orders ADD COLUMN discount_rule_id INT DEFAULT NULL AFTER discount_source;
ALTER TABLE orders ADD CONSTRAINT fk_orders_discount_rule FOREIGN KEY (discount_rule_id) REFERENCES discount_rules(id) ON DELETE SET NULL;
