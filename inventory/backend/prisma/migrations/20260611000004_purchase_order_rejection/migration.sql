ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "PurchaseOrder"
ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "rejectedAt" TIMESTAMP(3);
