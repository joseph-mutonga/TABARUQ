-- Run once on existing databases (new installs already have this column in schema.sql)
ALTER TABLE payments ADD COLUMN mpesa_result_message VARCHAR(512) NULL AFTER customer_name;
