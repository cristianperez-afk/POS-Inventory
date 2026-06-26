import type { ProductReceived, PurchaseOrder } from '../../../models/retail';
import type {
  ApiGoodsReceipt,
  ApiPurchaseOrder,
  ApiSupplier,
} from '../../../app/api/domainTypes';
import { useQuery } from '@tanstack/react-query';
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  cancelGoodsReceipt,
  createPurchaseOrder,
  createSupplier,
  getPurchaseOrder,
  receivePurchaseOrder,
  rejectGoodsReceipt,
  rejectPurchaseOrder,
  submitPurchaseOrder,
  updateSupplier,
} from '../../../app/api/client';
import {
  domainQueryKeys,
  useGoodsReceiptsQuery,
  usePurchaseOrdersQuery,
  useSuppliersQuery,
} from '../domainQueries';
import { formatDate, mapItems, retailQueryKeys, useRetailMutation } from './shared';

export type RetailPurchaseOrderRecord = ApiPurchaseOrder & {
  supplier: ApiSupplier | null;
  items: ApiPurchaseOrder['items'];
};

export type RetailSupplierRecord = ApiSupplier;

export const mapRetailPurchaseOrder = (order: ApiPurchaseOrder): PurchaseOrder => ({
  id: order.id,
  orderNumber: order.orderNumber,
  supplier: order.supplier?.name ?? 'Unassigned supplier',
  date: formatDate(order.createdAt),
  status:
    ({
      DRAFT: 'Pending',
      SUBMITTED: 'Pending',
      APPROVED: 'Approved',
      PARTIALLY_RECEIVED: 'Approved',
      RECEIVED: 'Received',
      REJECTED: 'Rejected',
      CANCELLED: 'Cancelled',
    } as Record<string, PurchaseOrder['status']>)[order.status] ?? 'Pending',
  items: order.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    price: item.unitPrice,
  })),
  totalAmount: order.totalAmount ?? 0,
  paymentMethod: order.paymentMethod ?? undefined,
  paymentTerms: order.paymentTerms ?? undefined,
  createdBy: order.createdBy?.name ?? order.createdBy?.email ?? '',
});

export const mapRetailPurchaseOrderRecord = (
  order: ApiPurchaseOrder,
): RetailPurchaseOrderRecord => ({
  ...order,
  items: order.items,
  supplier: order.supplier ?? null,
});

export const mapRetailGoodsReceipt = (receipt: ApiGoodsReceipt): ProductReceived => {
  const items = receipt.items.map((item) => ({
    name: item.purchaseOrderItem?.name ?? item.inventoryItem?.name ?? 'Item',
    orderedQty: item.purchaseOrderItem?.quantity ?? item.receivedQty + item.rejectedQty,
    receivedQty: item.receivedQty + item.rejectedQty,
    acceptedQty: item.receivedQty,
    rejectedQty: item.rejectedQty,
    category: item.inventoryItem?.category ?? 'Uncategorized',
    condition: item.condition ?? 'Good',
    inspectionNotes: item.notes ?? undefined,
    price: item.purchaseOrderItem?.unitPrice ?? 0,
  }));
  const totalAccepted = items.reduce((sum, item) => sum + item.acceptedQty, 0);
  const totalRejected = items.reduce((sum, item) => sum + item.rejectedQty, 0);

  return {
    id: receipt.id,
    receiptNumber: receipt.receiptNumber,
    poNumber: receipt.purchaseOrder?.orderNumber ?? '',
    poId: receipt.purchaseOrderId,
    supplier: receipt.purchaseOrder?.supplier?.name ?? '',
    dateReceived: formatDate(receipt.createdAt),
    receivedDate: formatDate(receipt.createdAt),
    items,
    receivedBy: receipt.receivedBy?.name ?? receipt.receivedBy?.email ?? '',
    status: totalRejected > 0 ? 'Partially Accepted' : 'Fully Accepted',
    totalOrdered: totalAccepted + totalRejected,
    totalAccepted,
    totalRejected,
  };
};

export const mapRetailSupplierRecord = (supplier: ApiSupplier): ApiSupplier => supplier;

export function useRetailPurchaseOrdersQuery<
  TData = ReturnType<typeof mapRetailPurchaseOrder>[],
>(
  params?: { status?: string; supplierId?: string },
  enabled = true,
  select?: (items: ReturnType<typeof mapRetailPurchaseOrder>[]) => TData,
) {
  return usePurchaseOrdersQuery({ module: 'RETAIL', ...params }, {
    enabled,
    select: (items) => mapItems(items, mapRetailPurchaseOrder, select),
  });
}

export function useRetailPurchaseOrderRecordsQuery<
  TData = ReturnType<typeof mapRetailPurchaseOrderRecord>[],
>(
  params?: { status?: string; supplierId?: string },
  enabled = true,
  select?: (items: ReturnType<typeof mapRetailPurchaseOrderRecord>[]) => TData,
) {
  return usePurchaseOrdersQuery({ module: 'RETAIL', ...params }, {
    enabled,
    select: (items) => mapItems(items, mapRetailPurchaseOrderRecord, select),
  });
}

