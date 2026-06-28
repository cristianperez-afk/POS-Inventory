import type {
  ApiBundle,
  ApiCategory,
  ApiNotification,
  ApiGoodsReceipt,
  ApiInventoryItem,
  ApiKitchenOrder,
  ApiLocation,
  ApiPurchaseOrder,
  ApiRecipe,
  ApiRestaurantSetting,
  ApiSale,
  ApiStockMovement,
  ApiSupplier,
  ApiTransfer,
  ApiUser,
  BusinessModule,
  KitchenOrderStatus,
  RestaurantSettingKey,
} from './domainTypes';
import { getApiBaseUrl } from '../../../../auth/services/auth';

export type { KitchenOrderStatus, RestaurantSettingKey } from './domainTypes';

type RequestOptions = Omit<RequestInit, 'credentials'>;

type PagedResponse<T> = { data: T[]; total: number; page: number; limit: number; totalPages: number };

declare global {
  interface Window {
    __POS_INVENTORY_USER__?: AuthUser | null;
    __POS_STORE_TYPE__?: string | null;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const bridgeHeaders: Record<string, string> = {};
  if (typeof window !== 'undefined' && window.__POS_INVENTORY_USER__) {
    bridgeHeaders['x-pos-user-id'] = window.__POS_INVENTORY_USER__.id;
    bridgeHeaders['x-pos-bridge-email'] = window.__POS_INVENTORY_USER__.email;
    bridgeHeaders['x-pos-bridge-name'] = window.__POS_INVENTORY_USER__.name;
    bridgeHeaders['x-pos-bridge-role'] = window.__POS_INVENTORY_USER__.role;
    bridgeHeaders['x-pos-store-type'] = window.__POS_STORE_TYPE__ ?? '';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include', // sends the HttpOnly cookie automatically
    headers: {
      'Content-Type': 'application/json',
      ...bridgeHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    const error = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : {};
    const fallbackMessage =
      response.status === 502
        ? 'Inventory backend is not reachable (502 from the dev proxy). Make sure the backend is running on port 3000, restart the Vite dev server if you just changed its config, and check that backend/.env DATABASE_URL points to the inventory database.'
        : `Request failed with ${response.status}`;

    throw new Error(error.message ?? fallbackMessage);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  businessId: string;
  modules: string[];
  lastLogin: string;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export function storeToken(_token: string) {
  // Auth is handled by the HttpOnly cookie set by the backend.
}

export function clearStoredToken() {
  // Auth is handled by the HttpOnly cookie set by the backend.
}

export function loginUser(email: string, password: string) {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logoutUser() {
  return request<{ message: string }>('/api/auth/logout', { method: 'POST' });
}

// Re-hydrate the session from the HttpOnly cookie (used on app load / refresh).
export function getCurrentUser() {
  return request<{ user: AuthUser }>('/api/auth/me');
}

export const getCurrentSession = getCurrentUser;

export function getInventory(params?: { search?: string; itemType?: string }) {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.itemType) query.set('itemType', params.itemType);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<ApiInventoryItem>>(`/api/inventory${suffix}`).then((r) => r.data);
}

export function createInventoryItem(data: unknown) {
  return request<ApiInventoryItem>('/api/inventory', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateInventoryItem(id: string, data: unknown) {
  return request<ApiInventoryItem>(`/api/inventory/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteInventoryItem(id: string) {
  return request<ApiInventoryItem>(`/api/inventory/${id}`, {
    method: 'DELETE',
  });
}

export interface CostHistoryEntry {
  id: string;
  quantityReceived: number;
  unitCost: number;
  totalCost: number;
  dateReceived: string;
  receiptNumber: string | null;
  orderNumber: string | null;
  supplierName: string | null;
}

export interface ItemCostHistory {
  itemId: string;
  name: string;
  unit: string | null;
  currentStock: number;
  weightedAverageCost: number;
  totalReceipts: number;
  totalQuantityReceived: number;
  totalCost: number;
  entries: CostHistoryEntry[];
}

export function getItemCostHistory(id: string) {
  return request<ItemCostHistory>(`/api/inventory/${id}/cost-history`);
}

export function getStockMovements(params?: {
  module?: BusinessModule;
  itemId?: string;
  locationId?: string;
  type?: string;
  referenceType?: string;
  referenceId?: string;
}) {
  const query = new URLSearchParams();
  if (params?.module) query.set('module', params.module);
  if (params?.itemId) query.set('itemId', params.itemId);
  if (params?.locationId) query.set('locationId', params.locationId);
  if (params?.type) query.set('type', params.type);
  if (params?.referenceType) query.set('referenceType', params.referenceType);
  if (params?.referenceId) query.set('referenceId', params.referenceId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<ApiStockMovement>>(`/api/stock-movements${suffix}`).then((r) => r.data);
}

export function createStockMovement(data: unknown) {
  return request<ApiStockMovement>('/api/stock-movements', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Audit Trail ───────────────────────────────────────────────────────────────

export interface ApiAuditLog {
  id: string;
  businessId: string;
  module: BusinessModule;
  category: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  summary: string | null;
  quantity: string | null;
  status: string | null;
  metadata: unknown;
  performedById: string | null;
  performedByName: string | null;
  performedByEmail: string | null;
  performedByRole: string | null;
  createdAt: string;
}

export function getAuditLogs(params?: {
  module?: BusinessModule;
  category?: string;
  performedByEmail?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.module) query.set('module', params.module);
  if (params?.category) query.set('category', params.category);
  if (params?.performedByEmail) query.set('performedByEmail', params.performedByEmail);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<ApiAuditLog>>(`/api/audit-logs${suffix}`).then((r) => r.data);
}

export interface IngredientConsumptionRow {
  itemId: string;
  name: string;
  category: string | null;
  unit: string | null;
  totalConsumed: number;
  movementCount: number;
  firstConsumedAt: string | null;
  lastConsumedAt: string | null;
  currentStock: number | null;
}

export interface IngredientConsumptionReport {
  from: string | null;
  to: string | null;
  totalIngredients: number;
  totalQuantityConsumed: number;
  items: IngredientConsumptionRow[];
}

export function getIngredientConsumptionReport(params?: { module?: BusinessModule; from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.module) query.set('module', params.module);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<IngredientConsumptionReport>(`/api/reports/ingredient-consumption${suffix}`);
}

export interface ItemsSoldRow {
  itemId: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  unitsSold: number;
  revenue: number;
  salesCount: number;
  lastSoldAt: string | null;
  currentStock: number | null;
}

export interface ItemsSoldReport {
  from: string | null;
  to: string | null;
  totalItems: number;
  totalUnitsSold: number;
  totalRevenue: number;
  items: ItemsSoldRow[];
}

export function getItemsSoldReport(params?: { module?: BusinessModule; from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.module) query.set('module', params.module);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<ItemsSoldReport>(`/api/reports/items-sold${suffix}`);
}

export function getRecipes(params?: { active?: boolean; archived?: boolean }) {
  const query = new URLSearchParams();
  if (params?.active !== undefined) query.set('active', String(params.active));
  if (params?.archived !== undefined) query.set('archived', String(params.archived));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<ApiRecipe>>(`/api/recipes${suffix}`).then((r) => r.data);
}

export function createRecipe(data: unknown) {
  return request<ApiRecipe>('/api/recipes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateRecipe(id: string, data: unknown) {
  return request<ApiRecipe>(`/api/recipes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteRecipe(id: string, permanent = false) {
  const suffix = permanent ? '?permanent=true' : '';
  return request<ApiRecipe>(`/api/recipes/${id}${suffix}`, {
    method: 'DELETE',
  });
}

export function restoreRecipe(id: string) {
  return request<ApiRecipe>(`/api/recipes/${id}/restore`, {
    method: 'POST',
  });
}

export function getKitchenOrders(params?: { status?: KitchenOrderStatus }) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<ApiKitchenOrder>>(`/api/kitchen-orders${suffix}`).then((r) => r.data);
}

export function completeKitchenOrder(data: unknown) {
  return request<ApiKitchenOrder>('/api/kitchen-orders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function voidKitchenOrder(id: string, voidReason: string) {
  return request<ApiKitchenOrder>(`/api/kitchen-orders/${id}/void`, {
    method: 'PATCH',
    body: JSON.stringify({ voidReason }),
  });
}

export async function updateKitchenOrderStatus(id: string, status: KitchenOrderStatus) {
  const order = await request<ApiKitchenOrder>(`/api/kitchen-orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pos-order-updated', { detail: { id, status } }));
    window.localStorage.setItem('pos-order-updated-at', String(Date.now()));
  }
  return order;
}

export function getLocations() {
  return request<PagedResponse<ApiLocation>>('/api/locations').then((r) => r.data);
}

export function createLocation(data: unknown) {
  return request<ApiLocation>('/api/locations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateLocation(id: string, data: unknown) {
  return request<ApiLocation>(`/api/locations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteLocation(id: string) {
  return request<ApiLocation>(`/api/locations/${id}`, {
    method: 'DELETE',
  });
}

export function getUsers() {
  return request<PagedResponse<ApiUser>>('/api/users').then((r) => r.data);
}

export function createUser(data: unknown) {
  return request<ApiUser>('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateUser(id: string, data: unknown) {
  return request<ApiUser>(`/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteUser(id: string) {
  return request<ApiUser>(`/api/users/${id}`, {
    method: 'DELETE',
  });
}

export function getCategories(module?: string) {
  const query = new URLSearchParams();
  if (module) query.set('module', module);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<ApiCategory[]>(`/api/categories${suffix}`);
}

export function createCategory(data: unknown) {
  return request<ApiCategory>('/api/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getRestaurantSettings() {
  return request<ApiRestaurantSetting[]>('/api/restaurant-settings');
}

export function upsertRestaurantSetting(key: RestaurantSettingKey, value: unknown) {
  return request<ApiRestaurantSetting>(`/api/restaurant-settings/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

function moduleSuffix(module?: BusinessModule) {
  return module ? `?module=${module}` : '';
}

export function getSuppliers(params?: { module?: BusinessModule; isActive?: boolean }) {
  const query = new URLSearchParams();
  if (params?.module) query.set('module', params.module);
  if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<ApiSupplier>>(`/api/suppliers${suffix}`).then((r) => r.data);
}

export function createSupplier(data: unknown) {
  return request<ApiSupplier>('/api/suppliers', { method: 'POST', body: JSON.stringify(data) });
}

export function updateSupplier(id: string, data: unknown, module?: BusinessModule) {
  return request<ApiSupplier>(`/api/suppliers/${id}${moduleSuffix(module)}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteSupplier(id: string, module?: BusinessModule) {
  return request<ApiSupplier>(`/api/suppliers/${id}${moduleSuffix(module)}`, { method: 'DELETE' });
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

export function getPurchaseOrders(params?: { module?: BusinessModule; status?: string; supplierId?: string }) {
  const query = new URLSearchParams();
  if (params?.module) query.set('module', params.module);
  if (params?.status) query.set('status', params.status);
  if (params?.supplierId) query.set('supplierId', params.supplierId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<ApiPurchaseOrder>>(`/api/purchase-orders${suffix}`).then((r) => r.data);
}

export function getPurchaseOrder(id: string, module?: BusinessModule) {
  return request<ApiPurchaseOrder>(`/api/purchase-orders/${id}${moduleSuffix(module)}`);
}

export function getGoodsReceipts(params?: { module?: BusinessModule; purchaseOrderId?: string }) {
  const query = new URLSearchParams();
  if (params?.module) query.set('module', params.module);
  if (params?.purchaseOrderId) query.set('purchaseOrderId', params.purchaseOrderId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<ApiGoodsReceipt>>(`/api/purchase-orders/goods-receipts${suffix}`).then((r) => r.data);
}

export function createPurchaseOrder(data: unknown) {
  return request<ApiPurchaseOrder>('/api/purchase-orders', { method: 'POST', body: JSON.stringify(data) });
}

export function updatePurchaseOrder(id: string, data: unknown, module?: BusinessModule) {
  return request<ApiPurchaseOrder>(`/api/purchase-orders/${id}${moduleSuffix(module)}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function submitPurchaseOrder(id: string, module?: BusinessModule) {
  return request<ApiPurchaseOrder>(`/api/purchase-orders/${id}/submit${moduleSuffix(module)}`, { method: 'PATCH' });
}

export function approvePurchaseOrder(id: string, module?: BusinessModule) {
  return request<ApiPurchaseOrder>(`/api/purchase-orders/${id}/approve${moduleSuffix(module)}`, { method: 'PATCH' });
}

export function rejectPurchaseOrder(id: string, reason: string, module?: BusinessModule) {
  return request<ApiPurchaseOrder>(`/api/purchase-orders/${id}/reject${moduleSuffix(module)}`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export function receivePurchaseOrder(
  id: string,
  items: {
    id: string;
    receivedQty: number;
    rejectedQty: number;
    condition?: string;
    notes?: string;
    expiryDate?: string;
    expiryPeriod?: string;
    noExpiry?: boolean;
    storageTemperature?: string;
  }[],
  notes?: string,
  module?: BusinessModule,
  proofImages?: string[],
) {
  return request<ApiPurchaseOrder>(`/api/purchase-orders/${id}/receive${moduleSuffix(module)}`, {
    method: 'PATCH',
    body: JSON.stringify({ items, notes, proofImages }),
  });
}

export function cancelPurchaseOrder(id: string, module?: BusinessModule) {
  return request<ApiPurchaseOrder>(`/api/purchase-orders/${id}/cancel${moduleSuffix(module)}`, { method: 'PATCH' });
}

export function rejectGoodsReceipt(id: string, reason: string, proofImages: string[] = [], module?: BusinessModule) {
  return request<ApiPurchaseOrder>(`/api/purchase-orders/${id}/goods-receipt/reject${moduleSuffix(module)}`, {
    method: 'PATCH',
    body: JSON.stringify({ reason, proofImages }),
  });
}

export function cancelGoodsReceipt(id: string, reason: string, proofImages: string[] = [], module?: BusinessModule) {
  return request<ApiPurchaseOrder>(`/api/purchase-orders/${id}/goods-receipt/cancel${moduleSuffix(module)}`, {
    method: 'PATCH',
    body: JSON.stringify({ reason, proofImages }),
  });
}

// ─── Transfers ───────────────────────────────────────────────────────────────

export function getTransfers(params?: { module?: BusinessModule; status?: string; fromLocationId?: string; toLocationId?: string }) {
  const query = new URLSearchParams();
  if (params?.module) query.set('module', params.module);
  if (params?.status) query.set('status', params.status);
  if (params?.fromLocationId) query.set('fromLocationId', params.fromLocationId);
  if (params?.toLocationId) query.set('toLocationId', params.toLocationId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<ApiTransfer>>(`/api/transfers${suffix}`).then((r) => r.data);
}

export function getTransfer(id: string, module?: BusinessModule) {
  return request<ApiTransfer>(`/api/transfers/${id}${moduleSuffix(module)}`);
}

export function createTransfer(data: unknown) {
  return request<ApiTransfer>('/api/transfers', { method: 'POST', body: JSON.stringify(data) });
}

export function dispatchTransfer(id: string, module?: BusinessModule) {
  return request<ApiTransfer>(`/api/transfers/${id}/dispatch${moduleSuffix(module)}`, { method: 'PATCH' });
}

export function completeTransfer(id: string, module?: BusinessModule) {
  return request<ApiTransfer>(`/api/transfers/${id}/complete${moduleSuffix(module)}`, { method: 'PATCH' });
}

export function cancelTransfer(id: string, module?: BusinessModule, reason?: string) {
  return request<ApiTransfer>(`/api/transfers/${id}/cancel${moduleSuffix(module)}`, {
    method: 'PATCH',
    body: JSON.stringify({ reason: reason ?? '' }),
  });
}

// ─── Sales ───────────────────────────────────────────────────────────────────

export function getSales(params?: {
  module?: BusinessModule;
  locationId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.module) query.set('module', params.module);
  if (params?.locationId) query.set('locationId', params.locationId);
  if (params?.status) query.set('status', params.status);
  if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params?.dateTo) query.set('dateTo', params.dateTo);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<ApiSale>>(`/api/sales${suffix}`).then((r) => r.data);
}

export function getSale(id: string, module?: BusinessModule) {
  return request<ApiSale>(`/api/sales/${id}${moduleSuffix(module)}`);
}

export function createSale(data: unknown) {
  return request<ApiSale>('/api/sales', { method: 'POST', body: JSON.stringify(data) });
}

export function refundSale(id: string, refundReason: string, module?: BusinessModule) {
  return request<ApiSale>(`/api/sales/${id}/refund${moduleSuffix(module)}`, { method: 'PATCH', body: JSON.stringify({ refundReason }) });
}

// ─── Adjustments ─────────────────────────────────────────────────────────────

export function getAdjustments(params?: { module?: BusinessModule; status?: string }) {
  const query = new URLSearchParams();
  if (params?.module) query.set('module', params.module);
  if (params?.status) query.set('status', params.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<unknown>>(`/api/adjustments${suffix}`).then((r) => r.data);
}

export function createAdjustment(data: unknown) {
  return request<unknown>('/api/adjustments', { method: 'POST', body: JSON.stringify(data) });
}

export function approveAdjustment(id: string, module?: BusinessModule) {
  return request<unknown>(`/api/adjustments/${id}/approve${moduleSuffix(module)}`, { method: 'PATCH' });
}

export function rejectAdjustment(id: string, reason: string, module?: BusinessModule) {
  return request<unknown>(`/api/adjustments/${id}/reject${moduleSuffix(module)}`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

// ─── Bundles ─────────────────────────────────────────────────────────────────

export function getBundles(params?: { status?: string; archived?: boolean }) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.archived !== undefined) query.set('archived', String(params.archived));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<PagedResponse<ApiBundle>>(`/api/bundles${suffix}`).then((r) => r.data);
}

export function getBundle(id: string) {
  return request<ApiBundle>(`/api/bundles/${id}`);
}

export function createBundle(data: unknown) {
  return request<ApiBundle>('/api/bundles', { method: 'POST', body: JSON.stringify(data) });
}

export function updateBundle(id: string, data: unknown) {
  return request<ApiBundle>(`/api/bundles/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function approveBundle(id: string) {
  return request<ApiBundle>(`/api/bundles/${id}/approve`, { method: 'PATCH' });
}

export function rejectBundle(id: string, rejectionReason: string) {
  return request<ApiBundle>(`/api/bundles/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ rejectionReason }) });
}

export function activateBundle(id: string) {
  return request<ApiBundle>(`/api/bundles/${id}/activate`, { method: 'PATCH' });
}

export function deactivateBundle(id: string) {
  return request<ApiBundle>(`/api/bundles/${id}/deactivate`, { method: 'PATCH' });
}

export function archiveBundle(id: string) {
  return request<ApiBundle>(`/api/bundles/${id}/archive`, { method: 'PATCH' });
}

export function restoreBundle(id: string) {
  return request<ApiBundle>(`/api/bundles/${id}/restore`, { method: 'POST' });
}

export function deleteBundle(id: string) {
  return request<ApiBundle>(`/api/bundles/${id}`, { method: 'DELETE' });
}

// ─── Notifications ───────────────────────────────────────────────────────────

export function getNotifications(params?: { unread?: boolean }) {
  const suffix = params?.unread ? '?unread=true' : '';
  return request<PagedResponse<ApiNotification>>(`/api/notifications${suffix}`).then((r) => r.data);
}

export function getUnreadNotificationCount() {
  return request<number>('/api/notifications/unread-count');
}

export function markNotificationRead(id: string) {
  return request<ApiNotification>(`/api/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead() {
  return request<{ success: boolean }>('/api/notifications/read-all', { method: 'PATCH' });
}
