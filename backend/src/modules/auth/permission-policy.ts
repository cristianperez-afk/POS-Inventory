import { AuthenticatedUser } from '../../shared/common/types';

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPERADMIN: ['*'],
  ADMIN: [
    'activity:read_store',
    'discounts:manage',
    'inventory:manage',
    'inventory:read',
    'kitchen:read',
    'kitchen:update_status',
    'pos:manage',
    'pos:read',
    'pos:update_table_occupancy',
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
    'pos:update_table_occupancy',
    'retail:void_authorize',
    'theme:manage_personal',
  ],
  INVENTORY_MANAGER: [
    'activity:read_store',
    'inventory:manage',
    'inventory:read',
    'kitchen:read',
    'kitchen:update_status',
    'theme:manage_personal',
  ],
  STAFF: ['pos:read', 'pos:create_order', 'pos:update_table_occupancy', 'theme:manage_personal'],
  KITCHEN: ['kitchen:read', 'kitchen:update_status', 'theme:manage_personal'],
};

export function getPermissionsForUser(user: AuthenticatedUser | undefined) {
  const permissions = new Set(ROLE_PERMISSIONS[String(user?.role ?? '').toUpperCase()] ?? []);

  if (user?.role === 'STAFF' && user.staff_type === 'INVENTORY_STAFF') {
    permissions.delete('pos:read');
    permissions.delete('pos:create_order');
    permissions.delete('pos:update_table_occupancy');
    permissions.add('inventory:read');
    permissions.add('inventory:manage');
    // kitchen:read is the shared "view recipes / kitchen orders / module-shell
    // reads (notifications, settings)" grant — inventory staff need it too.
    permissions.add('kitchen:read');
  }

  // Kitchen accounts are limited to viewing Kitchen Orders / Recipe-BOM and
  // updating preparation status — they get no POS or general inventory access.
  // A kitchen account is identified by the dedicated KITCHEN role, or by a STAFF
  // user flagged with the KITCHEN_STAFF staff type.
  if (String(user?.role ?? '').toUpperCase() === 'KITCHEN' || user?.staff_type === 'KITCHEN_STAFF') {
    permissions.delete('pos:read');
    permissions.delete('pos:create_order');
    permissions.delete('pos:update_table_occupancy');
    permissions.add('kitchen:read');
    permissions.add('kitchen:update_status');
  }

  return permissions;
}
