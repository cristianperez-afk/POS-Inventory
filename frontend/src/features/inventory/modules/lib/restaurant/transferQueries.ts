import type { ApiTransfer } from '../../../app/api/domainTypes';
import {
  cancelTransfer,
  completeTransfer,
  createTransfer,
  dispatchTransfer,
} from '../../../app/api/client';
import {
  domainQueryKeys,
  useDomainMutation,
  useTransfersQuery,
} from '../domainQueries';

const toDateInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

type RestaurantTransferStatus = 'pending' | 'approved' | 'in-transit' | 'completed' | 'rejected';

export function mapRestaurantTransfers(transfers: ApiTransfer[]) {
  return transfers.map((transfer) => {
    const status: RestaurantTransferStatus =
      transfer.status === 'IN_TRANSIT'
        ? 'in-transit'
        : transfer.status === 'CANCELLED'
          ? 'rejected'
          : transfer.status === 'COMPLETED'
            ? 'completed'
            : 'pending';

    return {
      id: transfer.id,
      backendId: transfer.id,
      item: transfer.items?.[0]?.inventoryItem?.name ?? 'Multiple items',
      quantity: transfer.items?.[0]?.quantity ?? 0,
      unit: transfer.items?.[0]?.inventoryItem?.unit ?? 'pcs',
      from: transfer.fromLocation?.name ?? '',
      to: transfer.toLocation?.name ?? '',
      requestedBy: transfer.createdBy?.name ?? transfer.createdBy?.email ?? '',
      requestedByEmail: transfer.createdBy?.email ?? '',
      requestDate: toDateInput(transfer.createdAt),
      status,
      completedDate: toDateInput(transfer.completedAt),
      notes: transfer.notes ?? '',
    };
  });
}

export function useRestaurantTransfersQuery() {
  return useTransfersQuery(
    { module: 'RESTAURANT' },
    { select: mapRestaurantTransfers },
  );
}

export function useCreateRestaurantTransferMutation() {
  return useDomainMutation(
    (data: Record<string, unknown>) =>
      createTransfer({ ...data, module: 'RESTAURANT' }),
    [
      domainQueryKeys.transfers,
      domainQueryKeys.inventory,
      domainQueryKeys.stockMovements,
    ],
  );
}

export function useRestaurantTransferActionMutation() {
  return useDomainMutation(
    ({
      id,
      action,
    }: {
      id: string;
      action: 'dispatch' | 'complete' | 'cancel';
    }) => {
      if (action === 'dispatch') return dispatchTransfer(id, 'RESTAURANT');
      if (action === 'complete') return completeTransfer(id, 'RESTAURANT');
      return cancelTransfer(id, 'RESTAURANT');
    },
    [
      domainQueryKeys.transfers,
      domainQueryKeys.inventory,
      domainQueryKeys.stockMovements,
    ],
  );
}
