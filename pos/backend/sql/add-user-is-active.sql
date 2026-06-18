-- Soft-delete support for admin and staff accounts.
-- Run this against your PostgreSQL database (e.g. Supabase SQL editor).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE users
SET is_active = TRUE
WHERE is_active IS NULL;

CREATE INDEX IF NOT EXISTS users_is_active_idx ON users (is_active);
