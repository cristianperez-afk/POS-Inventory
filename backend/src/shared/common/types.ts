export type StoreType = 'RESTAURANT' | 'RETAIL_STORE' | string | null;
export type StaffType = 'POS_STAFF' | 'INVENTORY_STAFF' | 'KITCHEN_STAFF' | null;

export interface AuthenticatedUser {
  id: number;
  full_name: string;
  email: string;
  role: 'SUPERADMIN' | 'POS_MANAGER' | 'INVENTORY_MANAGER' | 'STAFF' | string;
  store_id: number | null;
  staff_type: StaffType;
  store_type: StoreType;
  store_name: string | null;
}

export interface LoginResponse {
  user: AuthenticatedUser;
}
