import { apiClient } from '../../api/apiClient';

export const posApi = {
  createOrder: <T = unknown>(payload: Record<string, unknown>) => apiClient<T>('/pos/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  listOrders: <T>() => apiClient<T[]>('/admin/pos/orders'),
  updateOrder: <T = unknown>(orderNumber: string, payload: Record<string, unknown>) => apiClient<T>(
    `/admin/pos/orders/${encodeURIComponent(orderNumber)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  ),
  listTables: <T>() => apiClient<T[]>('/admin/pos/tables'),
  createTable: <T = unknown>(payload: Record<string, unknown>) => apiClient<T>('/admin/pos/tables', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateTable: <T = unknown>(tableId: string, payload: Record<string, unknown>) => apiClient<T>(`/admin/pos/tables/${tableId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  deleteTable: (tableId: string) => apiClient<void>(`/admin/pos/tables/${tableId}`, {
    method: 'DELETE',
  }),
  updateTableOccupancy: <T = unknown>(tableId: string, occupiedSeats: number) => apiClient<T>(
    `/admin/pos/tables/${tableId}/occupancy`,
    {
      method: 'PATCH',
      body: JSON.stringify({ occupied_seats: occupiedSeats }),
    },
  ),
  getNextOrderNumber: () => apiClient<{ order_number?: string; orderNumber?: string }>('/admin/pos/next-order-number'),
};
