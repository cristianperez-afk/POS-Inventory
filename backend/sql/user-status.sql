ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ACTIVE';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'is_active'
  ) THEN
    UPDATE users
    SET status = CASE
      WHEN COALESCE(is_active, TRUE) = TRUE THEN COALESCE(status, 'ACTIVE')
      ELSE 'INACTIVE'
    END;
  END IF;
END $$;

UPDATE users
SET status = 'ACTIVE'
WHERE status IS NULL;

ALTER TABLE users
  ALTER COLUMN status SET DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS users_status_idx ON users(status);

ALTER TABLE users
  DROP COLUMN IF EXISTS is_active;
