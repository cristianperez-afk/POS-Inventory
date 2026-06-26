import { useQuery } from '@tanstack/react-query';
import type {
  ApiGoodsReceipt,
  ApiInventoryItem,
  ApiPurchaseOrder,
  ApiSupplier,
} from '../../../app/api/domainTypes';
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  cancelGoodsReceipt,
  createInventoryItem,
  createPurchaseOrder,
  createSupplier,
  getGoodsReceipts,
  getInventory,
  getPurchaseOrders,
  receivePurchaseOrder,
  rejectGoodsReceipt,
  rejectPurchaseOrder,
  submitPurchaseOrder,
  updatePurchaseOrder,
  updateSupplier,
} from '../../../app/api/client';
import {
  domainQueryKeys,
  useDomainMutation,
  useGoodsReceiptsQuery,
  useLocationsQuery,
  usePurchaseOrdersQuery,
  useSuppliersQuery,
} from '../domainQueries';
import { useRestaurantProductMergeMetadataQuery } from './shared';
import { toDateTimeLocalInput } from '../purchaseOrderDelivery';

type RestaurantProductMergeMetadata = {
  aliases?: Record<string, string>;
  overrides?: Record<
    string,
    {
      name?: string;
      category?: string;
      subCategory?: string;
      unit?: string;
      sku?: string;
    }
  >;
};

type ReceiptItemQualityMetadata = {
  remarks?: string;
  expiryDate?: string;
  expiryPeriod?: string;
  storageTemperature?: string;
  qualityCriteria?: Array<{ key: string; label: string }>;
  qualityScores?: Record<string, { passed: number; total: number; remarks?: string }>;
};

function parseReceiptItemNotes(notes?: string | null): ReceiptItemQualityMetadata {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes) as ReceiptItemQualityMetadata;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return { remarks: notes };
  }
  return { remarks: notes };
}

const toDateInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const formatActorName = (actor: any) =>
  actor?.name ?? actor?.full_name ?? actor?.fullName ?? actor?.email ?? '';

export function mapRestaurantPurchaseOrders(orders: ApiPurchaseOrder[]) {
  return orders.map((order) => ({
    id: order.id,
    backendId: order.id,
    supplier: order.supplier?.name ?? '',
    supplierId: order.supplierId,
    date: toDateInput(order.createdAt),
    items: order.items?.length ?? 0,
    orderItems: (order.items ?? []).map((item) => ({
      backendId: item.id,
      productId: item.inventoryItemId,
      backendInventoryId: item.inventoryItemId,
      productName: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      category: item.inventoryItem?.category ?? '',
      subCategory: item.inventoryItem?.subcategory ?? '',
      unit: item.inventoryItem?.unit ?? 'pcs',
    })),
    total: order.totalAmount,
    status:
      ({
        DRAFT: 'pending',
        SUBMITTED: 'pending',
        APPROVED: 'approved',
        PARTIALLY_RECEIVED: 'partial',
        RECEIVED: 'received',
        REJECTED: 'rejected',
        CANCELLED: 'cancelled',
      } as Record<string, string>)[order.status] ?? order.status.toLowerCase(),
    expectedDelivery: toDateTimeLocalInput(order.expectedDelivery),
    createdBy: order.createdBy?.email ?? order.createdBy?.name ?? '',
    createdAt: order.createdAt,
    rejectionNote: order.rejectionReason,
    backendStatus: order.status,
  }));
}

export function mapRestaurantSuppliers(suppliers: ApiSupplier[]) {
  return suppliers.map((supplier) => ({
    id: supplier.id,
    backendId: supplier.id,
    name: supplier.name,
    contact: supplier.contactPerson ?? '',
    email: supplier.email ?? '',
    phone: supplier.phone ?? '',
    address: supplier.address ?? '',
    products: [],
  }));
}

