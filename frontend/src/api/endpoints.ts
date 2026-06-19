export const endpoints = {
  auth: {
    login: '/auth/login',
  },
  inventory: {
    base: '/api/inventory',
    categories: '/api/categories',
    kitchenOrders: '/api/kitchen-orders',
    recipes: '/api/recipes',
  },
  pos: {
    orders: '/orders',
    payments: '/payments',
    reports: '/reports',
  },
  admin: {
    users: '/admin/users',
    storeInformation: '/admin/store-information',
    storeSettings: '/admin/store-settings',
  },
} as const;
