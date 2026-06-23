import type { Adjustment, InventoryItem } from '../../../models/retail';
import type { ApiInventoryItem, ApiStockMovement } from '../../../app/api/domainTypes';
import {
  createInventoryItem,
  createStockMovement,
  deleteInventoryItem,
  updateInventoryItem,
} from '../../../app/api/client';
import { isRecentlyAdded } from '../../../app/utils/format';
import { useInventoryQuery, useStockMovementsQuery } from '../domainQueries';
import { formatDate, mapItems, retailQueryKeys, useRetailMutation } from './shared';

export type RetailInventoryItem = InventoryItem & { locationId?: string; isActive?: boolean };
export type RetailInventoryRecord = ApiInventoryItem & { locationId: string };

export const mapRetailInventory = (item: ApiInventoryItem): RetailInventoryItem => ({
  id: item.id,
  name: item.name,
  category: item.category,
  targetCustomer: item.targetCustomer ?? 'Unisex',
  subcategory: item.subcategory ?? 'General',
  size: item.size ?? 'N/A',
  condition: item.condition ?? 'Good',
  quantity: item.quantity,
  price: item.price,
  dateAdded: formatDate(item.dateAdded),
  location: item.location?.name ?? 'Unknown Location',
  locationId: item.locationId,
  isActive: item.isActive ?? true,
  isRecent: isRecentlyAdded(item.createdAt ?? item.dateAdded),
});

export const mapRetailInventoryRecord = (item: ApiInventoryItem): RetailInventoryRecord => ({
  ...item,
  locationId: item.locationId ?? item.location?.id ?? '',
});

export const mapRetailAdjustment = (movement: ApiStockMovement): Adjustment => ({
  id: movement.id,
  adjustmentNumber: movement.referenceId ?? movement.id,
  date: formatDate(movement.createdAt),
  type: movement.newQuantity >= movement.previousQuantity ? 'Add' : 'Remove',
  reason: movement.reason ?? movement.notes ?? 'Inventory adjustment',
  items: [
    {
      itemId: movement.itemId,
      name: movement.item?.name ?? 'Item',
      quantityChange: (movement.newQuantity ?? 0) - (movement.previousQuantity ?? 0),
      location: movement.location?.name ?? '',
    },
  ],
  createdBy: movement.createdBy?.name ?? movement.createdBy?.email ?? '',
  status: 'Approved',
});

export function useRetailInventoryQuery<TData = ReturnType<typeof mapRetailInventory>[]>(
  enabled = true,
  select?: (items: ReturnType<typeof mapRetailInventory>[]) => TData,
) {
  return useInventoryQuery(
    { itemType: 'RETAIL_ITEM' },
    { enabled, select: (items) => mapItems(items, mapRetailInventory, select) },
  );
}

export function useRetailInventoryRecordsQuery<
  TData = ReturnType<typeof mapRetailInventoryRecord>[],
>(
  enabled = true,
  select?: (items: ReturnType<typeof mapRetailInventoryRecord>[]) => TData,
) {
  return useInventoryQuery(
    { itemType: 'RETAIL_ITEM' },
    { enabled, select: (items) => mapItems(items, mapRetailInventoryRecord, select) },
  );
}

export function useRetailAdjustmentsQuery<TData = ReturnType<typeof mapRetailAdjustment>[]>(
  enabled = true,
  select?: (items: ReturnType<typeof mapRetailAdjustment>[]) => TData,
) {
  return useStockMovementsQuery(
    { module: 'RETAIL', type: 'ADJUSTMENT' },
    { enabled, select: (items) => mapItems(items, mapRetailAdjustment, select) },
  );
}

export function useSaveRetailInventoryMutation() {
  return useRetailMutation(
    ({ id, data }: { id?: string; data: Record<string, unknown> }) =>
      id
        ? updateInventoryItem(id, data)
        : createInventoryItem({ ...data, itemType: 'RETAIL_ITEM' }),
    [
      retailQueryKeys.inventory,
      retailQueryKeys.bundles,
      retailQueryKeys.purchaseOrders,
      retailQueryKeys.transfers,
      retailQueryKeys.goodsReceipts,
    ],
  );
}

export function useDeleteRetailInventoryMutation() {
  return useRetailMutation(deleteInventoryItem, [
    retailQueryKeys.inventory,
    retailQueryKeys.bundles,
    retailQueryKeys.purchaseOrders,
    retailQueryKeys.transfers,
    retailQueryKeys.goodsReceipts,
  ]);
}

export function useCreateRetailAdjustmentMutation() {
  return useRetailMutation(
    (data: Record<string, unknown>) =>
      createStockMovement({ ...data, module: 'RETAIL' }),
    [retailQueryKeys.inventory, retailQueryKeys.stockMovements],
  );
}
