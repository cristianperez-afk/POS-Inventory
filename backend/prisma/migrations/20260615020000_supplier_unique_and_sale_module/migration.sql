-- Drop the old unique constraint on Supplier (businessId, name)
-- and replace it with one that includes module so a combined business
-- can have a supplier with the same name for each module.
DROP INDEX "Supplier_businessId_name_key";
CREATE UNIQUE INDEX "Supplier_businessId_name_module_key"
  ON "Supplier"("businessId", "name", "module");

-- Add module ownership to Sale so retail and restaurant sales are isolated.
ALTER TABLE "Sale"
ADD COLUMN "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

-- Backfill: any sale linked to a kitchen order belongs to RESTAURANT.
UPDATE "Sale" s
SET "module" = 'RESTAURANT'
WHERE EXISTS (
  SELECT 1 FROM "KitchenOrder" ko WHERE ko."saleId" = s.id
);

CREATE INDEX "Sale_businessId_module_createdAt_idx"
  ON "Sale"("businessId", "module", "createdAt");
