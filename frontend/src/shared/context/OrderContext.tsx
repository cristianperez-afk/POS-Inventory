import { createContext, useCallback, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { getLocalDateKey } from '../utils/date';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  lineTotal?: number;
  image?: string;
  itemType?: 'dine-in' | 'takeout';
  notes?: string;
  ingredients?: any[];
}

export interface Order {
  id: string;
  orderNumber?: string;
  customer: string;
  type: 'Dine-In' | 'Takeout' | 'Mixed';
  table: string;
  amountNumber: number;
  subtotal: number;
  serviceFee: number;
  tax: number;
  discount: number;
  discountType?: string;
  paymentStatus: 'Paid' | 'Not Paid' | 'Void' | 'Refunded';
  orderStatus: 'Pending' | 'Preparing' | 'Ready' | 'Served' | 'Completed';
  date: string;
  time: string;
  createdAt?: string;
  paymentAt?: string;
  preparingStartedAt?: string;
  readyAt?: string;
  completedAt?: string;
  tableStartedAt?: string;
  tableEndedAt?: string;
  runningTimeMinutes?: number;
  customerStayMinutes?: number;
  items: OrderItem[];
  paymentId?: string;
  receiptId?: string;
  cashReceived?: number;
  changeGiven?: number;
  cashier?: string;
  queuePosition?: number;
  isQueued?: boolean;
  partySize?: number;
  tableNumbers?: number[];
  requiredSeats?: number;
}

export interface QueuedOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  items: number;
  total: number;
  timestamp: Date;
  queuePosition: number;
  partySize?: number;
  requiredSeats?: number;
}

export interface TableStatus {
  number: number;
  status: 'available' | 'occupied' | 'partially_occupied';
  orderId?: string;
}

interface OrderContextType {
  orders: Order[];
  queuedOrders: QueuedOrder[];
  addOrder: (order: Omit<Order, 'id'>) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;
  removeOrder: (id: string) => void;
  removeFromQueue: (id: string) => void;
  assignQueuedOrderToTable: (id: string, table: string, orderStatus: Order['orderStatus']) => Promise<void>;
  completePayment: (orderId: string, paymentData: { cashReceived: number; changeGiven: number; cashier?: string; paymentId?: string; receiptId?: string }) => Promise<void>;
  completeTableOrder: (orderId: string) => Promise<void>;
  voidOrder: (orderId: string, restock?: boolean) => Promise<void>;
  refundOrder: (orderId: string, restock?: boolean) => Promise<void>;
  reloadOrders: () => Promise<void>;
  paymentCompletedSignal: number; // Signal for when payment is completed
}

const OrderContext = createContext<OrderContextType | null>(null);

