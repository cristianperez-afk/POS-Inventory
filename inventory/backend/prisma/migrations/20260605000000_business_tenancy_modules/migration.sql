CREATE TYPE "BusinessModule" AS ENUM ('UKAY', 'RESTAURANT');

CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modules" "BusinessModule"[] NOT NULL DEFAULT ARRAY['UKAY']::"BusinessModule"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Business_name_key" ON "Business"("name");

INSERT INTO "Business" ("id", "name", "modules", "updatedAt")
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Ukay + Restaurant Demo',
    ARRAY['UKAY', 'RESTAURANT']::"BusinessModule"[],
    CURRENT_TIMESTAMP
);

ALTER TABLE "User" ADD COLUMN "businessId" TEXT;
ALTER TABLE "Location" ADD COLUMN "businessId" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "businessId" TEXT;

UPDATE "User" SET "businessId" = '00000000-0000-0000-0000-000000000001';
UPDATE "Location" SET "businessId" = '00000000-0000-0000-0000-000000000001';
UPDATE "InventoryItem" SET "businessId" = '00000000-0000-0000-0000-000000000001';

ALTER TABLE "User" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Location" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "businessId" SET NOT NULL;

DROP INDEX IF EXISTS "Location_name_key";

CREATE UNIQUE INDEX "Location_businessId_name_key" ON "Location"("businessId", "name");
CREATE INDEX "InventoryItem_businessId_idx" ON "InventoryItem"("businessId");
CREATE INDEX "InventoryItem_businessId_locationId_idx" ON "InventoryItem"("businessId", "locationId");

ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
