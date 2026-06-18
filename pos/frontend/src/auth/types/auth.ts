export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'STAFF';
export type StaffType = 'POS_STAFF' | 'INVENTORY_STAFF' | 'MANAGER' | null;
export type StoreType = 'RESTAURANT' | 'RETAIL_STORE' | string | null;

export interface AuthenticatedUser {
  id: number | string;
  full_name: string;
  email: string;
  role: UserRole;
  store_id: number | null;
  staff_type: StaffType;
  store_type: StoreType;
  store_name: string | null;
}