export function useRetailPurchaseOrderDetailQuery(id?: string, enabled = true) {
  return useQuery({
    queryKey: [...domainQueryKeys.purchaseOrders, 'detail', id],
    queryFn: () => getPurchaseOrder(id as string, 'RETAIL').then(mapRetailPurchaseOrderRecord),
    enabled: enabled && Boolean(id),
  });
}

export function useRetailGoodsReceiptsQuery<
  TData = ReturnType<typeof mapRetailGoodsReceipt>[],
>(
  params?: { purchaseOrderId?: string },
  enabled = true,
  select?: (items: ReturnType<typeof mapRetailGoodsReceipt>[]) => TData,
) {
  return useGoodsReceiptsQuery({ module: 'RETAIL', ...params }, {
    enabled,
    select: (items) => mapItems(items, mapRetailGoodsReceipt, select),
  });
}

export function useRetailSuppliersQuery<TData = ApiSupplier[]>(
  params?: { isActive?: boolean; enabled?: boolean },
  select?: (items: ApiSupplier[]) => TData,
) {
  return useSuppliersQuery({ module: 'RETAIL', isActive: params?.isActive ?? true }, {
    enabled: params?.enabled,
    select: (items) => mapItems(items, mapRetailSupplierRecord, select),
  });
}

export function useCreateRetailPurchaseOrderMutation() {
  return useRetailMutation(
    (data: Record<string, unknown>) =>
      createPurchaseOrder({ ...data, module: 'RETAIL' }),
    [retailQueryKeys.purchaseOrders],
  );
}

export function useSubmitRetailPurchaseOrderMutation() {
  return useRetailMutation(
    (id: string) => submitPurchaseOrder(id, 'RETAIL'),
    [retailQueryKeys.purchaseOrders],
  );
}

export function useApproveRetailPurchaseOrderMutation() {
  return useRetailMutation(
    (id: string) => approvePurchaseOrder(id, 'RETAIL'),
    [retailQueryKeys.purchaseOrders],
  );
}

export function useRejectRetailPurchaseOrderMutation() {
  return useRetailMutation(
    ({ id, reason }: { id: string; reason: string }) =>
      rejectPurchaseOrder(id, reason, 'RETAIL'),
    [retailQueryKeys.purchaseOrders],
  );
}

export function useCancelRetailPurchaseOrderMutation() {
  return useRetailMutation(
    (id: string) => cancelPurchaseOrder(id, 'RETAIL'),
    [retailQueryKeys.purchaseOrders],
  );
}

export function useReceiveRetailPurchaseOrderMutation() {
  return useRetailMutation(
    ({
      id,
      items,
      notes,
      proofImages,
    }: {
      id: string;
      items: {
        id: string;
        receivedQty: number;
        rejectedQty: number;
        condition?: string;
        notes?: string;
        expiryDate?: string;
        storageTemperature?: string;
      }[];
      notes?: string;
      proofImages?: string[];
    }) => receivePurchaseOrder(id, items, notes, 'RETAIL', proofImages),
    [
      retailQueryKeys.purchaseOrders,
      retailQueryKeys.inventory,
      retailQueryKeys.goodsReceipts,
    ],
  );
}

export function useRejectRetailGoodsReceiptMutation() {
  return useRetailMutation(
    ({ id, reason, proofImages }: { id: string; reason: string; proofImages?: string[] }) =>
      rejectGoodsReceipt(id, reason, proofImages, 'RETAIL'),
    [retailQueryKeys.purchaseOrders, retailQueryKeys.goodsReceipts],
  );
}

export function useCancelRetailGoodsReceiptMutation() {
  return useRetailMutation(
    ({ id, reason, proofImages }: { id: string; reason: string; proofImages?: string[] }) =>
      cancelGoodsReceipt(id, reason, proofImages, 'RETAIL'),
    [retailQueryKeys.purchaseOrders, retailQueryKeys.goodsReceipts],
  );
}

export function useCreateRetailSupplierMutation() {
  return useRetailMutation(
    (data: Record<string, unknown>) => createSupplier({ ...data, module: 'RETAIL' }),
    [retailQueryKeys.suppliers],
  );
}

export function useUpdateRetailSupplierMutation() {
  return useRetailMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateSupplier(id, data, 'RETAIL'),
    [retailQueryKeys.suppliers, retailQueryKeys.purchaseOrders],
  );
}

export function useArchiveRetailSupplierMutation() {
  return useRetailMutation(
    (id: string) => updateSupplier(id, { isActive: false }, 'RETAIL'),
    [retailQueryKeys.suppliers, retailQueryKeys.purchaseOrders],
  );
}

export function useRestoreRetailSupplierMutation() {
  return useRetailMutation(
    (id: string) => updateSupplier(id, { isActive: true }, 'RETAIL'),
    [retailQueryKeys.suppliers, retailQueryKeys.purchaseOrders],
  );
}
