-- Phase 3 Step A: Category table + nullable FKs on InventoryItem and Supplier

CREATE TABLE "Category" (
  "id"          TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "module"      "BusinessModule" NOT NULL,
  "businessId"  TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_businessId_name_module_key"
  ON "Category"("businessId", "name", "module");
CREATE INDEX "Category_businessId_module_idx" ON "Category"("businessId", "module");

ALTER TABLE "Category"
  ADD CONSTRAINT "Category_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add categoryId to InventoryItem
ALTER TABLE "InventoryItem" ADD COLUMN "categoryId" TEXT;

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add categoryId to Supplier
ALTER TABLE "Supplier" ADD COLUMN "categoryId" TEXT;

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
