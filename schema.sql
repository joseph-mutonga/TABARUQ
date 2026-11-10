-- TABARUQ Foods Database Schema

CREATE DATABASE IF NOT EXISTS tabaruq_foods;
USE tabaruq_foods;

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'cashier') NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Customers table
CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    email VARCHAR(100) DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Workers table
CREATE TABLE IF NOT EXISTS workers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    role VARCHAR(50) DEFAULT NULL,
    weekly_salary DECIMAL(10, 2) DEFAULT 0.00,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Settlements table
CREATE TABLE IF NOT EXISTS settlements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    payout_id VARCHAR(100) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    date_received DATE NOT NULL,
    status ENUM('pending', 'completed') DEFAULT 'pending',
    attachment_name VARCHAR(255) DEFAULT NULL,
    attachment_data LONGTEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- Rent, Utilities, Salaries, Stock, etc.
    amount DECIMAL(10, 2) NOT NULL,
    expense_date DATE NOT NULL,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 6. Inventory table
CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) DEFAULT NULL,
    quantity DECIMAL(10, 2) DEFAULT 0.00,
    unit VARCHAR(20) DEFAULT 'pcs',
    cost_price DECIMAL(10, 2) NOT NULL,
    selling_price DECIMAL(10, 2) NOT NULL,
    low_stock_threshold DECIMAL(10, 2) DEFAULT 10.00,
    supplier VARCHAR(100) DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    item_type ENUM('saleable', 'ingredient') DEFAULT 'saleable',
    uber_price DECIMAL(10, 2) DEFAULT NULL,
    glovo_price DECIMAL(10, 2) DEFAULT NULL,
    bolt_price DECIMAL(10, 2) DEFAULT NULL,
    own_delivery_price DECIMAL(10, 2) DEFAULT NULL,
    is_delivery TINYINT(1) DEFAULT 0,
    delivery_platform VARCHAR(50) DEFAULT NULL
);

-- 7. Stock Deduction Rules table
CREATE TABLE IF NOT EXISTS stock_deduction_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    menu_item_id INT NOT NULL,
    stock_item_id INT NOT NULL,
    deduct_qty DECIMAL(10, 4) NOT NULL,
    menu_items_per_stock_unit DECIMAL(10, 4) NOT NULL DEFAULT 1,
    stock_qty_per_batch DECIMAL(10, 4) NOT NULL DEFAULT 1,
    accumulated_menu_qty DECIMAL(10, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_deduction_rule (menu_item_id, stock_item_id),
    FOREIGN KEY (menu_item_id) REFERENCES inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (stock_item_id) REFERENCES inventory(id) ON DELETE CASCADE
);

-- 8. Item Recipes table
CREATE TABLE IF NOT EXISTS item_recipes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    combo_item_id INT NOT NULL,
    component_item_id INT NOT NULL,
    component_qty DECIMAL(10, 4) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_recipe (combo_item_id, component_item_id),
    FOREIGN KEY (combo_item_id) REFERENCES inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (component_item_id) REFERENCES inventory(id) ON DELETE CASCADE
);

-- 9. Cashier Shifts table
CREATE TABLE IF NOT EXISTS shifts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cashier_id INT NOT NULL,
    shift_name VARCHAR(50) NOT NULL DEFAULT 'Day',
    shift_period ENUM('morning', 'evening') NOT NULL DEFAULT 'morning',
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

