-- Migration: Explicit morning/evening shift periods
ALTER TABLE shifts ADD COLUMN shift_period ENUM('morning', 'evening') NOT NULL DEFAULT 'morning' AFTER shift_name;
ALTER TABLE attendance ADD COLUMN shift_period ENUM('morning', 'evening') DEFAULT NULL AFTER shift_id;