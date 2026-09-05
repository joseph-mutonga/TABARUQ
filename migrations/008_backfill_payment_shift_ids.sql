-- Migration: Attribute existing linked payments to their order's cashier shift
UPDATE payments p
JOIN orders o ON o.id = p.order_id
SET p.shift_id = o.shift_id
WHERE p.shift_id IS NULL AND o.shift_id IS NOT NULL;