import { useQuery } from '@tanstack/react-query';
import type {
  ApiInventoryItem,
  ApiStockMovement,
} from '../../../app/api/domainTypes';
import {
  createInventoryItem,
  createStockMovement,
  deleteInventoryItem,
  getInventory,
  updateInventoryItem,
} from '../../../app/api/client';
import {
  domainQueryKeys,
  useDomainMutation,
  useStockMovementsQuery,
} from '../domainQueries';

const toDateInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

async function getRestaurantInventory() {
  const groups = await Promise.all([
    getInventory({ itemType: 'INGREDIENT' }),
    getInventory({ itemType: 'MENU_ITEM' }),
    getInventory({ itemType: 'SUPPLY' }),
  ]);
  return groups.flat();
}

export function mapRestaurantInventory(items: ApiInventoryItem[]) {
  return items.map((item, index) => ({
    id: index + 1,
    backendId: item.id,
    locationId: item.locationId,
    name: item.name,
    itemType: item.itemType ?? 'INGREDIENT',
    sku: item.sku ?? `REST-${index + 1}`,
    category: item.category?.includes(' > ')
      ? item.category
      : `${item.category || 'Uncategorized'} > ${item.subcategory || 'General'}`,
    stock: item.quantity ?? 0,
    maxStock:
      item.maxStock ??
      Math.max(item.quantity ?? 0, item.reorderPoint ?? 0, 1),
    minStock: item.minStock ?? item.reorderPoint ?? 0,
    reorderPoint: item.reorderPoint ?? item.minStock ?? 0,
    price: item.price ?? 0,
    condition: item.condition ?? 'Good',
    expiry: toDateInput(item.expiryDate),
    location: item.location?.name ?? 'Unassigned',
    unit: item.unit ?? 'pcs',
    storageTemperature: item.storageTemperature ?? 'Dry Storage',
    isActive: item.isActive ?? true,
  }));
}

export function mapRestaurantAdjustments(movements: ApiStockMovement[]) {
  return movements
    .filter((item) => item.type === 'ADJUSTMENT')
    .map((item) => ({
      id: item.id,
      item: item.item?.name ?? 'Item',
      quantity: item.newQuantity,
      unit: item.unit ?? item.item?.unit ?? 'pcs',
      location: item.location?.name ?? '',
      type: 'correction' as const,
      reason: item.reason ?? '',
      adjustedBy: item.createdBy?.email ?? item.createdBy?.name ?? '',
      date: toDateInput(item.createdAt),
      notes: item.notes ?? '',
    }));
}

export function mapRestaurantWaste(movements: ApiStockMovement[]) {
  return movements
    .filter((item) => ['SPOILAGE', 'EXPIRY'].includes(item.type))
    .map((item) => ({
      id: item.id,
      item: item.item?.name ?? 'Item',
      quantity: item.quantity,
      unit: item.unit ?? item.item?.unit ?? 'pcs',
      location: item.location?.name ?? '',
      wasteType: item.type === 'EXPIRY' ? 'expiry' as const : 'spoilage' as const,
      unitCost: item.item?.costPrice ?? item.item?.price ?? 0,
      totalValue:
        item.quantity * (item.item?.costPrice ?? item.item?.price ?? 0),
      date: toDateInput(item.createdAt),
      loggedBy: item.createdBy?.email ?? item.createdBy?.name ?? '',
      source: 'manual' as const,
      notes: item.notes ?? item.reason ?? '',
    }));
}

export function mapRestaurantInventoryMovements(movements: ApiStockMovement[]) {
  return movements.map((item) => {
    const type =
      item.type === 'RECIPE_CONSUMPTION'
        ? 'pos-consumption'
        : item.type === 'VOID_RESTOCK'
          ? 'pos-void'
          : item.type;

    return {
      id: item.id,
      type,
      source: item.referenceType ?? 'shared-backend',
      sourceId: item.referenceId ?? item.id,
      item: item.item?.name ?? 'Item',
      quantity: item.quantity,
      unit: item.unit ?? item.item?.unit ?? '',
      previousQuantity: item.previousQuantity,
      newQuantity: item.newQuantity,
      location: item.location?.name ?? '',
      createdBy: item.createdBy?.email ?? item.createdBy?.name ?? '',
      by: item.createdBy?.email ?? item.createdBy?.name ?? '',
      date: item.createdAt,
      notes: item.notes ?? item.reason ?? '',
      reason: item.reason ?? '',
    };
  });
}

export function useRestaurantInventoryQuery<
  TData = ReturnType<typeof mapRestaurantInventory>,
>(select?: (items: ReturnType<typeof mapRestaurantInventory>) => TData) {
  return useQuery({
    queryKey: [...domainQueryKeys.inventory, { module: 'RESTAURANT' }],
    queryFn: getRestaurantInventory,
    select: (items) => {
      const mapped = mapRestaurantInventory(items);
      return select ? select(mapped) : (mapped as TData);
    },
  });
}

export function useRestaurantAdjustmentsQuery() {
  return useStockMovementsQuery(
    { module: 'RESTAURANT' },
    { select: mapRestaurantAdjustments },
  );
}

export function useRestaurantWasteQuery() {
  return useStockMovementsQuery(
    { module: 'RESTAURANT' },
    { select: mapRestaurantWaste },
  );
}

export function useRestaurantStockMovementsQuery<
  TData = ApiStockMovement[],
>(select?: (items: ApiStockMovement[]) => TData) {
  return useStockMovementsQuery(
    { module: 'RESTAURANT' },
    select ? { select } : undefined,
  );
}

export function useRestaurantInventoryMovementsQuery() {
  return useStockMovementsQuery(
    { module: 'RESTAURANT' },
    { select: mapRestaurantInventoryMovements },
  );
}

export function useCreateRestaurantInventoryMutation() {
  return useDomainMutation(
    (data: Record<string, unknown>) => createInventoryItem(data),
    [domainQueryKeys.inventory, domainQueryKeys.stockMovements],
  );
}

export function useUpdateRestaurantInventoryMutation() {
  return useDomainMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateInventoryItem(id, data),
    [
      domainQueryKeys.inventory,
      domainQueryKeys.purchaseOrders,
      domainQueryKeys.transfers,
    ],
  );
}

export function useDeleteRestaurantInventoryMutation() {
  return useDomainMutation(deleteInventoryItem, [
    domainQueryKeys.inventory,
    domainQueryKeys.purchaseOrders,
    domainQueryKeys.transfers,
  ]);
}

export function useCreateRestaurantStockMovementMutation() {
  return useDomainMutation(
    (data: Record<string, unknown>) =>
      createStockMovement({ ...data, module: 'RESTAURANT' }),
    [domainQueryKeys.stockMovements, domainQueryKeys.inventory],
  );
}

export const restaurantInventoryLoader = getRestaurantInventory;
