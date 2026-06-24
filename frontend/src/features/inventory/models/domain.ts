export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  category: string;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  manager: string;
  phone: string;
  itemCount: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Staff' | 'Cashier' | 'KitchenStaff' | 'RetailStaff';
  status: 'Active' | 'Inactive';
  lastLogin: string;
}
