-- Migration 012: Add Delivery Locations and Transport Fee tracking
-- Allows configuring distance-based transport fees for Tabaruq Deliveries
-- and recording selected delivery location, distance, transport fee, and address on orders.

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

-- Seed initial popular delivery areas with distance and transport fees
INSERT IGNORE INTO delivery_locations (location_name, distance_km, transport_fee, notes) VALUES
    ('Eastleigh (Within 2km)', 2.00, 100.00, 'Immediate local delivery'),
    ('Pangani / Ngara', 3.50, 150.00, 'Short distance delivery'),
    ('CBD / City Center', 4.50, 200.00, 'Town delivery'),
    ('Parklands / Highridge', 5.50, 250.00, 'Medium distance delivery'),
    ('Kilimani / Hurlingham', 7.00, 300.00, 'Long distance delivery'),
    ('Westlands', 8.00, 350.00, 'Westlands and environs'),
    ('South B / South C', 6.50, 250.00, 'South B and South C areas');

-- Add delivery details columns to orders table
ALTER TABLE orders ADD COLUMN delivery_location_id INT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN delivery_location_name VARCHAR(150) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN delivery_distance DECIMAL(6, 2) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE orders ADD COLUMN delivery_address VARCHAR(255) DEFAULT NULL;

ALTER TABLE orders ADD CONSTRAINT fk_orders_delivery_location FOREIGN KEY (delivery_location_id) REFERENCES delivery_locations(id) ON DELETE SET NULL;

