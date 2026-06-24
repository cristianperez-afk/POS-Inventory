-- Safe role migration for the unified POS + Inventory app.
-- Run this after pulling the role update.

DO $$
DECLARE
  role_constraint_name text;
  staff_type_constraint_name text;
BEGIN
  SELECT con.conname
  INTO role_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'users'
    AND nsp.nspname = current_schema()
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LIMIT 1;

  IF role_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', role_constraint_name);
  END IF;

  SELECT con.conname
  INTO staff_type_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'users'
    AND nsp.nspname = current_schema()
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%staff_type%'
  LIMIT 1;

  IF staff_type_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', staff_type_constraint_name);
  END IF;
END $$;

UPDATE users SET role = 'POS_MANAGER' WHERE role = 'POS_ADMIN';
UPDATE users SET role = 'INVENTORY_MANAGER' WHERE role = 'INVENTORY_ADMIN';
UPDATE users SET staff_type = 'INVENTORY_STAFF' WHERE staff_type = 'MANAGER';

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('SUPERADMIN', 'ADMIN', 'STAFF', 'POS_MANAGER', 'INVENTORY_MANAGER'));

ALTER TABLE users
  ADD CONSTRAINT users_staff_type_check
  CHECK (staff_type IS NULL OR staff_type IN ('POS_STAFF', 'INVENTORY_STAFF'));
