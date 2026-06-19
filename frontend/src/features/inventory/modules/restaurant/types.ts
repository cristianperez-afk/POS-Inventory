export type RestaurantLocation = {
  id: string;
  name: string;
  _count?: { items: number };
};

export type RestaurantInventoryItem = {
  id: string;
  name: string;
  itemType?: 'RETAIL_ITEM' | 'INGREDIENT' | 'MENU_ITEM' | 'SUPPLY' | 'BUNDLE';
  sku?: string | null;
  category: string;
  quantity: number;
  price: number;
  unit?: string | null;
  minStock?: number | null;
  maxStock?: number | null;
  reorderPoint?: number | null;
  expiryDate?: string | null;
  storageTemperature?: string | null;
  locationId: string;
  location?: RestaurantLocation;
};

export type RestaurantRecipe = {
  id: string;
  name: string;
  category: string;
  servings: number;
  yieldPercentage: number;
  sellingPrice?: number | null;
  isActive: boolean;
  menuItem?: RestaurantInventoryItem | null;
  ingredients: {
    id: string;
    quantity: number;
    unit?: string | null;
    item: RestaurantInventoryItem;
  }[];
};

export type RestaurantKitchenOrder = {
  id: string;
  receiptNo: string;
  quantity: number;
  status: 'COMPLETED' | 'VOIDED';
  createdAt: string;
  voidReason?: string | null;
  recipe: RestaurantRecipe;
};

export type RestaurantStockMovement = {
  id: string;
  type: 'SPOILAGE' | 'EXPIRY' | string;
  quantity: number;
  unit?: string | null;
  reason?: string | null;
  notes?: string | null;
  createdAt: string;
  item: RestaurantInventoryItem;
  location?: RestaurantLocation;
};
