-- Migration 004: Stock Deduction Rules & Combo/Bundle Recipes
-- Run this once against the tabaruq_foods database.

USE tabaruq_foods;

-- ─────────────────────────────────────────────────────────────────────────────
-- Table: stock_deduction_rules
--   When a menu item is sold, the linked stock item(s) are automatically
--   deducted.  One menu item can map to many stock items.
--   Example: Sell "Chipo" → deduct 1 kg "Viazi" from stock.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_deduction_rules (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    menu_item_id    INT              NOT NULL,   -- inventory item being sold
    stock_item_id   INT              NOT NULL,   -- stock/ingredient to deduct
    deduct_qty      DECIMAL(10, 4)   NOT NULL,   -- qty deducted per 1 unit sold
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_item_id)  REFERENCES inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (stock_item_id) REFERENCES inventory(id) ON DELETE CASCADE,
    UNIQUE KEY uq_deduction_rule (menu_item_id, stock_item_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table: item_recipes
--   Defines combo/bundle items.  When a combo is sold, each component is
--   deducted individually at the specified quantity.
--   Example: Sell "Savoury" (×1) → deduct 1 Samosa, 3 Viazi Karai, 1 Sausage.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_recipes (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    combo_item_id       INT              NOT NULL,  -- the bundle/combo item
    component_item_id   INT              NOT NULL,  -- component inside the bundle
    component_qty       DECIMAL(10, 4)   NOT NULL,  -- qty per 1 combo sold
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (combo_item_id)      REFERENCES inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (component_item_id)  REFERENCES inventory(id) ON DELETE CASCADE,
    UNIQUE KEY uq_recipe (combo_item_id, component_item_id)
);
