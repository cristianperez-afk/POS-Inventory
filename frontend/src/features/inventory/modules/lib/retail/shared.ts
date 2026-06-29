import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getRestaurantSettings, upsertRestaurantSetting } from '../../../app/api/client';
import {
  domainQueryKeys,
  useDomainMutation,
  useRestaurantSettingsQuery,
} from '../domainQueries';
import { getManilaDateKey } from '../../../../../shared/utils/date';

export const retailQueryKeys = {
  ...domainQueryKeys,
};

export type RetailQueryKey = (typeof retailQueryKeys)[keyof typeof retailQueryKeys];

export function useRetailMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  invalidateKeys: RetailQueryKey[],
) {
  return useDomainMutation(mutationFn, invalidateKeys);
}

export interface RetailStockAlert {
  id: string;
  itemName: string;
  currentStock: number;
  threshold: number;
  severity: 'low' | 'critical';
}

export const formatDate = (value?: string | null) =>
  value ? getManilaDateKey(value) : '';

export const getRetailErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function mapItems<TItem, TMapped, TData = TMapped[]>(
  items: TItem[],
  mapper: (item: TItem) => TMapped,
  select?: (items: TMapped[]) => TData,
) {
  const mapped = items.map(mapper);
  return select ? select(mapped) : (mapped as unknown as TData);
}

// Backed by the same per-business settings store the restaurant module uses
// (it's keyed only by businessId, not module), under a retail-specific key
// so the two modules' merge metadata never collide on shared businesses.
export function useRetailProductMergeMetadataQuery<
  TData = Record<string, unknown>,
>() {
  return useRestaurantSettingsQuery({
    select: (settings) =>
      (settings.find((setting) => setting.key === 'RETAIL_PRODUCT_MERGE_METADATA')
        ?.value ?? {}) as TData,
  });
}

export function useUpsertRetailProductMergeMetadataMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (value: Record<string, unknown>) =>
      upsertRestaurantSetting('RETAIL_PRODUCT_MERGE_METADATA', value),
    onSuccess: async (setting) => {
      queryClient.setQueryData<Awaited<ReturnType<typeof getRestaurantSettings>>>(
        domainQueryKeys.restaurantSettings,
        (current = []) => {
          const others = current.filter((item) => item.key !== setting.key);
          return [...others, setting].sort((a, b) => a.key.localeCompare(b.key));
        },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: domainQueryKeys.restaurantSettings }),
        queryClient.invalidateQueries({ queryKey: domainQueryKeys.inventory }),
      ]);
    },
  });
}
