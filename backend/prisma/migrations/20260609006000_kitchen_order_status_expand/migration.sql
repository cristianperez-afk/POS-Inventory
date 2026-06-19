-- This is a non-transactional migration.
-- Phase 6: Add PENDING, PREPARING, READY to KitchenOrderStatus (additive-only)
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction in PostgreSQL.
-- Existing behavior is unchanged: POST /kitchen-orders still creates at COMPLETED.

ALTER TYPE "KitchenOrderStatus" ADD VALUE IF NOT EXISTS 'PENDING'   BEFORE 'COMPLETED';
ALTER TYPE "KitchenOrderStatus" ADD VALUE IF NOT EXISTS 'PREPARING' BEFORE 'COMPLETED';
ALTER TYPE "KitchenOrderStatus" ADD VALUE IF NOT EXISTS 'READY'     BEFORE 'COMPLETED';
