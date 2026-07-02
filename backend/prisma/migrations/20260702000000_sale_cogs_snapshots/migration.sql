-- Preserve the weighted-average inventory cost used at the moment of sale.
ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS "costOfGoods" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "grossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "grossMargin" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "SaleItem"
  ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "grossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- inventory_deductions belongs to the POS/order-management SQL schema and may
-- not exist in databases provisioned with Prisma alone.
DO $$
BEGIN
  IF to_regclass('public.inventory_deductions') IS NOT NULL THEN
    ALTER TABLE inventory_deductions
      ADD COLUMN IF NOT EXISTS unit_cost_snapshot DECIMAL(14,6) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_cost_snapshot DECIMAL(14,6) NOT NULL DEFAULT 0;
  END IF;
END $$;
