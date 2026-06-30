-- Migrates old POS Admin / Inventory Admin role values to POS Manager /
-- Inventory Manager and updates the users.role CHECK constraint.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'users'
    AND nsp.nspname = current_schema()
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

UPDATE users SET role = 'POS_MANAGER' WHERE role = 'POS_ADMIN';
UPDATE users SET role = 'INVENTORY_MANAGER' WHERE role = 'INVENTORY_ADMIN';

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('SUPERADMIN', 'ADMIN', 'STAFF', 'KITCHEN', 'POS_MANAGER', 'INVENTORY_MANAGER', 'POS_ADMIN', 'INVENTORY_ADMIN'));
