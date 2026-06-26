import type { ApiBundle } from '../../../app/api/domainTypes';
import {
  activateBundle,
  approveBundle,
  archiveBundle,
  createBundle,
  deactivateBundle,
  deleteBundle,
  rejectBundle,
  restoreBundle,
  updateBundle,
} from '../../../app/api/client';
import { useBundlesQuery } from '../domainQueries';
import { mapItems, retailQueryKeys, useRetailMutation } from './shared';

export type RetailBundleRecord = ApiBundle;

export const mapRetailBundleRecord = (bundle: ApiBundle): ApiBundle => ({
  ...bundle,
  items: bundle.items,
});

export function useRetailBundlesQuery<TData = ApiBundle[]>(
  params?: { status?: string; archived?: boolean },
  select?: (items: ApiBundle[]) => TData,
) {
  return useBundlesQuery(params, {
    select: (items) => mapItems(items, mapRetailBundleRecord, select),
  });
}

export function useCreateRetailBundleMutation() {
  return useRetailMutation(createBundle, [retailQueryKeys.bundles]);
}

export function useUpdateRetailBundleMutation() {
  return useRetailMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateBundle(id, data),
    [retailQueryKeys.bundles],
  );
}

export function useApproveRetailBundleMutation() {
  return useRetailMutation(approveBundle, [retailQueryKeys.bundles]);
}

export function useRejectRetailBundleMutation() {
  return useRetailMutation(
    ({ id, reason }: { id: string; reason: string }) => rejectBundle(id, reason),
    [retailQueryKeys.bundles],
  );
}

export function useActivateRetailBundleMutation() {
  return useRetailMutation(activateBundle, [retailQueryKeys.bundles]);
}

export function useDeactivateRetailBundleMutation() {
  return useRetailMutation(deactivateBundle, [retailQueryKeys.bundles]);
}

export function useArchiveRetailBundleMutation() {
  return useRetailMutation(archiveBundle, [retailQueryKeys.bundles]);
}

export function useRestoreRetailBundleMutation() {
  return useRetailMutation(restoreBundle, [retailQueryKeys.bundles]);
}

export function useDeleteRetailBundleMutation() {
  return useRetailMutation(deleteBundle, [
    retailQueryKeys.bundles,
    retailQueryKeys.inventory,
  ]);
}