export function OrderProvider({ children, currentUser }: { children: ReactNode; currentUser: AuthenticatedUser | null }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const nextId = useRef(1);
  const [paymentCompletedSignal, setPaymentCompletedSignal] = useState(0);

  const reloadOrders = useCallback(async () => {
    if (!currentUser?.id || currentUser.store_type !== 'RESTAURANT') {
      setOrders([]);
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/pos/orders?user_id=${currentUser.id}`);
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        setOrders([]);
        return;
      }

      const mapped = data.map(mapDatabaseRestaurantOrder);
      setOrders(mapped);
      nextId.current = mapped.length + 1;
    } catch {
      setOrders([]);
    }
  }, [currentUser?.id, currentUser?.store_type]);

  useEffect(() => {
    void reloadOrders();
  }, [reloadOrders]);

  // Derive queued orders from orders with isQueued = true
  const queuedOrders: QueuedOrder[] = orders
    .filter(o => o.isQueued && o.table === 'Queue' && o.orderStatus !== 'Completed')
    .sort((a, b) => (a.queuePosition || 0) - (b.queuePosition || 0))
    .map(o => ({
      id: o.id,
      orderNumber: o.orderNumber || o.id,
      customerName: o.customer,
      items: o.items.length,
      total: o.amountNumber,
      timestamp: new Date(`${o.date} ${o.time}`),
      queuePosition: o.queuePosition || 0,
      partySize: o.partySize,
      requiredSeats: o.requiredSeats || o.partySize,
    }));

  const addOrder = (order: Omit<Order, 'id'>) => {
    const id = String(nextId.current).padStart(6, '0');
    nextId.current += 1;
    setOrders(prev => [{ ...order, id }, ...prev]);
  };

  const updateOrder = (id: string, updates: Partial<Order>) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const removeOrder = (id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
  };

  const voidOrder = async (orderId: string, restock: boolean = false) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? { ...o, paymentStatus: 'Void' as const, orderStatus: 'Completed' as const }
        : o
    ));

    if (!currentUser?.id || !order.orderNumber) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/pos/orders/${encodeURIComponent(order.orderNumber)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          paymentStatus: 'VOIDED',
          orderStatus: 'COMPLETED',
          restock,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? 'Unable to void order.');
      }
    } catch (error) {
      setOrders(prev => prev.map(o => o.id === orderId ? order : o));
      throw error;
    }

    setPaymentCompletedSignal(prev => prev + 1);
  };

  const refundOrder = async (orderId: string, restock: boolean = false) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? { ...o, paymentStatus: 'Refunded' as const, orderStatus: 'Completed' as const }
        : o
    ));

    if (!currentUser?.id || !order.orderNumber) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/pos/orders/${encodeURIComponent(order.orderNumber)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          paymentStatus: 'REFUNDED',
          orderStatus: 'COMPLETED',
          restock,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? 'Unable to refund order.');
      }
    } catch (error) {
      setOrders(prev => prev.map(o => o.id === orderId ? order : o));
      throw error;
    }

    setPaymentCompletedSignal(prev => prev + 1);
  };

  const removeFromQueue = (id: string) => {
    setOrders(prev => prev.map(o =>
      o.id === id ? { ...o, isQueued: false, queuePosition: undefined } : o
    ));
  };

  const toDatabaseOrderStatus = (status: Order['orderStatus']) =>
    status === 'Preparing' ? 'PREPARING' :
    status === 'Ready' ? 'READY' :
    status === 'Served' ? 'SERVED' :
    status === 'Completed' ? 'COMPLETED' :
    'PENDING';

  const assignQueuedOrderToTable = async (id: string, table: string, orderStatus: Order['orderStatus']) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;

    setOrders(prev => prev.map(o =>
      o.id === id
        ? { ...o, table, isQueued: false, queuePosition: undefined, orderStatus }
        : o
    ));

    if (!currentUser?.id || !order.orderNumber) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/pos/orders/${encodeURIComponent(order.orderNumber)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          tableName: table,
          orderStatus: toDatabaseOrderStatus(orderStatus),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? 'Unable to update table assignment.');
      }
    } catch (error) {
      setOrders(prev => prev.map(o => o.id === id ? order : o));
      throw error;
    }
  };

  const completePayment = async (orderId: string, paymentData: { cashReceived: number; changeGiven: number; cashier?: string; paymentId?: string; receiptId?: string }) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const paymentId = paymentData.paymentId ?? `PAY-${Date.now()}`;
    const receiptId = paymentData.receiptId ?? `REC-${Date.now()}`;

    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? {
            ...o,
            paymentStatus: 'Paid' as const,
            orderStatus: 'Completed' as const,
            cashReceived: paymentData.cashReceived,
            changeGiven: paymentData.changeGiven,
            cashier: paymentData.cashier,
            paymentId,
            receiptId,
          }
        : o
    ));

    if (currentUser?.id && order.orderNumber) {
      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/pos/orders/${encodeURIComponent(order.orderNumber)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: currentUser.id,
            orderStatus: 'COMPLETED',
            paymentStatus: 'PAID',
            payment: {
              paymentNumber: paymentId,
              method: 'Cash',
              amountPaid: paymentData.cashReceived,
              changeAmount: paymentData.changeGiven,
            },
          }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message ?? 'Unable to complete payment.');
        }
      } catch (error) {
        setOrders(prev => prev.map(o => o.id === orderId ? order : o));
        throw error;
      }
    }

    setPaymentCompletedSignal(prev => prev + 1);
  };

  const completeTableOrder = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, orderStatus: 'Completed' as const } : o
    ));

    if (!currentUser?.id || !order.orderNumber) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/pos/orders/${encodeURIComponent(order.orderNumber)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          orderStatus: 'COMPLETED',
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? 'Unable to release table.');
      }
    } catch (error) {
      setOrders(prev => prev.map(o => o.id === orderId ? order : o));
      throw error;
    }

    setPaymentCompletedSignal(prev => prev + 1);
  };

  return (
    <OrderContext.Provider value={{
      orders,
      queuedOrders,
      addOrder,
      updateOrder,
      removeOrder,
      removeFromQueue,
      assignQueuedOrderToTable,
      completePayment,
      completeTableOrder,
      voidOrder,
      refundOrder,
      reloadOrders,
      paymentCompletedSignal,
    }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error('useOrders must be used within OrderProvider');
  return ctx;
}

function mapDatabaseRestaurantOrder(row: any): Order {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const completedAt = row.completed_at ? new Date(row.completed_at) : null;
  const tableStartedAt = row.table_started_at ? new Date(row.table_started_at) : null;
  const tableEndedAt = row.table_ended_at ? new Date(row.table_ended_at) : null;
  const minutesBetween = (start: Date | null, end: Date | null) => {
    if (!start) return undefined;
    const endTime = end ?? new Date();
    return Math.max(0, Math.round((endTime.getTime() - start.getTime()) / 60000));
  };
  const items = Array.isArray(row.items) ? row.items : [];
  const tableName = row.table_name ? String(row.table_name) : '-';
  const queueMatch = tableName.match(/^Queue(?:\s*#?(\d+))?/i);
  const tableNumbers = tableName
    .match(/Table\s+\d+/gi)
    ?.map((label) => Number(label.match(/\d+/)?.[0]))
    .filter((value) => Number.isFinite(value));
  const partySize = Number(row.party_size ?? row.partySize ?? row.required_seats ?? 0);
  const paymentStatus: Order['paymentStatus'] =
    row.payment_status === 'REFUNDED' ? 'Refunded' :
    row.payment_status === 'VOIDED' || row.payment_status === 'VOID' ? 'Void' :
    row.payment_status === 'PAID' ? 'Paid' :
    'Not Paid';
  const orderStatus: Order['orderStatus'] =
    row.order_status === 'PREPARING' ? 'Preparing' :
    row.order_status === 'READY' ? 'Ready' :
    row.order_status === 'SERVED' ? 'Served' :
    row.order_status === 'COMPLETED' ? 'Completed' :
    'Pending';
  const isQueued = Boolean(queueMatch) && orderStatus !== 'Completed';
  const type: Order['type'] =
    row.order_type === 'DINE_IN' ? 'Dine-In' :
    row.order_type === 'MIXED' ? 'Mixed' :
    'Takeout';

  return {
    id: String(row.id).padStart(6, '0'),
    orderNumber: row.order_number ?? String(row.id).padStart(6, '0'),
    customer: row.customer_name || 'Walk-in Customer',
    type,
    table: isQueued ? 'Queue' : tableName,
    amountNumber: Number(row.total_amount ?? 0),
    subtotal: Number(row.subtotal ?? 0),
    serviceFee: Number(row.service_charge ?? 0),
    tax: Number(row.tax_amount ?? 0),
    discount: Number(row.discount_amount ?? 0),
    discountType: row.discount_type ?? undefined,
    paymentStatus,
    orderStatus,
    date: getLocalDateKey(createdAt),
    time: createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    createdAt: row.created_at ?? undefined,
    paymentAt: row.payment_at ?? undefined,
    preparingStartedAt: row.preparing_started_at ?? undefined,
    readyAt: row.ready_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    tableStartedAt: row.table_started_at ?? undefined,
    tableEndedAt: row.table_ended_at ?? undefined,
    runningTimeMinutes: minutesBetween(createdAt, completedAt),
    customerStayMinutes: tableStartedAt ? minutesBetween(tableStartedAt, tableEndedAt ?? completedAt) : undefined,
    items: items.map((item: any) => ({
      name: item.product_name,
      quantity: Number(item.quantity ?? 0),
      price: Number(item.unit_price ?? 0),
      lineTotal: Number(item.line_total ?? (Number(item.unit_price ?? 0) * Number(item.quantity ?? 0))),
      image: item.image_url ?? item.image ?? undefined,
      itemType: item.item_type === 'dine-in' || item.item_type === 'DINE_IN' ? 'dine-in' : 'takeout',
      notes: item.notes ?? undefined,
      ingredients: item.ingredients ?? undefined,
    })),
    paymentId: row.payment_number ?? undefined,
    receiptId: row.receipt_number ?? (row.payment_number ? String(row.payment_number).replace(/^PAY-/, 'REC-') : undefined),
    cashReceived: row.amount_paid !== null && row.amount_paid !== undefined ? Number(row.amount_paid) : undefined,
    changeGiven: row.change_amount !== null && row.change_amount !== undefined ? Number(row.change_amount) : undefined,
    cashier: row.cashier_name ?? undefined,
    isQueued,
    queuePosition: isQueued && queueMatch?.[1] ? Number(queueMatch[1]) : undefined,
    partySize: partySize > 0 ? partySize : undefined,
    requiredSeats: partySize > 0 ? partySize : undefined,
    tableNumbers,
  };
}
