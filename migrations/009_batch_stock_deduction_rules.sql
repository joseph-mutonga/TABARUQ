-- Migration: Deduct stock only after the configured menu-item batch is reached
ALTER TABLE stock_deduction_rules ADD COLUMN menu_items_per_stock_unit DECIMAL(10, 4) NOT NULL DEFAULT 1 AFTER deduct_qty;
ALTER TABLE stock_deduction_rules ADD COLUMN stock_qty_per_batch DECIMAL(10, 4) NOT NULL DEFAULT 1 AFTER menu_items_per_stock_unit;
ALTER TABLE stock_deduction_rules ADD COLUMN accumulated_menu_qty DECIMAL(10, 4) NOT NULL DEFAULT 0 AFTER stock_qty_per_batch;

UPDATE stock_deduction_rules
SET menu_items_per_stock_unit = CASE WHEN deduct_qty > 0 THEN 1 / deduct_qty ELSE 1 END
WHERE menu_items_per_stock_unit = 1 AND deduct_qty <> 1;