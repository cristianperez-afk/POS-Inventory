DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdjustmentType') THEN
    CREATE TYPE "AdjustmentType" AS ENUM (
      'ADD',
      'REMOVE',
      'DAMAGE',
      'LOST',
      'FOUND',
      'RECOUNT'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdjustmentStatus') THEN
    CREATE TYPE "AdjustmentStatus" AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "StockAdjustment" (
  "id" TEXT NOT NULL,
  "adjustmentNumber" TEXT NOT NULL,
  "type" "AdjustmentType" NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "AdjustmentStatus" NOT NULL DEFAULT 'PENDING',
  "rejectionReason" TEXT,
  "businessId" TEXT NOT NULL,
  "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL',
  "createdById" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockAdjustmentItem" (
  "id" TEXT NOT NULL,
  "adjustmentId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantityChange" DOUBLE PRECISION NOT NULL,
  "locationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StockAdjustmentItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StockAdjustment"
ADD COLUMN IF NOT EXISTS "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

CREATE UNIQUE INDEX IF NOT EXISTS "StockAdjustment_businessId_adjustmentNumber_key"
ON "StockAdjustment"("businessId", "adjustmentNumber");

CREATE INDEX IF NOT EXISTS "StockAdjustment_businessId_status_idx"
ON "StockAdjustment"("businessId", "status");

CREATE INDEX IF NOT EXISTS "StockAdjustment_businessId_createdAt_idx"
ON "StockAdjustment"("businessId", "createdAt");

CREATE INDEX IF NOT EXISTS "StockAdjustment_businessId_module_status_idx"
ON "StockAdjustment"("businessId", "module", "status");

CREATE INDEX IF NOT EXISTS "StockAdjustmentItem_adjustmentId_idx"
ON "StockAdjustmentItem"("adjustmentId");

CREATE INDEX IF NOT EXISTS "StockAdjustmentItem_inventoryItemId_idx"
ON "StockAdjustmentItem"("inventoryItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockAdjustment_businessId_fkey'
  ) THEN
    ALTER TABLE "StockAdjustment"
    ADD CONSTRAINT "StockAdjustment_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockAdjustment_createdById_fkey'
  ) THEN
    ALTER TABLE "StockAdjustment"
    ADD CONSTRAINT "StockAdjustment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockAdjustment_reviewedById_fkey'
  ) THEN
    ALTER TABLE "StockAdjustment"
    ADD CONSTRAINT "StockAdjustment_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockAdjustmentItem_adjustmentId_fkey'
  ) THEN
    ALTER TABLE "StockAdjustmentItem"
    ADD CONSTRAINT "StockAdjustmentItem_adjustmentId_fkey"
    FOREIGN KEY ("adjustmentId") REFERENCES "StockAdjustment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockAdjustmentItem_inventoryItemId_fkey'
  ) THEN
    ALTER TABLE "StockAdjustmentItem"
    ADD CONSTRAINT "StockAdjustmentItem_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockAdjustmentItem_locationId_fkey'
  ) THEN
    ALTER TABLE "StockAdjustmentItem"
    ADD CONSTRAINT "StockAdjustmentItem_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
