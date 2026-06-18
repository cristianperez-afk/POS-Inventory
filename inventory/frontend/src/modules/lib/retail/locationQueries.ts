import type { Location, User } from '../../../models/retail';
import type { ApiLocation, ApiUser } from '../../../app/api/domainTypes';
import {
  createLocation,
  createUser,
  deleteLocation,
  deleteUser,
  updateLocation,
  updateUser,
} from '../../../app/api/client';
import { useLocationsQuery, useUsersQuery } from '../domainQueries';
import { formatDate, mapItems, retailQueryKeys, useRetailMutation } from './shared';

export const mapRetailLocation = (location: ApiLocation): Location => ({
  id: location.id,
  name: location.name,
  address: location.address,
  manager: location.manager,
  phone: location.phone,
  itemCount: location.itemCount ?? location._count?.items ?? 0,
});

export const mapRetailUser = (user: ApiUser): User => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  lastLogin: formatDate(user.lastLogin),
});

export function useRetailLocationsQuery<TData = ReturnType<typeof mapRetailLocation>[]>(
  enabled = true,
  select?: (items: ReturnType<typeof mapRetailLocation>[]) => TData,
) {
  return useLocationsQuery({
    enabled,
    select: (items) => mapItems(items, mapRetailLocation, select),
  });
}

export function useRetailUsersQuery<TData = ReturnType<typeof mapRetailUser>[]>(
  enabled = true,
  select?: (items: ReturnType<typeof mapRetailUser>[]) => TData,
) {
  return useUsersQuery({
    enabled,
    select: (items) => mapItems(items, mapRetailUser, select),
  });
}

export function useCreateRetailLocationMutation() {
  return useRetailMutation(createLocation, [retailQueryKeys.locations]);
}

export function useUpdateRetailLocationMutation() {
  return useRetailMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateLocation(id, data),
    [
      retailQueryKeys.locations,
      retailQueryKeys.inventory,
      retailQueryKeys.transfers,
      retailQueryKeys.sales,
      retailQueryKeys.bundles,
    ],
  );
}

export function useDeleteRetailLocationMutation() {
  return useRetailMutation(deleteLocation, [
    retailQueryKeys.locations,
    retailQueryKeys.inventory,
    retailQueryKeys.transfers,
    retailQueryKeys.sales,
    retailQueryKeys.bundles,
  ]);
}

export function useCreateRetailUserMutation() {
  return useRetailMutation(createUser, [retailQueryKeys.users]);
}

export function useUpdateRetailUserMutation() {
  return useRetailMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) => updateUser(id, data),
    [retailQueryKeys.users],
  );
}

export function useDeleteRetailUserMutation() {
  return useRetailMutation(deleteUser, [retailQueryKeys.users]);
}
