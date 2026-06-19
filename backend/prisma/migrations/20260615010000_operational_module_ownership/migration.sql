ALTER TABLE "StockMovement"
ADD COLUMN "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

ALTER TABLE "Supplier"
ADD COLUMN "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

ALTER TABLE "PurchaseOrder"
ADD COLUMN "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

ALTER TABLE "GoodsReceipt"
ADD COLUMN "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

ALTER TABLE "Transfer"
ADD COLUMN "module" "BusinessModule" NOT NULL DEFAULT 'RETAIL';

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

CREATE INDEX "StockMovement_businessId_module_createdAt_idx"
ON "StockMovement"("businessId", "module", "createdAt");

CREATE INDEX "Supplier_businessId_module_idx"
ON "Supplier"("businessId", "module");

CREATE INDEX "PurchaseOrder_businessId_module_status_idx"
ON "PurchaseOrder"("businessId", "module", "status");

CREATE INDEX "GoodsReceipt_businessId_module_createdAt_idx"
ON "GoodsReceipt"("businessId", "module", "createdAt");

CREATE INDEX "Transfer_businessId_module_status_idx"
ON "Transfer"("businessId", "module", "status");
