CREATE TYPE "InventoryItemType" AS ENUM ('UKAY_ITEM', 'INGREDIENT', 'MENU_ITEM', 'SUPPLY', 'BUNDLE');

ALTER TABLE "InventoryItem" ADD COLUMN "itemType" "InventoryItemType" NOT NULL DEFAULT 'UKAY_ITEM';
ALTER TABLE "InventoryItem" ADD COLUMN "sku" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "unit" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "minStock" DOUBLE PRECISION;
ALTER TABLE "InventoryItem" ADD COLUMN "maxStock" DOUBLE PRECISION;
ALTER TABLE "InventoryItem" ADD COLUMN "reorderPoint" DOUBLE PRECISION;
ALTER TABLE "InventoryItem" ADD COLUMN "expiryDate" TIMESTAMP(3);
ALTER TABLE "InventoryItem" ADD COLUMN "storageTemperature" TEXT;

ALTER TABLE "InventoryItem" ALTER COLUMN "targetCustomer" DROP NOT NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "subcategory" DROP NOT NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "size" DROP NOT NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "condition" DROP NOT NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::DOUBLE PRECISION;
ALTER TABLE "InventoryItem" ALTER COLUMN "quantity" SET DEFAULT 0.0;

CREATE INDEX "InventoryItem_businessId_itemType_idx" ON "InventoryItem"("businessId", "itemType");
CREATE UNIQUE INDEX "InventoryItem_businessId_sku_key" ON "InventoryItem"("businessId", "sku");
