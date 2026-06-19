ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RECEIVED';

ALTER TABLE "PurchaseOrder"
ADD COLUMN "expectedDelivery" TIMESTAMP(3);

CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receivedById" TEXT,
    "notes" TEXT,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoodsReceiptItem" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "receivedQty" DOUBLE PRECISION NOT NULL,
    "rejectedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "condition" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoodsReceipt_businessId_receiptNumber_key"
ON "GoodsReceipt"("businessId", "receiptNumber");

CREATE INDEX "GoodsReceipt_businessId_createdAt_idx"
ON "GoodsReceipt"("businessId", "createdAt");

CREATE INDEX "GoodsReceipt_purchaseOrderId_idx"
ON "GoodsReceipt"("purchaseOrderId");

CREATE INDEX "GoodsReceiptItem_goodsReceiptId_idx"
ON "GoodsReceiptItem"("goodsReceiptId");

CREATE INDEX "GoodsReceiptItem_purchaseOrderItemId_idx"
ON "GoodsReceiptItem"("purchaseOrderItemId");

CREATE INDEX "GoodsReceiptItem_inventoryItemId_idx"
ON "GoodsReceiptItem"("inventoryItemId");

ALTER TABLE "GoodsReceipt"
ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey"
FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoodsReceipt"
ADD CONSTRAINT "GoodsReceipt_receivedById_fkey"
FOREIGN KEY ("receivedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GoodsReceipt"
ADD CONSTRAINT "GoodsReceipt_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoodsReceiptItem"
ADD CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey"
FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoodsReceiptItem"
ADD CONSTRAINT "GoodsReceiptItem_purchaseOrderItemId_fkey"
FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoodsReceiptItem"
ADD CONSTRAINT "GoodsReceiptItem_inventoryItemId_fkey"
FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
