-- Phase 5: Sale <-> KitchenOrder bidirectional link

-- Add nullable saleId to KitchenOrder (unique — one-to-one)
ALTER TABLE "KitchenOrder" ADD COLUMN "saleId" TEXT;

ALTER TABLE "KitchenOrder"
  ADD CONSTRAINT "KitchenOrder_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "KitchenOrder_saleId_key" ON "KitchenOrder"("saleId")
  WHERE "saleId" IS NOT NULL;