const normalizeCatalogKey = (value: string | undefined) =>
  (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const splitCatalogCategory = (value?: string | null) => {
  const [category = 'Other', subCategory = 'General'] = (value || '').split(' > ');
  return { category, subCategory };
};

export function mapRestaurantGlobalProducts(
  inventory: ApiInventoryItem[],
  metadata: RestaurantProductMergeMetadata = {},
) {
  const products = new Map<
    string,
    {
      id: string;
      backendId?: string;
      inventoryId?: number;
      name: string;
      sku?: string;
      category?: string;
      subCategory?: string;
      unit?: string;
    }
  >();

  inventory.forEach((item, index) => {
    const sourceKey = normalizeCatalogKey(item.name);
    const canonicalKey = metadata.aliases?.[sourceKey] ?? sourceKey;
    const override = metadata.overrides?.[canonicalKey];
    const { category, subCategory } = splitCatalogCategory(
      override?.category
        ? `${override.category}${override.subCategory ? ` > ${override.subCategory}` : ''}`
        : item.category,
    );

    if (!products.has(canonicalKey)) {
      products.set(canonicalKey, {
        id: item.id,
        backendId: item.id,
        inventoryId: index + 1,
        name: override?.name ?? item.name,
        sku: override?.sku ?? item.sku ?? undefined,
        category,
        subCategory,
        unit: override?.unit ?? item.unit ?? 'pcs',
      });
    }
  });

  return Array.from(products.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function useRestaurantPurchaseOrdersQuery<
  TData = ReturnType<typeof mapRestaurantPurchaseOrders>,
>(select?: (orders: ReturnType<typeof mapRestaurantPurchaseOrders>) => TData) {
  return usePurchaseOrdersQuery(
    { module: 'RESTAURANT' },
    {
      select: (orders) => {
        const mapped = mapRestaurantPurchaseOrders(orders);
        return select ? select(mapped) : (mapped as TData);
      },
    },
  );
}

export function useRestaurantSuppliersQuery(params?: { isActive?: boolean; enabled?: boolean }) {
  return useSuppliersQuery(
    { module: 'RESTAURANT', isActive: params?.isActive ?? true },
    { enabled: params?.enabled, select: mapRestaurantSuppliers },
  );
}

export function useRestaurantGlobalProductsQuery() {
  const metadataQuery =
    useRestaurantProductMergeMetadataQuery<RestaurantProductMergeMetadata>();

  return useQuery({
    queryKey: [
      ...domainQueryKeys.inventory,
      { module: 'RESTAURANT', view: 'global-products' },
      metadataQuery.data ?? {},
    ],
    queryFn: async () => {
      // Purchase orders cover raw ingredients and supplies only — finished
      // MENU_ITEM dishes are not orderable through inventory.
      const groups = await Promise.all([
        getInventory({ itemType: 'INGREDIENT' }),
        getInventory({ itemType: 'SUPPLY' }),
      ]);
      return groups.flat();
    },
    enabled: metadataQuery.isSuccess,
    select: (items) =>
      mapRestaurantGlobalProducts(items, metadataQuery.data ?? {}),
  });
}

export function useRestaurantGoodsReceiptsQuery<
  TData = ApiGoodsReceipt[],
>(select?: (receipts: ApiGoodsReceipt[]) => TData) {
  return useGoodsReceiptsQuery(
    { module: 'RESTAURANT' },
    { select: select ?? ((receipts) => receipts as TData) },
  );
}

export function useRestaurantGoodsRecordsQuery() {
  return useQuery({
    queryKey: [
      ...domainQueryKeys.goodsReceipts,
      { module: 'RESTAURANT', includePending: true },
    ],
    queryFn: async () => {
      const [receipts, orders] = await Promise.all([
        getGoodsReceipts({ module: 'RESTAURANT' }),
        getPurchaseOrders({ module: 'RESTAURANT' }),
      ]);
      const purchaseOrderNumberById = new Map(orders.map((order) => [order.id, order.orderNumber]));
      const purchaseOrderById = new Map(orders.map((order) => [order.id, order]));
      const purchaseOrderItemNameById = new Map(
        orders.flatMap((order) => (order.items ?? []).map((item) => [item.id, item.name] as const)),
      );
      const received = receipts.map((receipt) => ({
        id: receipt.receiptNumber,
        backendId: receipt.id,
        poId: receipt.purchaseOrderId,
        poNumber: purchaseOrderNumberById.get(receipt.purchaseOrderId) ?? receipt.purchaseOrder?.orderNumber ?? receipt.purchaseOrderId,
        supplier:
          receipt.purchaseOrder?.supplier?.name ??
          purchaseOrderById.get(receipt.purchaseOrderId)?.supplier?.name ??
          '',
        receivedDate: toDateInput(receipt.createdAt),
        receivedAt: receipt.createdAt,
        items: receipt.items?.length ?? 0,
        receivedItems: (receipt.items ?? []).map((line) => {
          const quality = parseReceiptItemNotes(line.notes);
          return {
            backendItemId: line.id,
            productName:
              line.purchaseOrderItem?.name ??
              line.inventoryItem?.name ??
              purchaseOrderItemNameById.get(line.purchaseOrderItemId) ??
              'Item',
            category:
              line.category ??
              line.inventoryItem?.category ??
              line.purchaseOrderItem?.category ??
              '',
            quantity: line.receivedQty + line.rejectedQty,
            acceptedQuantity: line.receivedQty,
            rejectedQuantity: line.rejectedQty,
            unit: line.inventoryItem?.unit ?? 'pcs',
            unitPrice: line.purchaseOrderItem?.unitPrice ?? 0,
            expiryDate: toDateInput(quality.expiryDate ?? line.inventoryItem?.expiryDate),
            expiryPeriod: quality.expiryPeriod ?? '',
            storageTemperature: quality.storageTemperature ?? line.inventoryItem?.storageTemperature ?? '',
            condition: line.condition ?? 'Inspected',
            qualityRemarks: quality.remarks ?? '',
            qualityCriteria: quality.qualityCriteria,
            qualityScores: quality.qualityScores,
            qualityStatus:
              line.receivedQty <= 0
                ? 'rejected'
                : line.rejectedQty > 0
                  ? 'partial'
                  : 'accepted',
          };
        }),
        totalValue: (receipt.items ?? []).reduce(
          (sum, line) =>
            sum +
            line.receivedQty * (line.purchaseOrderItem?.unitPrice ?? 0),
          0,
        ),
        receivedBy: formatActorName(receipt.receivedBy),
        status:
          receipt.status === 'REJECTED'
            ? 'rejected'
            : receipt.status === 'CANCELLED'
              ? 'cancelled'
              : (receipt.items ?? []).some((line) => line.rejectedQty > 0)
                ? 'partial'
                : 'verified',
        actionReason: receipt.actionReason ?? receipt.notes ?? '',
        proofImages: receipt.proofImages ?? [],
        notes: receipt.notes ?? '',
      }));
      const pending = orders
        .filter(
          (order) =>
            ['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status) &&
            (order.items ?? []).some(
              (item) =>
                item.receivedQty + item.rejectedQty < item.quantity,
            ),
        )
        .map((order) => ({
          id: `GR-${order.orderNumber}`,
          backendId: order.id,
          poId: order.id,
          supplier: order.supplier?.name ?? '',
          receivedDate: toDateInput(
            order.expectedDelivery ?? order.createdAt,
          ),
          items: order.items?.length ?? 0,
          receivedItems: (order.items ?? []).map((item) => ({
            backendItemId: item.id,
            productName: item.name,
            quantity: item.quantity - item.receivedQty - item.rejectedQty,
            unit: item.inventoryItem?.unit ?? 'pcs',
            unitPrice: item.unitPrice,
            condition: 'Pending Check',
          })),
          totalValue: order.totalAmount,
          receivedBy: '',
          status: 'pending',
          notes: 'Approved PO. Awaiting goods receipt and quality check.',
        }));
      return [...pending, ...received];
    },
  });
}

export function useCreateRestaurantPurchaseOrderMutation() {
  return useDomainMutation(
    (data: Record<string, unknown>) =>
      createPurchaseOrder({ ...data, module: 'RESTAURANT' }),
    [domainQueryKeys.purchaseOrders, domainQueryKeys.suppliers],
  );
}

type SaveRestaurantPurchaseOrderLine = {
  productId?: string;
  inventoryId?: string | number;
  sku?: string;
  productName: string;
  category?: string;
  subCategory?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
};

type RestaurantPurchaseOrderProduct = {
  id: string;
  backendId?: string;
  inventoryId?: string | number;
};

export function useSaveRestaurantPurchaseOrderMutation() {
  const locationsQuery = useLocationsQuery();

  return useDomainMutation(
    async ({
      editingId,
      supplierId,
      expectedDelivery,
      items,
      products,
    }: {
      editingId?: string;
      supplierId: string;
      expectedDelivery?: string;
      items: SaveRestaurantPurchaseOrderLine[];
      products: RestaurantPurchaseOrderProduct[];
    }) => {
      const location = locationsQuery.data?.[0];
      if (!location) {
        throw new Error('Create a location before ordering a new product');
      }

      const apiItems = [];
      for (const line of items) {
        const product = products.find(
          (item) =>
            item.id === line.productId ||
            item.inventoryId === line.inventoryId,
        );
        let inventoryItemId =
          product?.backendId ??
          (product?.id &&
          !product.id.startsWith('gp-') &&
          !product.id.startsWith('inv-')
            ? product.id
            : undefined);

        if (!inventoryItemId) {
          const created = await createInventoryItem({
            name: line.productName,
            itemType: 'INGREDIENT',
            sku: line.sku || undefined,
            category: `${line.category || 'Other'} > ${line.subCategory || 'General'}`,
            quantity: 0,
            price: line.unitPrice,
            unit: line.unit || 'pcs',
            minStock: 0,
            maxStock: 0,
            reorderPoint: 0,
            locationId: location.id,
          });
          inventoryItemId = created.id;
        }

        apiItems.push({
          inventoryItemId,
          name: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        });
      }

      const payload = {
        supplierId,
        expectedDelivery: expectedDelivery
          ? new Date(expectedDelivery).toISOString()
          : undefined,
        items: apiItems,
        module: 'RESTAURANT',
      };

      if (editingId) {
        return updatePurchaseOrder(editingId, payload, 'RESTAURANT');
      }
      const created = await createPurchaseOrder(payload);
      return submitPurchaseOrder(created.id, 'RESTAURANT');
    },
    // restaurantSettings: auto-created PO line items may add CATEGORY_HIERARCHY entries.
    [domainQueryKeys.purchaseOrders, domainQueryKeys.inventory, domainQueryKeys.restaurantSettings],
  );
}

export function useUpdateRestaurantPurchaseOrderMutation() {
  return useDomainMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updatePurchaseOrder(id, data, 'RESTAURANT'),
    [domainQueryKeys.purchaseOrders],
  );
}

export function useSubmitRestaurantPurchaseOrderMutation() {
  return useDomainMutation(
    (id: string) => submitPurchaseOrder(id, 'RESTAURANT'),
    [domainQueryKeys.purchaseOrders],
  );
}

export function useApproveRestaurantPurchaseOrderMutation() {
  return useDomainMutation(
    (id: string) => approvePurchaseOrder(id, 'RESTAURANT'),
    [domainQueryKeys.purchaseOrders, domainQueryKeys.goodsReceipts],
  );
}

export function useRejectRestaurantPurchaseOrderMutation() {
  return useDomainMutation(
    ({ id, reason }: { id: string; reason: string }) =>
      rejectPurchaseOrder(id, reason, 'RESTAURANT'),
    [domainQueryKeys.purchaseOrders],
  );
}

export function useCancelRestaurantPurchaseOrderMutation() {
  return useDomainMutation(
    (id: string) => cancelPurchaseOrder(id, 'RESTAURANT'),
    [domainQueryKeys.purchaseOrders],
  );
}

export function useReceiveRestaurantPurchaseOrderMutation() {
  return useDomainMutation(
    ({
      id,
      items,
      notes,
      proofImages,
    }: {
      id: string;
      items: Parameters<typeof receivePurchaseOrder>[1];
      notes?: string;
      proofImages?: string[];
    }) => receivePurchaseOrder(id, items, notes, 'RESTAURANT', proofImages),
    [
      domainQueryKeys.purchaseOrders,
      domainQueryKeys.goodsReceipts,
      domainQueryKeys.inventory,
      domainQueryKeys.stockMovements,
    ],
  );
}

export function useRejectRestaurantGoodsReceiptMutation() {
  return useDomainMutation(
    ({ id, reason, proofImages }: { id: string; reason: string; proofImages?: string[] }) =>
      rejectGoodsReceipt(id, reason, proofImages, 'RESTAURANT'),
    [domainQueryKeys.purchaseOrders, domainQueryKeys.goodsReceipts],
  );
}

export function useCancelRestaurantGoodsReceiptMutation() {
  return useDomainMutation(
    ({ id, reason, proofImages }: { id: string; reason: string; proofImages?: string[] }) =>
      cancelGoodsReceipt(id, reason, proofImages, 'RESTAURANT'),
    [domainQueryKeys.purchaseOrders, domainQueryKeys.goodsReceipts],
  );
}

export function useCreateRestaurantSupplierMutation() {
  return useDomainMutation(
    (data: Record<string, unknown>) =>
      createSupplier({ ...data, module: 'RESTAURANT' }),
    [domainQueryKeys.suppliers, domainQueryKeys.purchaseOrders],
  );
}

export function useUpdateRestaurantSupplierMutation() {
  return useDomainMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateSupplier(id, data, 'RESTAURANT'),
    [domainQueryKeys.suppliers, domainQueryKeys.purchaseOrders],
  );
}

export function useArchiveRestaurantSupplierMutation() {
  return useDomainMutation(
    (id: string) => updateSupplier(id, { isActive: false }, 'RESTAURANT'),
    [domainQueryKeys.suppliers, domainQueryKeys.purchaseOrders],
  );
}

export function useRestoreRestaurantSupplierMutation() {
  return useDomainMutation(
    (id: string) => updateSupplier(id, { isActive: true }, 'RESTAURANT'),
    [domainQueryKeys.suppliers, domainQueryKeys.purchaseOrders],
  );
}
