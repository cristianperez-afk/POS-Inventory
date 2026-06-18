-- Phase 2a: Notification model

CREATE TYPE "NotificationType" AS ENUM (
  'LOW_STOCK',
  'EXPIRY_WARNING',
  'EXPIRY_REACHED',
  'BUNDLE_APPROVED',
  'BUNDLE_REJECTED',
  'KITCHEN_ORDER_READY'
);

CREATE TABLE "Notification" (
  "id"         TEXT         NOT NULL,
  "type"       "NotificationType" NOT NULL,
  "title"      TEXT         NOT NULL,
  "message"    TEXT         NOT NULL,
  "isRead"     BOOLEAN      NOT NULL DEFAULT false,
  "readAt"     TIMESTAMP(3),
  "entityType" TEXT,
  "entityId"   TEXT,
  "userId"     TEXT         NOT NULL,
  "businessId" TEXT         NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_isRead_idx"      ON "Notification"("userId", "isRead");
CREATE INDEX "Notification_businessId_createdAt_idx" ON "Notification"("businessId", "createdAt");
CREATE INDEX "Notification_userId_createdAt_idx"   ON "Notification"("userId", "createdAt");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
