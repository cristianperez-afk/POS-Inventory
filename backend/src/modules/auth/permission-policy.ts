import { AuthenticatedUser } from '../../shared/common/types';

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPERADMIN: ['*'],
  ADMIN: [
    'activity:read_store',
    'discounts:manage',
    'inventory:manage',
    'inventory:read',
    'pos:manage',
    'pos:read',
    'retail:void_authorize',
    'settings:manage',
    'staff:manage',
    'theme:manage_personal',
    'theme:manage_store',
  ],
  POS_MANAGER: [
    'activity:read_store',
    'pos:create_order',
    'pos:manage',
    'pos:read',
    'retail:void_authorize',
    'theme:manage_personal',
  ],
  INVENTORY_MANAGER: [
    'activity:read_store',
    'inventory:manage',
    'inventory:read',
    'theme:manage_personal',
  ],
  STAFF: ['pos:read', 'pos:create_order', 'theme:manage_personal'],
};

export function getPermissionsForUser(user: AuthenticatedUser | undefined) {
  const permissions = new Set(ROLE_PERMISSIONS[String(user?.role ?? '').toUpperCase()] ?? []);

  if (user?.role === 'STAFF' && user.staff_type === 'INVENTORY_STAFF') {
    permissions.delete('pos:read');
    permissions.delete('pos:create_order');
    permissions.add('inventory:read');
    permissions.add('inventory:manage');
  }

  return permissions;
}
