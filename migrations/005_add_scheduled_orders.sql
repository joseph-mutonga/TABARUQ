-- Migration: Add Scheduled and Pre-Orders support
ALTER TABLE orders 
ADD COLUMN scheduled_for TIMESTAMP NULL DEFAULT NULL,
ADD COLUMN scheduled_released TINYINT(1) DEFAULT 0;
