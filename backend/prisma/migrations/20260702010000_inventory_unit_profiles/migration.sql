-- Explicit measurement/package profiles. Conversion factors remain stored so
-- historical PO lines preserve the exact package size used when they were received.
ALTER TABLE "InventoryItem"
  ADD COLUMN IF NOT EXISTS "measurementType" TEXT,
  ADD COLUMN IF NOT EXISTS "packageContentQuantity" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "packageContentUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "unitConfigurationStatus" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
  ADD COLUMN IF NOT EXISTS "purchaseUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "baseUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1;

ALTER TABLE "PurchaseOrderItem"
  ADD COLUMN IF NOT EXISTS "measurementType" TEXT,
  ADD COLUMN IF NOT EXISTS "packageContentQuantity" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "packageContentUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "baseUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Safe inference only. Existing quantities/costs are deliberately not rewritten.
-- Standard legacy units are configured; ambiguous package/count records require review.
UPDATE "InventoryItem"
SET "measurementType" = CASE
      WHEN lower(COALESCE(NULLIF("baseUnit", ''), unit, '')) IN ('g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms') THEN 'WEIGHT'
      WHEN lower(COALESCE(NULLIF("baseUnit", ''), unit, '')) IN ('ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters', 'litre', 'litres') THEN 'VOLUME'
      WHEN lower(COALESCE(NULLIF("baseUnit", ''), unit, '')) IN ('pc', 'pcs', 'piece', 'pieces', 'dozen') THEN 'COUNT'
      ELSE "measurementType"
    END,
    "unitConfigurationStatus" = CASE
      WHEN lower(COALESCE(NULLIF("baseUnit", ''), unit, '')) IN (
        'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms',
        'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters', 'litre', 'litres',
        'pc', 'pcs', 'piece', 'pieces', 'dozen'
      ) THEN 'CONFIGURED'
      ELSE 'REVIEW_REQUIRED'
    END
WHERE "measurementType" IS NULL OR "unitConfigurationStatus" = 'REVIEW_REQUIRED';
