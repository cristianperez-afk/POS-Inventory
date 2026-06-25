-- The point a takeout order is handed to its customer. This is separate from
-- dine-in table stay time and is written only by the kitchen/inventory status flow.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS served_at TIMESTAMP;
