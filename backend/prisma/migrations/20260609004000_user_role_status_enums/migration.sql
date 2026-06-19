-- Phase 4: Convert User.role and User.status from plain strings to Prisma enums

-- Create enums
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('Admin', 'Manager', 'Staff', 'Cashier', 'KitchenStaff', 'UkayStaff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('Active', 'Inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Normalize any case variations before casting
UPDATE "User" SET "role"   = 'Admin'       WHERE LOWER("role")   = 'admin';
UPDATE "User" SET "role"   = 'Manager'     WHERE LOWER("role")   = 'manager';
UPDATE "User" SET "role"   = 'Staff'       WHERE LOWER("role")   = 'staff';
UPDATE "User" SET "role"   = 'Cashier'     WHERE LOWER("role")   = 'cashier';
UPDATE "User" SET "role"   = 'KitchenStaff' WHERE LOWER("role")  = 'kitchenstaff';
UPDATE "User" SET "role"   = 'UkayStaff'  WHERE LOWER("role")    = 'ukaystaff';
UPDATE "User" SET "status" = 'Active'      WHERE LOWER("status") = 'active';
UPDATE "User" SET "status" = 'Inactive'    WHERE LOWER("status") = 'inactive';

-- Cast columns to enum types
ALTER TABLE "User"
  ALTER COLUMN "role"   TYPE "UserRole"   USING "role"::"UserRole",
  ALTER COLUMN "status" TYPE "UserStatus" USING "status"::"UserStatus";

-- Set column defaults
ALTER TABLE "User"
  ALTER COLUMN "role"   SET DEFAULT 'Staff'::"UserRole",
  ALTER COLUMN "status" SET DEFAULT 'Active'::"UserStatus";
