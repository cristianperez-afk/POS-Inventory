ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMP;

UPDATE orders
SET ordered_at = COALESCE(running_time_start, preparing_started_at, created_at)
WHERE ordered_at IS NULL
  AND order_type <> 'RETAIL'
  AND COALESCE(running_time_start, preparing_started_at, created_at) IS NOT NULL;
