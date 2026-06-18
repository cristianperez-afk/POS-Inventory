import type { ApiSale } from '../../../app/api/domainTypes';
import { createSale, refundSale } from '../../../app/api/client';
import { useSalesQuery } from '../domainQueries';
import { mapItems, retailQueryKeys, useRetailMutation } from './shared';

export type RetailSaleRecord = ApiSale;

export const mapRetailSaleRecord = (sale: ApiSale): ApiSale => ({
  ...sale,
  items: sale.items,
});

export function useRetailSalesQuery<TData = ApiSale[]>(
  params?: {
    locationId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  },
  select?: (items: ApiSale[]) => TData,
) {
  return useSalesQuery({ module: 'RETAIL', ...params }, {
    select: (items) => mapItems(items, mapRetailSaleRecord, select),
  });
}

export function useCreateRetailSaleMutation() {
  return useRetailMutation(
    (data: Record<string, unknown>) => createSale({ ...data, module: 'RETAIL' }),
    [
      retailQueryKeys.inventory,
      retailQueryKeys.sales,
    ],
  );
}

export function useRefundRetailSaleMutation() {
  return useRetailMutation(
    ({ id, reason }: { id: string; reason: string }) =>
      refundSale(id, reason, 'RETAIL'),
    [retailQueryKeys.inventory, retailQueryKeys.sales],
  );
}
