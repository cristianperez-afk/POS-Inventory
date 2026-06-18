-- Allows the merged POS + Inventory app to create POS staff, Inventory staff,
-- and Manager accounts from the single POS admin screen.
--
-- Run this only if your users.staff_type column has an older CHECK constraint
-- that only accepts POS_STAFF.

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
    AND pg_get_constraintdef(con.oid) ILIKE '%staff_type%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_staff_type_check
  CHECK (staff_type IS NULL OR staff_type IN ('POS_STAFF', 'INVENTORY_STAFF', 'MANAGER'));
