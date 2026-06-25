-- Restaurant POS order lifecycle timer. Durations are persisted in seconds.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS running_time_start TIMESTAMP,
  ADD COLUMN IF NOT EXISTS running_time_end TIMESTAMP,
  ADD COLUMN IF NOT EXISTS running_duration BIGINT,
  ADD COLUMN IF NOT EXISTS is_running BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS orders_running_orders_idx
  ON orders(store_id, is_running)
  WHERE is_running = TRUE;
