ALTER TABLE "StockMovement"
ADD COLUMN IF NOT EXISTS "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

ALTER TABLE "Supplier"
ADD COLUMN IF NOT EXISTS "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

ALTER TABLE "PurchaseOrder"
ADD COLUMN IF NOT EXISTS "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

ALTER TABLE "GoodsReceipt"
ADD COLUMN IF NOT EXISTS "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

ALTER TABLE "Transfer"
ADD COLUMN IF NOT EXISTS "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

ALTER TABLE "Sale"
ADD COLUMN IF NOT EXISTS "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

UPDATE "PurchaseOrder" po
SET "module" = 'RESTAURANT'
WHERE EXISTS (
  SELECT 1
  FROM "PurchaseOrderItem" poi
  JOIN "InventoryItem" item ON item.id = poi."inventoryItemId"
  WHERE poi."purchaseOrderId" = po.id
    AND item."itemType" IN ('INGREDIENT', 'MENU_ITEM', 'SUPPLY')
);

UPDATE "Supplier" supplier
SET "module" = 'RESTAURANT'
WHERE EXISTS (
  SELECT 1
  FROM "PurchaseOrder" po
  WHERE po."supplierId" = supplier.id
    AND po."module" = 'RESTAURANT'
);

UPDATE "GoodsReceipt" receipt
SET "module" = po."module"
FROM "PurchaseOrder" po
WHERE po.id = receipt."purchaseOrderId";

UPDATE "Transfer" transfer
SET "module" = 'RESTAURANT'
WHERE EXISTS (
  SELECT 1
  FROM "TransferItem" ti
  JOIN "InventoryItem" item ON item.id = ti."inventoryItemId"
  WHERE ti."transferId" = transfer.id
    AND item."itemType" IN ('INGREDIENT', 'MENU_ITEM', 'SUPPLY')
);

UPDATE "StockMovement" movement
SET "module" = CASE
  WHEN item."itemType" IN ('INGREDIENT', 'MENU_ITEM', 'SUPPLY')
    THEN 'RESTAURANT'::"BusinessModule"
  ELSE 'RETAIL'::"BusinessModule"
END
FROM "InventoryItem" item
WHERE item.id = movement."itemId";

UPDATE "Sale" s
SET "module" = 'RESTAURANT'
WHERE EXISTS (
  SELECT 1 FROM "KitchenOrder" ko WHERE ko."saleId" = s.id
);

DROP INDEX IF EXISTS "Supplier_businessId_name_key";

INSERT INTO "Supplier" (
  "id",
  "name",
  "contactPerson",
  "email",
  "phone",
  "address",
  "category",
  "categoryId",
  "isActive",
  "businessId",
  "module",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  source."name",
  source."contactPerson",
  source."email",
  source."phone",
  source."address",
  source."category",
  source."categoryId",
  source."isActive",
  source."businessId",
  'RETAIL'::"BusinessModule",
  source."createdAt",
  NOW()
FROM "Supplier" source
WHERE source."module" = 'RESTAURANT'
  AND EXISTS (
    SELECT 1
    FROM "PurchaseOrder" po
    WHERE po."supplierId" = source."id"
      AND po."module" = 'RETAIL'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Supplier" retail
    WHERE retail."businessId" = source."businessId"
      AND retail."name" = source."name"
      AND retail."module" = 'RETAIL'
  );

UPDATE "PurchaseOrder" po
SET "supplierId" = retail."id"
FROM "Supplier" source
JOIN "Supplier" retail
  ON retail."businessId" = source."businessId"
  AND retail."name" = source."name"
  AND retail."module" = 'RETAIL'
WHERE po."supplierId" = source."id"
  AND po."module" = 'RETAIL'
  AND source."module" = 'RESTAURANT';

CREATE INDEX IF NOT EXISTS "StockMovement_businessId_module_createdAt_idx"
ON "StockMovement"("businessId", "module", "createdAt");

CREATE INDEX IF NOT EXISTS "Supplier_businessId_module_idx"
ON "Supplier"("businessId", "module");

CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_businessId_name_module_key"
ON "Supplier"("businessId", "name", "module");

CREATE INDEX IF NOT EXISTS "PurchaseOrder_businessId_module_status_idx"
ON "PurchaseOrder"("businessId", "module", "status");

CREATE INDEX IF NOT EXISTS "GoodsReceipt_businessId_module_createdAt_idx"
ON "GoodsReceipt"("businessId", "module", "createdAt");

CREATE INDEX IF NOT EXISTS "Transfer_businessId_module_status_idx"
ON "Transfer"("businessId", "module", "status");

CREATE INDEX IF NOT EXISTS "Sale_businessId_module_createdAt_idx"
ON "Sale"("businessId", "module", "createdAt");
