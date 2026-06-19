import { getSales } from '../../../app/api/client';
import { useSalesQuery } from '../domainQueries';

export function useRestaurantSalesQuery<
  TData = Awaited<ReturnType<typeof getSales>>,
>(select?: (items: Awaited<ReturnType<typeof getSales>>) => TData) {
  return useSalesQuery(
    { module: 'RESTAURANT' },
    select ? { select } : undefined,
  );
}
