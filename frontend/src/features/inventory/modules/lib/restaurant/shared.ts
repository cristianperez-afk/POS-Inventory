import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RestaurantSettingKey } from '../../../app/api/client';
import {
  getGoodsReceipts,
  getPurchaseOrders,
  getRestaurantSettings,
  getStockMovements,
  getSuppliers,
  getTransfers,
  getUsers,
  upsertRestaurantSetting,
} from '../../../app/api/client';
import {
  domainQueryKeys,
  useRestaurantSettingsQuery,
} from '../domainQueries';
import {
  defaultCategoryHierarchy,
  defaultStorageTemperatureOptions,
} from '../inventoryLogic';
import { restaurantInventoryLoader } from './inventoryQueries';

export const restaurantQueryLoaders = {
  inventory: restaurantInventoryLoader,
  purchaseOrders: () => getPurchaseOrders({ module: 'RESTAURANT' }),
  goodsReceipts: () => getGoodsReceipts({ module: 'RESTAURANT' }),
  suppliers: () => getSuppliers({ module: 'RESTAURANT' }),
  transfers: () => getTransfers({ module: 'RESTAURANT' }),
  stockMovements: () => getStockMovements({ module: 'RESTAURANT' }),
  users: getUsers,
};

type CategoryHierarchy = Record<string, string[]>;

const legacySettingKeyByRestaurantSetting: Record<
  Extract<
    RestaurantSettingKey,
    'CATEGORY_HIERARCHY' | 'STORAGE_TEMPERATURE_OPTIONS'
  >,
  string
> = {
  CATEGORY_HIERARCHY: 'inventory.categoryHierarchy',
  STORAGE_TEMPERATURE_OPTIONS: 'inventory.storageTemperatureOptions',
};

function mergeCategoryHierarchy(value: unknown): CategoryHierarchy {
  const custom =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as CategoryHierarchy)
      : {};

  const customEntries = Object.entries(custom).filter(([, subCategories]) =>
    Array.isArray(subCategories),
  );

  if (customEntries.length === 0) {
    return { ...defaultCategoryHierarchy };
  }

  return customEntries.reduce(
    (hierarchy, [category, subCategories]) => ({
      ...hierarchy,
      [category]: Array.from(
        new Set([
          ...(Array.isArray(subCategories) ? subCategories.filter(Boolean) : []),
        ]),
      ),
    }),
    {} as CategoryHierarchy,
  );
}

function mergeStorageTemperatureOptions(value: unknown) {
  const custom = Array.isArray(value) ? value.filter(Boolean) : [];
  return Array.from(
    new Set([...defaultStorageTemperatureOptions, ...custom].filter(Boolean)),
  );
}

function findSettingValue(
  settings: Awaited<ReturnType<typeof getRestaurantSettings>>,
  key: RestaurantSettingKey,
) {
  return settings.find((setting) => setting.key === key)?.value;
}

export function useRestaurantSettings() {
  return useRestaurantSettingsQuery();
}

export function useRestaurantCategoryHierarchyQuery() {
  return useRestaurantSettingsQuery({
    select: (settings) =>
      mergeCategoryHierarchy(findSettingValue(settings, 'CATEGORY_HIERARCHY')),
  });
}

export function useRestaurantStorageTemperatureOptionsQuery() {
  return useRestaurantSettingsQuery({
    select: (settings) =>
      mergeStorageTemperatureOptions(
        findSettingValue(settings, 'STORAGE_TEMPERATURE_OPTIONS'),
      ),
  });
}

export function useRestaurantProductMergeMetadataQuery<
  TData = Record<string, unknown>,
>() {
  return useRestaurantSettingsQuery({
    select: (settings) =>
      (findSettingValue(settings, 'PRODUCT_MERGE_METADATA') ?? {}) as TData,
  });
}

export function useUpsertRestaurantSettingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      key,
      value,
    }: {
      key: Parameters<typeof upsertRestaurantSetting>[0];
      value: unknown;
    }) => upsertRestaurantSetting(key, value),
    onSuccess: async (setting, variables) => {
      queryClient.setQueryData<
        Awaited<ReturnType<typeof getRestaurantSettings>>
      >(domainQueryKeys.restaurantSettings, (current = []) => {
        const others = current.filter((item) => item.key !== setting.key);
        return [...others, setting].sort((a, b) => a.key.localeCompare(b.key));
      });

      if (
        variables.key === 'CATEGORY_HIERARCHY' ||
        variables.key === 'STORAGE_TEMPERATURE_OPTIONS'
      ) {
        queryClient.setQueryData(
          ['restaurant', legacySettingKeyByRestaurantSetting[variables.key]],
          variables.value,
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: domainQueryKeys.restaurantSettings,
        }),
        variables.key === 'PRODUCT_MERGE_METADATA'
          ? queryClient.invalidateQueries({ queryKey: domainQueryKeys.inventory })
          : Promise.resolve(),
      ]);
    },
  });
}

export function useUpsertRestaurantCategoryHierarchyMutation() {
  const mutation = useUpsertRestaurantSettingMutation();
  return {
    ...mutation,
    mutate: (value: CategoryHierarchy) =>
      mutation.mutate({ key: 'CATEGORY_HIERARCHY', value }),
    mutateAsync: (value: CategoryHierarchy) =>
      mutation.mutateAsync({ key: 'CATEGORY_HIERARCHY', value }),
  };
}

export function useUpsertRestaurantStorageTemperatureOptionsMutation() {
  const mutation = useUpsertRestaurantSettingMutation();
  return {
    ...mutation,
    mutate: (value: string[]) =>
      mutation.mutate({ key: 'STORAGE_TEMPERATURE_OPTIONS', value }),
    mutateAsync: (value: string[]) =>
      mutation.mutateAsync({ key: 'STORAGE_TEMPERATURE_OPTIONS', value }),
  };
}

export function useUpsertRestaurantProductMergeMetadataMutation() {
  const mutation = useUpsertRestaurantSettingMutation();
  return {
    ...mutation,
    mutate: (value: Record<string, unknown>) =>
      mutation.mutate({ key: 'PRODUCT_MERGE_METADATA', value }),
    mutateAsync: (value: Record<string, unknown>) =>
      mutation.mutateAsync({ key: 'PRODUCT_MERGE_METADATA', value }),
  };
}
