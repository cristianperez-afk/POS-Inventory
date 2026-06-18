-- Rename UkayStaff role to RetailStaff to make the retail module business-agnostic
ALTER TYPE "UserRole" RENAME VALUE 'UkayStaff' TO 'RetailStaff';
