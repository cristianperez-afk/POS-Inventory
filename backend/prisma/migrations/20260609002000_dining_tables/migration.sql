-- Phase 2b: DiningTable model

CREATE TYPE "DiningTableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING');

CREATE TABLE "DiningTable" (
  "id"          TEXT         NOT NULL,
  "tableNumber" TEXT         NOT NULL,
  "capacity"    INTEGER      NOT NULL,
  "status"      "DiningTableStatus" NOT NULL DEFAULT 'AVAILABLE',
  "floor"       TEXT,
  "notes"       TEXT,
  "locationId"  TEXT         NOT NULL,
  "businessId"  TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiningTable_businessId_locationId_tableNumber_key"
  ON "DiningTable"("businessId", "locationId", "tableNumber");
CREATE INDEX "DiningTable_businessId_status_idx" ON "DiningTable"("businessId", "status");
CREATE INDEX "DiningTable_locationId_idx" ON "DiningTable"("locationId");

ALTER TABLE "DiningTable"
  ADD CONSTRAINT "DiningTable_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DiningTable"
  ADD CONSTRAINT "DiningTable_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add tableId to KitchenOrder
ALTER TABLE "KitchenOrder" ADD COLUMN "tableId" TEXT;

ALTER TABLE "KitchenOrder"
  ADD CONSTRAINT "KitchenOrder_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
