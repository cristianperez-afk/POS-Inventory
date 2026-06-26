-- Generic Manager is no longer a supported inventory role.
-- PostgreSQL enum values cannot be dropped safely while the app is running, so
-- migrate existing records away from Manager. The Prisma schema no longer emits
-- or accepts Manager in application code.

UPDATE "User" SET "role" = 'Admin' WHERE "role"::text = 'Manager';