-- 10. Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cashier_id INT DEFAULT NULL,
    shift_id INT DEFAULT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status ENUM('pending', 'completed', 'cancelled', 'merged') DEFAULT 'pending',
    payment_status ENUM('pending', 'paid', 'failed', 'partial', 'merged') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    customer_name VARCHAR(255) DEFAULT 'Guest',
    platform VARCHAR(50) DEFAULT NULL,
    platform_order_id VARCHAR(100) DEFAULT NULL,
    scheduled_for TIMESTAMP NULL DEFAULT NULL,
    scheduled_released TINYINT(1) DEFAULT 0,
    original_total_amount DECIMAL(10, 2) DEFAULT NULL, -- pre-discount total, set only when a discount is applied
    discount_type ENUM('none', 'percentage', 'fixed') NOT NULL DEFAULT 'none',
    discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- the % or fixed KES value the admin entered
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- resulting KES amount deducted from original_total_amount
    discount_reason VARCHAR(255) DEFAULT NULL,
    discount_given_by INT DEFAULT NULL,
    discount_given_at TIMESTAMP NULL DEFAULT NULL,
    discount_source ENUM('manual', 'auto') DEFAULT NULL, -- how the discount was applied: by an admin, or automatically by a discount rule
    discount_rule_id INT DEFAULT NULL, -- the discount_rules row that auto-applied this discount, if any
    delivery_location_id INT DEFAULT NULL,
    delivery_location_name VARCHAR(150) DEFAULT NULL,
    delivery_distance DECIMAL(6, 2) DEFAULT NULL,
    delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    delivery_address VARCHAR(255) DEFAULT NULL,
    UNIQUE KEY platform_order (platform, platform_order_id),
    INDEX idx_orders_created_at (created_at),
    FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (discount_given_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 10. Order Items table
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT DEFAULT NULL,
    item_id INT DEFAULT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    item_name VARCHAR(255) DEFAULT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE SET NULL
);

-- 11. Payments table
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT DEFAULT NULL,
    shift_id INT DEFAULT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    transaction_id VARCHAR(100) DEFAULT NULL, -- M-Pesa Receipt Number
    phone_number VARCHAR(20) DEFAULT NULL,
    payment_method VARCHAR(50) DEFAULT 'M-Pesa',
    status ENUM('pending', 'confirmed', 'failed') DEFAULT 'pending',
    mpesa_checkout_id VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP NULL DEFAULT NULL,
    confirmed_by INT DEFAULT NULL,
    customer_name VARCHAR(255) DEFAULT NULL,
    mpesa_result_message VARCHAR(512) DEFAULT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 12. Raw M-Pesa Callback Audit (STK + C2B)
CREATE TABLE IF NOT EXISTS mpesa_callbacks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(16) NOT NULL,
    checkout_request_id VARCHAR(100) DEFAULT NULL,
    raw_body TEXT NOT NULL,
    parsed_summary VARCHAR(512) DEFAULT NULL,
    payment_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mpesa_callbacks_checkout (checkout_request_id),
    INDEX idx_mpesa_callbacks_payment (payment_id),
    INDEX idx_mpesa_callbacks_created (created_at),
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);

-- 13. Stock Logs table (Audit trail for inventory)
CREATE TABLE IF NOT EXISTS stock_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT DEFAULT NULL,
    user_id INT DEFAULT NULL,
    change_amount DECIMAL(10, 2) NOT NULL,
    reason VARCHAR(255) DEFAULT NULL, -- 'Purchase', 'Sale', 'Stock Taking', 'Damage'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 14. Audit Trail table (General actions)
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    action VARCHAR(255) NOT NULL,
    details TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 15. Worker Payments table
CREATE TABLE IF NOT EXISTS worker_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    worker_id INT DEFAULT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL,
    week_start DATE DEFAULT NULL,
    week_end DATE DEFAULT NULL,
    status ENUM('paid', 'pending') DEFAULT 'paid',
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

-- 16. Attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    worker_id INT NOT NULL,
    shift_id INT DEFAULT NULL,
    shift_period ENUM('morning', 'evening') DEFAULT NULL,
    date DATE NOT NULL,
    status ENUM('present', 'absent', 'half-day') DEFAULT 'present',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_attendance (worker_id, date),
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

-- 17. Order Settlements table
CREATE TABLE IF NOT EXISTS order_settlements (
    order_id INT NOT NULL,
    settlement_id INT NOT NULL,
    PRIMARY KEY (order_id, settlement_id),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE
);

-- 18. Platform Fees table
CREATE TABLE IF NOT EXISTS platform_fees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT DEFAULT NULL,
    fee_percentage DECIMAL(5, 2) DEFAULT NULL,
    fee_amount DECIMAL(10, 2) DEFAULT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 19. Platform Commissions table
