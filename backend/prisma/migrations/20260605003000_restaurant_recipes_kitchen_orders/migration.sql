CREATE TYPE "KitchenOrderStatus" AS ENUM ('COMPLETED', 'VOIDED');

CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "servings" DOUBLE PRECISION NOT NULL,
    "yieldPercentage" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "prepTimeMinutes" INTEGER,
    "instructions" TEXT,
    "targetFoodCost" DOUBLE PRECISION,
    "sellingPrice" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "menuItemId" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "unitCost" DOUBLE PRECISION,
    "totalCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KitchenOrder" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "status" "KitchenOrderStatus" NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "recipeId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Recipe_businessId_name_key" ON "Recipe"("businessId", "name");
CREATE INDEX "Recipe_businessId_isActive_idx" ON "Recipe"("businessId", "isActive");
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_itemId_key" ON "RecipeIngredient"("recipeId", "itemId");
CREATE INDEX "RecipeIngredient_itemId_idx" ON "RecipeIngredient"("itemId");
CREATE UNIQUE INDEX "KitchenOrder_businessId_receiptNo_key" ON "KitchenOrder"("businessId", "receiptNo");
CREATE INDEX "KitchenOrder_businessId_createdAt_idx" ON "KitchenOrder"("businessId", "createdAt");
CREATE INDEX "KitchenOrder_businessId_recipeId_idx" ON "KitchenOrder"("businessId", "recipeId");
CREATE INDEX "KitchenOrder_businessId_status_idx" ON "KitchenOrder"("businessId", "status");

ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenOrder" ADD CONSTRAINT "KitchenOrder_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenOrder" ADD CONSTRAINT "KitchenOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenOrder" ADD CONSTRAINT "KitchenOrder_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
