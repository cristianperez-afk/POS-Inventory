CREATE TABLE "RestaurantSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RestaurantSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantSetting_businessId_key_key"
ON "RestaurantSetting"("businessId", "key");

CREATE INDEX "RestaurantSetting_businessId_idx"
ON "RestaurantSetting"("businessId");

ALTER TABLE "RestaurantSetting"
ADD CONSTRAINT "RestaurantSetting_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