CREATE TABLE IF NOT EXISTS platform_commissions (
    platform VARCHAR(50) PRIMARY KEY,
    commission_percentage DECIMAL(5, 2) DEFAULT 0.00
);

-- 20. Receipt Settings table
CREATE TABLE IF NOT EXISTS receipt_settings (
    id INT PRIMARY KEY DEFAULT 1,
    hotel_name VARCHAR(100) NOT NULL DEFAULT 'TABARUQ FOODS',
    phone_number VARCHAR(20) DEFAULT NULL,
    address VARCHAR(255) DEFAULT NULL,
    mpesa_paybill VARCHAR(50) DEFAULT '600000',
    mpesa_till VARCHAR(50) DEFAULT '174379',
    footer_message VARCHAR(255) DEFAULT 'Thank you for dining with us!',
    printer_ip VARCHAR(50) DEFAULT NULL,
    printer_port INT DEFAULT 9100
);

-- 21. Discount Settings table
CREATE TABLE IF NOT EXISTS discount_settings (
    id INT PRIMARY KEY DEFAULT 1,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    max_percentage DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 22. Discount Rules table (platform-wide / food-specific / time-of-day / day-of-week automatic discounts)
CREATE TABLE IF NOT EXISTS discount_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    platform VARCHAR(50) DEFAULT NULL, -- NULL = applies to every online platform
    item_id INT DEFAULT NULL,          -- NULL applies to the whole order total, set applies only to that food item's line amount
    discount_type ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
    discount_value DECIMAL(10, 2) NOT NULL,
    days_of_week VARCHAR(20) DEFAULT NULL, -- comma separated 0-6 (0=Sunday), NULL = every day
    start_time TIME DEFAULT NULL,
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

ALTER TABLE orders ADD CONSTRAINT fk_orders_discount_rule FOREIGN KEY (discount_rule_id) REFERENCES discount_rules(id) ON DELETE SET NULL;

-- 23. Delivery Locations table (Distance-based transport fees for Tabaruq Deliveries)
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
);

ALTER TABLE orders ADD CONSTRAINT fk_orders_delivery_location FOREIGN KEY (delivery_location_id) REFERENCES delivery_locations(id) ON DELETE SET NULL;

-- Seed initial popular delivery areas with distance and transport fees
INSERT IGNORE INTO delivery_locations (id, location_name, distance_km, transport_fee, notes) VALUES
    (1, 'Eastleigh (Within 2km)', 2.00, 100.00, 'Immediate local delivery'),
    (2, 'Pangani / Ngara', 3.50, 150.00, 'Short distance delivery'),
    (3, 'CBD / City Center', 4.50, 200.00, 'Town delivery'),
    (4, 'Parklands / Highridge', 5.50, 250.00, 'Medium distance delivery'),
    (5, 'Kilimani / Hurlingham', 7.00, 300.00, 'Long distance delivery'),
    (6, 'Westlands', 8.00, 350.00, 'Westlands and environs'),
    (7, 'South B / South C', 6.50, 250.00, 'South B and South C areas');

-- Seed initial values for platforms
INSERT IGNORE INTO platform_commissions (platform, commission_percentage) VALUES 
    ('Uber Eats', 0.00),
    ('Glovo', 0.00),
    ('Bolt Food', 0.00),
    ('Tabaruq Delivery', 0.00);

-- Seed initial receipt settings
INSERT IGNORE INTO receipt_settings (id, hotel_name, mpesa_paybill, mpesa_till, footer_message)
VALUES (1, 'TABARUQ FOODS', '600000', '174379', 'Thank you for dining with us!');

-- Seed initial discount settings
INSERT IGNORE INTO discount_settings (id, enabled, max_percentage) VALUES (1, 1, 100.00);

-- Insert default admin user (password: admin123) if it does not already exist
INSERT IGNORE INTO users (id, username, password, role) VALUES (1, 'admin', '$2a$10$Xm7B4g1xX.G6tU8j5n4WyeFwBvT/O6S0fXfG5hZ5K5uN9E6aZ0eGi', 'admin');

