import type {
  ApiKitchenOrder,
  ApiRecipe,
} from '../../../app/api/domainTypes';
import {
  completeKitchenOrder,
  createRecipe,
  deleteRecipe,
  restoreRecipe,
  updateRecipe,
  updateKitchenOrderStatus,
  voidKitchenOrder,
} from '../../../app/api/client';
import {
  domainQueryKeys,
  useDomainMutation,
  useKitchenOrdersQuery,
  useRecipesQuery,
} from '../domainQueries';

const parseOrderModifiers = (notes?: string | null) => {
  const modifierText = notes?.match(/Modifiers:\s*([^|]+)/i)?.[1]?.trim();
  return modifierText ? modifierText.split(',').map((item) => item.trim()).filter(Boolean) : [];
};

const isExpiredDate = (value?: string | null) => {
  if (!value) return false;
  const expiryDate = new Date(value);
  if (Number.isNaN(expiryDate.getTime())) return false;
  expiryDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiryDate < today;
};

const calculateAvailableOrders = (
  ingredients: {
    inventoryQuantity?: number;
    quantity: number;
    inventoryStock?: number;
    inventoryUsableStock?: number;
    inventoryExpiry?: string | null;
  }[],
) => {
  if (ingredients.length === 0) return 0;
  const values = ingredients.map((ingredient) => {
    const required = Number(ingredient.inventoryQuantity ?? ingredient.quantity);
    const stock = ingredient.inventoryUsableStock != null
      ? Number(ingredient.inventoryUsableStock)
      : isExpiredDate(ingredient.inventoryExpiry)
      ? 0
      : Number(ingredient.inventoryStock ?? 0);
    if (!Number.isFinite(required) || required <= 0) return 0;
    return Math.max(0, Math.floor(stock / required));
  });
  return Math.min(...values);
};

