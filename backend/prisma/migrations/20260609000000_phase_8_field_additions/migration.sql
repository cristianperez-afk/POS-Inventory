-- Phase 8: Non-breaking field additions
-- Adds barcode, costPrice, imageUrl to InventoryItem
-- Adds description, imageUrl, locationId to BundlePackage
-- Adds locationId to KitchenOrder
-- Adds imageUrl and dietary flags to Recipe

-- InventoryItem additions
ALTER TABLE "InventoryItem" ADD COLUMN "barcode"    TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "costPrice"  DOUBLE PRECISION;
ALTER TABLE "InventoryItem" ADD COLUMN "imageUrl"   TEXT;

-- Unique index for barcode within a business (NULL-safe: PostgreSQL treats NULLs as distinct)
CREATE UNIQUE INDEX "InventoryItem_businessId_barcode_key"
  ON "InventoryItem"("businessId", "barcode");

-- BundlePackage additions
ALTER TABLE "BundlePackage" ADD COLUMN "description" TEXT;
ALTER TABLE "BundlePackage" ADD COLUMN "imageUrl"    TEXT;
ALTER TABLE "BundlePackage" ADD COLUMN "locationId"  TEXT;

ALTER TABLE "BundlePackage"
  ADD CONSTRAINT "BundlePackage_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- KitchenOrder addition
ALTER TABLE "KitchenOrder" ADD COLUMN "locationId" TEXT;

ALTER TABLE "KitchenOrder"
  ADD CONSTRAINT "KitchenOrder_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Recipe additions
ALTER TABLE "Recipe" ADD COLUMN "imageUrl"      TEXT;
ALTER TABLE "Recipe" ADD COLUMN "isVegetarian"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recipe" ADD COLUMN "isVegan"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recipe" ADD COLUMN "isGlutenFree"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recipe" ADD COLUMN "isDairyFree"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recipe" ADD COLUMN "isNutFree"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recipe" ADD COLUMN "isHalal"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recipe" ADD COLUMN "allergenNotes" TEXT;
