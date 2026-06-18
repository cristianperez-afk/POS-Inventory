SELECT
  (SELECT COUNT(*) FROM "GoodsReceipt") AS goods_receipts,
  (SELECT COUNT(*) FROM "PurchaseOrder") AS purchase_orders,
  (SELECT COUNT(*) FROM "PurchaseOrder" WHERE status IN ('RECEIVED', 'PARTIALLY_RECEIVED')) AS received_pos;
