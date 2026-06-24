CREATE TYPE "GoodsReceiptStatus" AS ENUM ('RECEIVED', 'REJECTED', 'CANCELLED');

ALTER TABLE "GoodsReceipt"
ADD COLUMN "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
ADD COLUMN "actionReason" TEXT,
ADD COLUMN "proofImages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "GoodsReceipt_businessId_status_idx"
ON "GoodsReceipt"("businessId", "status");
