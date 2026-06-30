ALTER TABLE "Business"
  ADD COLUMN IF NOT EXISTS "posStoreId" INTEGER;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "posUserId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "Business_posStoreId_key" ON "Business"("posStoreId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_posUserId_key" ON "User"("posUserId");

