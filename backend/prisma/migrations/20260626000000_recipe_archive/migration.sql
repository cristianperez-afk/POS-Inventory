-- Add archive support to recipes (soft-delete that can be restored)
ALTER TABLE "Recipe" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Recipe_businessId_archivedAt_idx" ON "Recipe"("businessId", "archivedAt");
