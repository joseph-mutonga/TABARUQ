-- Add index on orders(created_at) to speed up date-based queries
ALTER TABLE orders ADD INDEX idx_orders_created_at (created_at);
