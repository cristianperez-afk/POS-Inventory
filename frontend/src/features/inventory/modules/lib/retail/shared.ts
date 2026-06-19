import {
  domainQueryKeys,
  useDomainMutation,
} from '../domainQueries';

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
  value ? new Date(value).toISOString().split('T')[0] : '';

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