export function useRestaurantRecipesQuery(params?: { archived?: boolean }) {
  return useRecipesQuery(params, {
    select: (recipes) =>
      recipes.map((recipe: ApiRecipe) => {
        const ingredients = (recipe.ingredients ?? []).map((ingredient) => ({
          id: ingredient.id,
          productId: ingredient.itemId,
          itemBackendId: ingredient.itemId,
          backendItemId: ingredient.itemId,
          productSku: ingredient.item?.sku ?? undefined,
          name: ingredient.item?.name ?? 'Ingredient',
          quantity: ingredient.quantity,
          unit: ingredient.unit ?? ingredient.item?.unit ?? 'pcs',
          inventoryQuantity: ingredient.quantity,
          inventoryUnit: ingredient.item?.unit ?? ingredient.unit ?? 'pcs',
          inventoryStock: Number(ingredient.physicalStock ?? ingredient.item?.quantity ?? 0),
          inventoryUsableStock: Number(
            ingredient.usableStock ??
            (isExpiredDate(ingredient.item?.expiryDate) ? 0 : ingredient.item?.quantity ?? 0),
          ),
          inventoryExpiry: ingredient.item?.expiryDate ?? null,
          stockStatus: ingredient.stockStatus ?? (isExpiredDate(ingredient.item?.expiryDate) ? 'expired' : 'available'),
          unitCost: ingredient.unitCost ?? ingredient.item?.price ?? 0,
          totalCost:
            (ingredient.unitCost ?? ingredient.item?.price ?? 0) *
            ingredient.quantity,
        }));
        const totalCost = ingredients.reduce(
          (sum, ingredient) => sum + ingredient.totalCost,
          0,
        );
        return {
          id: recipe.id,
          backendId: recipe.id,
          name: recipe.name,
          description: (recipe as any).description ?? (recipe as any).menuItem?.description ?? '',
          imageUrl: (recipe as any).imageUrl ?? (recipe as any).menuItem?.imageUrl ?? '',
          menuItem: (recipe as any).menuItem ?? null,
          category: recipe.category,
          servings: recipe.servings,
          yieldPercentage: recipe.yieldPercentage ?? 100,
          prepTime: recipe.prepTimeMinutes ?? 0,
          ingredients,
          totalCost,
          yieldAdjustedCost: totalCost,
          costPerServing: totalCost / Math.max(recipe.servings ?? 1, 1),
          targetFoodCost: recipe.targetFoodCost ?? 35,
          suggestedSellingPrice: recipe.sellingPrice ?? 0,
          sellingPrice: recipe.sellingPrice ?? 0,
          grossMargin: 0,
          isActive: recipe.isActive,
          availableOrders: calculateAvailableOrders(ingredients),
          archivedAt: recipe.archivedAt ?? null,
          modifiers: Array.isArray((recipe as any).modifiers)
            ? (recipe as any).modifiers.filter((modifier: any) => modifier?.type !== 'size_variant').map((modifier: any) => ({
                id: modifier.id,
                name: modifier.name,
                group: modifier.group ?? 'Modifiers',
                type: modifier.type ?? 'remove',
                itemId: modifier.itemId,
                itemName: modifier.itemName ?? '',
                productId: modifier.itemId,
                requiresStock: Boolean(modifier.requiresStock),
                quantity: Number(modifier.quantity ?? 1),
                unit: modifier.unit,
                maxQuantity: Number.isInteger(Number(modifier.maxQuantity)) && Number(modifier.maxQuantity) > 0
                  ? Math.floor(Number(modifier.maxQuantity))
                  : undefined,
                levelPercent: modifier.levelPercent == null ? undefined : Number(modifier.levelPercent),
                sizeMultiplier: modifier.sizeMultiplier == null ? undefined : Number(modifier.sizeMultiplier),
                sellingPrice: modifier.sellingPrice == null ? undefined : Number(modifier.sellingPrice),
                ingredientQuantities: modifier.ingredientQuantities && typeof modifier.ingredientQuantities === 'object'
                  ? modifier.ingredientQuantities
                  : undefined,
                priceDelta: Number(modifier.priceDelta ?? 0),
                priceDeltaPercent: Number(modifier.priceDeltaPercent ?? 0),
              }))
            : [],
          sizeVariants: (Array.isArray((recipe as any).sizeVariants)
            ? (recipe as any).sizeVariants
            : Array.isArray((recipe as any).modifiers)
              ? (recipe as any).modifiers.filter((modifier: any) => modifier?.type === 'size_variant')
              : []).map((variant: any) => ({
                id: String(variant.id),
                name: String(variant.name),
                group: 'Size Variants',
                type: 'size_variant' as const,
                sizeMultiplier: Number(variant.sizeMultiplier ?? 1),
                sellingPrice: Number(variant.sellingPrice ?? 0),
                ingredientQuantities: variant.ingredientQuantities && typeof variant.ingredientQuantities === 'object'
                  && Object.keys(variant.ingredientQuantities).length > 0
                  ? variant.ingredientQuantities
                  : Object.fromEntries(ingredients.map((ingredient) => [
                      String(ingredient.itemBackendId),
                      Number(ingredient.inventoryQuantity ?? ingredient.quantity) * Number(variant.sizeMultiplier ?? 1),
                    ])),
                priceDelta: Number(variant.priceDelta ?? (Number(variant.sellingPrice ?? 0) - Number(recipe.sellingPrice ?? 0))),
                priceDeltaPercent: 0,
              })),
          instructions: recipe.instructions ?? '',
        };
      }),
  });
}

