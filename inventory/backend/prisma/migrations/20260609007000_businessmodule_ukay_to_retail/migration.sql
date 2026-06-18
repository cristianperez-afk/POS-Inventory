-- Phase 7: Rename BusinessModule.UKAY to RETAIL and InventoryItemType.UKAY_ITEM to RETAIL_ITEM
-- PostgreSQL RENAME VALUE updates the enum definition in-place; all existing rows are updated automatically.
-- JWT tokens carrying modules:["UKAY"] will fail module guards after this migration — users must re-login.

ALTER TYPE "BusinessModule" RENAME VALUE 'UKAY' TO 'RETAIL';
ALTER TYPE "InventoryItemType" RENAME VALUE 'UKAY_ITEM' TO 'RETAIL_ITEM';
