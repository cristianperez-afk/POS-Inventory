import {
  createUser,
  deleteUser,
  updateUser,
} from '../../../app/api/client';
import type { ApiUser } from '../../../app/api/domainTypes';
import {
  domainQueryKeys,
  useDomainMutation,
  useUsersQuery,
} from '../domainQueries';

export function mapRestaurantUsers(users: ApiUser[]) {
  return users.map((user, index) => ({
    id: index + 1,
    backendId: user.id,
    name: user.name,
    email: user.email,
    phone: '',
    role: user.role.toLowerCase(),
    status: user.status.toLowerCase(),
    lastLogin: user.lastLogin,
    avatar: user.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2),
  }));
}

export function useRestaurantUsersQuery(enabled = true) {
  return useUsersQuery({ enabled, select: mapRestaurantUsers });
}

export function useCreateRestaurantUserMutation() {
  return useDomainMutation(createUser, [domainQueryKeys.users]);
}

export function useUpdateRestaurantUserMutation() {
  return useDomainMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateUser(id, data),
    [domainQueryKeys.users],
  );
}

export function useDeleteRestaurantUserMutation() {
  return useDomainMutation(deleteUser, [domainQueryKeys.users]);
}
