import type { Transfer } from '../../../models/retail';
import type { ApiLocation, ApiTransfer } from '../../../app/api/domainTypes';
import {
  cancelTransfer,
  completeTransfer,
  createTransfer,
  dispatchTransfer,
} from '../../../app/api/client';
import { useTransfersQuery } from '../domainQueries';
import { formatDate, mapItems, retailQueryKeys, useRetailMutation } from './shared';

export type RetailTransferRecord = ApiTransfer & {
  fromLocation: ApiLocation | null;
  toLocation: ApiLocation | null;
  items: ApiTransfer['items'];
};

export const mapRetailTransfer = (transfer: ApiTransfer): Transfer => ({
  id: transfer.id,
  transferNumber: transfer.transferNumber,
  fromLocation: transfer.fromLocation?.name ?? '',
  toLocation: transfer.toLocation?.name ?? '',
  date: formatDate(transfer.createdAt),
  status:
    ({
      PENDING: 'Pending',
      IN_TRANSIT: 'In Transit',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
    } as Record<string, Transfer['status']>)[transfer.status] ?? 'Pending',
  items: transfer.items.map((item) => ({
    itemId: item.inventoryItemId,
    name: item.inventoryItem?.name ?? 'Item',
    quantity: item.quantity,
  })),
  createdBy: transfer.createdBy?.name ?? transfer.createdBy?.email ?? '',
  notes: transfer.notes ?? undefined,
});

export const mapRetailTransferRecord = (transfer: ApiTransfer): RetailTransferRecord => ({
  ...transfer,
  items: transfer.items,
  fromLocation: transfer.fromLocation ?? null,
  toLocation: transfer.toLocation ?? null,
});

export function useRetailTransfersQuery<TData = ReturnType<typeof mapRetailTransfer>[]>(
  enabled = true,
  select?: (items: ReturnType<typeof mapRetailTransfer>[]) => TData,
) {
  return useTransfersQuery({ module: 'RETAIL' }, {
    enabled,
    select: (items) => mapItems(items, mapRetailTransfer, select),
  });
}

export function useRetailTransferRecordsQuery<
  TData = ReturnType<typeof mapRetailTransferRecord>[],
>(
  enabled = true,
  select?: (items: ReturnType<typeof mapRetailTransferRecord>[]) => TData,
) {
  return useTransfersQuery({ module: 'RETAIL' }, {
    enabled,
    select: (items) => mapItems(items, mapRetailTransferRecord, select),
  });
}

export function useCreateRetailTransferMutation() {
  return useRetailMutation(
    (data: Record<string, unknown>) => createTransfer({ ...data, module: 'RETAIL' }),
    [retailQueryKeys.transfers, retailQueryKeys.inventory],
  );
}

export function useDispatchRetailTransferMutation() {
  return useRetailMutation(
    (id: string) => dispatchTransfer(id, 'RETAIL'),
    [retailQueryKeys.transfers],
  );
}

export function useCompleteRetailTransferMutation() {
  return useRetailMutation(
    (id: string) => completeTransfer(id, 'RETAIL'),
    [retailQueryKeys.transfers, retailQueryKeys.inventory],
  );
}

export function useCancelRetailTransferMutation() {
  return useRetailMutation(
    ({ id, reason }: { id: string; reason?: string }) => cancelTransfer(id, 'RETAIL', reason),
    [retailQueryKeys.transfers],
  );
}
