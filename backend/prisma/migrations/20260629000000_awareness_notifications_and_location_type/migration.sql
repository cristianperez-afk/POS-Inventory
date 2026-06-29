-- Reconciles the schema with the awareness-notification + location-type work that
-- was previously applied at runtime by the inventory service (ensureNotificationTypes
-- / ensureLocationTypeColumn). Every statement is idempotent, so this migration is a
-- safe no-op on databases that already ran those runtime helpers, and it makes the
-- same schema reproducible on a fresh database built from migrations alone.

-- NotificationType values used by the transfer + stock-adjustment awareness
-- notifications. The base enum (LOW_STOCK, EXPIRY_*, BUNDLE_*, KITCHEN_ORDER_READY)
-- was created in 20260609001000_notifications.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRANSFER_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRANSFER_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRANSFER_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT_REJECTED';

-- NOTE: some live databases also carry the legacy values 'TRANSFER_AUTO_COMPLETED'
-- and 'TRANSFER_APPROVAL_REQUIRED' from earlier iterations. They are unused by the
-- current code and intentionally NOT recreated here (PostgreSQL cannot drop enum
-- values without recreating the type, and they are harmless).

-- Location classification (warehouse / store / kitchen), surfaced in the
-- Multi-Location "Add Location" form and the location cards.
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'warehouse';