export function useRestaurantKitchenOrdersQuery() {
  return useKitchenOrdersQuery(undefined, {
    select: (orders) =>
      orders.map((order: ApiKitchenOrder) => ({
        id: order.id,
        orderNumber: order.orderNumber ?? order.sale?.transactionNumber ?? order.receiptNo,
        receiptNo: order.receiptNo,
        customerName: order.customerName ?? 'Walk-in Customer',
        orderType: order.orderType ?? 'DINE_IN',
        tableNumber: order.tableNumber ?? order.table?.tableNumber ?? '',
        itemCount: order.itemCount ?? order.items?.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0) ?? order.quantity,
        paymentStatus: order.paymentStatus ?? 'NOT_PAID',
        totalAmount: Number(order.totalAmount ?? 0),
        recipeId: order.recipeId,
        recipeName: order.recipe?.name ?? 'Recipe',
        quantity: order.quantity,
        status: getRestaurantKitchenStatus(order),
        orderedAt: order.orderedAt ?? '',
        createdAt: order.createdAt ?? null,
        updatedAt: order.updatedAt ?? order.createdAt,
        paymentAt: order.paymentAt ?? null,
        preparingStartedAt: order.preparingStartedAt ?? null,
        readyAt: order.readyAt ?? null,
        servedAt: order.servedAt ?? null,
        serviceDuration: order.serviceDuration ?? null,
        estimatedPrepMinutes: Number(order.estimatedPrepMinutes ?? 0),
        estimatedReadyAt: order.estimatedReadyAt ?? null,
        completedAt: order.completedAt ?? null,
        tableStartedAt: order.stayStartedAt ?? order.tableStartedAt ?? null,
        tableEndedAt: order.stayEndedAt ?? order.tableEndedAt ?? null,
        runningTimeStart: order.runningTimeStart ?? null,
        runningTimeEnd: order.runningTimeEnd ?? null,
        runningDuration: order.runningDuration ?? null,
        isRunning: order.isRunning ?? null,
        completedBy: order.completedBy?.email ?? 'shared-backend',
        notes: order.notes ?? '',
        modifiers: parseOrderModifiers(order.notes),
        items: order.items?.length
          ? order.items.map((item) => ({
              id: String(item.id),
              name: item.name,
              quantity: Number(item.quantity ?? 0),
              notes: item.notes ?? '',
              price: Number((item as any).price ?? 0),
              prepTimeMinutes: Number((item as any).prepTimeMinutes ?? (item as any).preparationTimeMinutes ?? 0),
              ingredients: (item as any).ingredients ?? [],
              addedIngredients: item.addedIngredients ?? [],
              removedIngredients: item.removedIngredients ?? [],
              changedIngredients: (item as any).changedIngredients ?? [],
              replacedIngredients: (item as any).replacedIngredients ?? [],
              modifiers: item.modifiers ?? [],
              specialInstructions: item.specialInstructions ?? [],
            }))
          : [{
              id: order.id,
              name: order.recipe?.name ?? 'Recipe',
              quantity: Number(order.quantity ?? 0),
              notes: order.notes ?? '',
              addedIngredients: [],
              removedIngredients: [],
              changedIngredients: [],
              modifiers: parseOrderModifiers(order.notes),
              specialInstructions: order.notes ? [order.notes] : [],
            }],
        voidReason: order.voidReason,
        voidedAt: order.voidedAt,
      })),
  });
}

function getRestaurantKitchenStatus(order: ApiKitchenOrder) {
  const status = String(order.status ?? '').toUpperCase();
  if (status === 'VOIDED') return 'cancelled';
  if (status === 'COMPLETED' && order.servedAt) return 'served';
  return status.toLowerCase();
}

export function useCreateRestaurantRecipeMutation() {
  return useDomainMutation(createRecipe, [domainQueryKeys.recipes]);
}

export function useUpdateRestaurantRecipeMutation() {
  return useDomainMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateRecipe(id, data),
    [domainQueryKeys.recipes],
  );
}

export function useDeleteRestaurantRecipeMutation() {
  return useDomainMutation(
    ({ id, permanent }: { id: string; permanent?: boolean }) =>
      deleteRecipe(id, permanent ?? false),
    [domainQueryKeys.recipes],
  );
}

export function useRestoreRestaurantRecipeMutation() {
  return useDomainMutation(restoreRecipe, [domainQueryKeys.recipes]);
}

export function useSaveRestaurantRecipeMutation() {
  return useDomainMutation(
    ({ id, data }: { id?: string; data: Record<string, unknown> }) =>
      id ? updateRecipe(id, data) : createRecipe(data),
    [domainQueryKeys.recipes],
  );
}

export function useCompleteRestaurantKitchenOrderMutation() {
  return useDomainMutation(completeKitchenOrder, [
    domainQueryKeys.kitchenOrders,
    domainQueryKeys.inventory,
  ]);
}

export function useVoidRestaurantKitchenOrderMutation() {
  return useDomainMutation(
    ({ id, reason }: { id: string; reason: string }) =>
      voidKitchenOrder(id, reason),
    [
      domainQueryKeys.kitchenOrders,
      domainQueryKeys.inventory,
      domainQueryKeys.stockMovements,
    ],
  );
}

export function useUpdateRestaurantKitchenOrderStatusMutation() {
  return useDomainMutation(
    ({ id, status }: { id: string; status: ApiKitchenOrder['status'] }) =>
      updateKitchenOrderStatus(id, status),
    [domainQueryKeys.kitchenOrders],
  );
}
