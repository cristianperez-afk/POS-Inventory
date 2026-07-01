import { createContext, useCallback, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { formatManilaTime, getManilaDateKey, parseDatabaseTimestamp } from '../utils/date';
import { posApi } from '../api/posApi';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  lineTotal?: number;
  image?: string;
  itemType?: 'dine-in' | 'takeout';
  notes?: string;
  ingredients?: any[];
  addedIngredients?: string[];
  removedIngredients?: string[];
  changedIngredients?: string[];
  replacedIngredients?: string[];
  modifiers?: string[];
  prepTimeMinutes?: number;
  customizationPrepMinutes?: number;
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
  orderedAt?: string;
  createdAt?: string;
  paymentAt?: string;
  preparingStartedAt?: string;
  readyAt?: string;
  serviceStartedAt?: string;
  servedAt?: string;
  serviceDuration?: number;
  completedAt?: string;
  tableStartedAt?: string;
  tableEndedAt?: string;
  stayStartedAt?: string;
  stayEndedAt?: string;
  runningTimeStart?: string;
  runningTimeEnd?: string;
  /** Persisted elapsed seconds once the restaurant order is finalized. */
  runningDuration?: number;
  isRunning?: boolean;
  runningTimeMinutes?: number;
  customerStayMinutes?: number;
  estimatedPrepMinutes?: number;
  estimatedReadyAt?: string;
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
      const data = await posApi.listOrders<any>();
      if (!Array.isArray(data)) {
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

  useEffect(() => {
    const refreshOrders = () => {
      void reloadOrders();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'pos-order-updated-at') refreshOrders();
    };

    window.addEventListener('pos-order-updated', refreshOrders);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('pos-order-updated', refreshOrders);
      window.removeEventListener('storage', handleStorage);
    };
  }, [reloadOrders]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setOrders(prev => prev.map((order) => {
        const prepStartedAt = order.orderedAt ? parseDatabaseTimestamp(order.orderedAt) : null;
        const prepEndedAt = getServiceEndTimestamp(order);
        const tableStartedAt = order.type === 'Dine-In' || order.type === 'Mixed'
          ? order.tableStartedAt || order.orderedAt ? parseDatabaseTimestamp(order.tableStartedAt ?? order.orderedAt!) : null
          : null;
        const tableEndedAt = getStayEndTimestamp(order);
        const now = new Date();

        return {
          ...order,
          runningTimeMinutes: prepStartedAt
            ? Math.max(0, Math.floor(((prepEndedAt ?? now).getTime() - prepStartedAt.getTime()) / 60000))
            : 0,
          customerStayMinutes: tableStartedAt
            ? Math.max(0, Math.floor(((tableEndedAt ?? now).getTime() - tableStartedAt.getTime()) / 60000))
            : 0,
        };
      }));
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

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
      await posApi.updateOrder(order.orderNumber, {
          paymentStatus: 'VOIDED',
          orderStatus: 'COMPLETED',
          restock,
      });
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
      await posApi.updateOrder(order.orderNumber, {
          paymentStatus: 'REFUNDED',
          orderStatus: 'COMPLETED',
          restock,
      });
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
      await posApi.updateOrder(order.orderNumber, {
          tableName: table,
          orderStatus: toDatabaseOrderStatus(orderStatus),
      });
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
    const paidAtIso = new Date().toISOString();
    const shouldCloseStay = order.paymentStatus !== 'Paid';
    const staySeconds = calculateElapsedSeconds(order.tableStartedAt ?? order.orderedAt, paidAtIso);

    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? {
            ...o,
            paymentStatus: 'Paid' as const,
            paymentAt: paidAtIso,
            orderStatus: shouldCloseStay && (o.type === 'Dine-In' || o.type === 'Mixed') ? 'Completed' as const : o.orderStatus,
            completedAt: shouldCloseStay && (o.type === 'Dine-In' || o.type === 'Mixed') ? (o.completedAt ?? paidAtIso) : o.completedAt,
            tableEndedAt: shouldCloseStay && (o.type === 'Dine-In' || o.type === 'Mixed') ? (o.tableEndedAt ?? paidAtIso) : o.tableEndedAt,
            runningTimeEnd: shouldCloseStay && (o.type === 'Dine-In' || o.type === 'Mixed') ? (o.runningTimeEnd ?? paidAtIso) : o.runningTimeEnd,
            runningDuration: shouldCloseStay && (o.type === 'Dine-In' || o.type === 'Mixed') ? (o.runningDuration ?? staySeconds) : o.runningDuration,
            isRunning: shouldCloseStay && (o.type === 'Dine-In' || o.type === 'Mixed') ? false : o.isRunning,
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
        await posApi.updateOrder(order.orderNumber, {
            paymentStatus: 'PAID',
            payment: {
              paymentNumber: paymentId,
              method: 'Cash',
              amountPaid: paymentData.cashReceived,
              changeAmount: paymentData.changeGiven,
            },
        });
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
    const completedAt = new Date();
    const prepStartedAt = order.orderedAt ? parseDatabaseTimestamp(order.orderedAt) : null;
    const tableStartedAt = order.type === 'Dine-In' || order.type === 'Mixed'
      ? order.tableStartedAt || order.orderedAt ? parseDatabaseTimestamp(order.tableStartedAt ?? order.orderedAt!) : null
      : null;
    const runningTimeMinutes = prepStartedAt
      ? Math.max(0, Math.floor((completedAt.getTime() - prepStartedAt.getTime()) / 60000))
      : 0;
    const customerStayMinutes = tableStartedAt
      ? Math.max(0, Math.floor((completedAt.getTime() - tableStartedAt.getTime()) / 60000))
      : 0;
    const completedAtIso = completedAt.toISOString();

    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? { ...o, orderStatus: 'Completed' as const, completedAt: completedAtIso, tableEndedAt: completedAtIso, runningTimeEnd: o.runningTimeEnd ?? completedAtIso, runningTimeMinutes, customerStayMinutes, isRunning: false }
        : o
    ));

    if (!currentUser?.id || !order.orderNumber) return;

    try {
      await posApi.updateOrder(order.orderNumber, {
          orderStatus: 'COMPLETED',
      });
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

function calculateElapsedSeconds(start?: string, end?: string) {
  if (!start) return undefined;
  const startMs = parseDatabaseTimestamp(start).getTime();
  const endMs = end ? parseDatabaseTimestamp(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return undefined;
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

function firstValidTimestamp(...values: Array<string | undefined | null>) {
  for (const value of values) {
    if (!value) continue;
    const timestamp = parseDatabaseTimestamp(value);
    if (Number.isFinite(timestamp.getTime())) return timestamp;
  }
  return null;
}

function getServiceEndTimestamp(order: Pick<Order, 'servedAt' | 'runningTimeEnd' | 'completedAt' | 'tableEndedAt' | 'paymentAt' | 'orderStatus'>) {
  if (order.servedAt) return firstValidTimestamp(order.servedAt);
  if (order.orderStatus !== 'Served' && order.orderStatus !== 'Completed') return null;
  return firstValidTimestamp(order.runningTimeEnd, order.completedAt, order.tableEndedAt, order.paymentAt);
}

function getStayEndTimestamp(order: Pick<Order, 'type' | 'tableEndedAt' | 'runningTimeEnd' | 'completedAt' | 'paymentAt'>) {
  if (order.type !== 'Dine-In' && order.type !== 'Mixed') return null;
  return firstValidTimestamp(order.tableEndedAt, order.runningTimeEnd);
}

function mapDatabaseRestaurantOrder(row: any): Order {
  const valueOf = (...keys: string[]) => {
    for (const key of keys) {
      if (row[key] !== null && row[key] !== undefined && row[key] !== '') return row[key];
    }
    return undefined;
  };
  const orderedAtValue = valueOf('ordered_at', 'orderedAt');
  const servedAtValue = valueOf('served_at', 'servedAt');
  const createdAtValue = valueOf('created_at', 'createdAt');
  const completedAtValue = valueOf('completed_at', 'completedAt');
  const tableStartedAtValue = valueOf('table_started_at', 'tableStartedAt', 'stayStartedAt');
  const tableEndedAtValue = valueOf('table_ended_at', 'tableEndedAt', 'stayEndedAt');
  const orderedAt = orderedAtValue ? parseDatabaseTimestamp(orderedAtValue) : null;
  const createdAt = createdAtValue ? parseDatabaseTimestamp(createdAtValue) : null;
  const rawCompletedAt = completedAtValue ? parseDatabaseTimestamp(completedAtValue) : null;
  const runningTimeStart = valueOf('running_time_start', 'runningTimeStart') ? parseDatabaseTimestamp(valueOf('running_time_start', 'runningTimeStart')) : null;
  const runningTimeEnd = valueOf('running_time_end', 'runningTimeEnd') ? parseDatabaseTimestamp(valueOf('running_time_end', 'runningTimeEnd')) : null;
  const tableStartedAt = tableStartedAtValue ? parseDatabaseTimestamp(tableStartedAtValue) : null;
  const tableEndedAt = tableEndedAtValue ? parseDatabaseTimestamp(tableEndedAtValue) : null;
  const normalizedTimestamp = (value: unknown) => {
    const timestamp = parseDatabaseTimestamp(value);
    return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
  };
  const minutesBetween = (start: Date | null, end: Date | null) => {
    if (!start) return undefined;
    const endTime = end ?? new Date();
    return Math.max(0, Math.floor((endTime.getTime() - start.getTime()) / 60000));
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
  const estimatedPrepMinutes = valueOf('estimated_prep_minutes', 'estimatedPrepMinutes') !== undefined ? Number(valueOf('estimated_prep_minutes', 'estimatedPrepMinutes')) : undefined;
  const computedEstimatedReadyAt = orderedAt && Number.isFinite(Number(estimatedPrepMinutes)) && Number(estimatedPrepMinutes) > 0
    ? new Date(orderedAt.getTime() + Math.ceil(Number(estimatedPrepMinutes)) * 60000).toISOString()
    : normalizedTimestamp(valueOf('estimated_ready_at', 'estimatedReadyAt'));
  const completedAt = orderStatus === 'Completed' ? rawCompletedAt : null;
  const isQueued = Boolean(queueMatch) && orderStatus !== 'Completed';
  const type: Order['type'] =
    row.order_type === 'DINE_IN' ? 'Dine-In' :
    row.order_type === 'MIXED' ? 'Mixed' :
    'Takeout';
  const serviceEnd = firstValidTimestamp(
    normalizedTimestamp(servedAtValue),
    orderStatus === 'Served' || orderStatus === 'Completed' ? normalizedTimestamp(valueOf('running_time_end', 'runningTimeEnd')) : undefined,
    orderStatus === 'Completed' ? normalizedTimestamp(completedAtValue) : undefined,
    orderStatus === 'Completed' ? normalizedTimestamp(tableEndedAtValue) : undefined,
    orderStatus === 'Completed' ? normalizedTimestamp(valueOf('payment_at', 'paymentAt')) : undefined,
  );
  const stayEnd = type === 'Dine-In' || type === 'Mixed'
    ? firstValidTimestamp(
      normalizedTimestamp(tableEndedAtValue),
      normalizedTimestamp(valueOf('running_time_end', 'runningTimeEnd')),
    )
    : null;

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
    date: orderedAt ? getManilaDateKey(orderedAt) : '',
    time: orderedAt ? formatManilaTime(orderedAt) : '',
    orderedAt: normalizedTimestamp(orderedAtValue),
    createdAt: normalizedTimestamp(createdAtValue),
    paymentAt: normalizedTimestamp(valueOf('payment_at', 'paymentAt')),
    preparingStartedAt: normalizedTimestamp(valueOf('preparing_started_at', 'preparingStartedAt')),
    readyAt: normalizedTimestamp(valueOf('ready_at', 'readyAt')),
    serviceStartedAt: normalizedTimestamp(valueOf('service_started_at', 'serviceStartedAt')),
    servedAt: normalizedTimestamp(servedAtValue),
    serviceDuration: valueOf('service_duration', 'serviceDuration') !== undefined ? Number(valueOf('service_duration', 'serviceDuration')) : undefined,
    completedAt: completedAt ? normalizedTimestamp(completedAtValue) : undefined,
    tableStartedAt: normalizedTimestamp(tableStartedAtValue),
    tableEndedAt: normalizedTimestamp(tableEndedAtValue),
    stayStartedAt: normalizedTimestamp(tableStartedAtValue),
    stayEndedAt: normalizedTimestamp(tableEndedAtValue),
    runningTimeStart: normalizedTimestamp(valueOf('running_time_start', 'runningTimeStart')),
    runningTimeEnd: normalizedTimestamp(valueOf('running_time_end', 'runningTimeEnd')),
    runningDuration: valueOf('running_duration', 'runningDuration') !== undefined ? Number(valueOf('running_duration', 'runningDuration')) : undefined,
    isRunning: Boolean(valueOf('is_running', 'isRunning')),
    // Kept for older consumers; never fall back to created_at for elapsed timers.
    runningTimeMinutes: minutesBetween(orderedAt, serviceEnd),
    customerStayMinutes: tableStartedAt && (type === 'Dine-In' || type === 'Mixed') ? minutesBetween(tableStartedAt, stayEnd ?? tableEndedAt) : undefined,
    estimatedPrepMinutes,
    estimatedReadyAt: computedEstimatedReadyAt,
    items: items.map((item: any) => ({
      name: item.product_name,
      quantity: Number(item.quantity ?? 0),
      price: Number(item.unit_price ?? 0),
      lineTotal: Number(item.line_total ?? (Number(item.unit_price ?? 0) * Number(item.quantity ?? 0))),
      image: item.image_url ?? item.image ?? undefined,
      itemType: item.item_type === 'dine-in' || item.item_type === 'DINE_IN' ? 'dine-in' : 'takeout',
      notes: item.notes ?? undefined,
      ingredients: item.ingredients ?? undefined,
      addedIngredients: item.added_ingredients ?? item.addedIngredients ?? [],
      removedIngredients: item.removed_ingredients ?? item.removedIngredients ?? [],
      changedIngredients: item.changed_ingredients ?? item.changedIngredients ?? [],
      replacedIngredients: item.replaced_ingredients ?? item.replacedIngredients ?? [],
      modifiers: item.modifiers ?? [],
      prepTimeMinutes: item.prep_time_minutes !== null && item.prep_time_minutes !== undefined ? Number(item.prep_time_minutes) : undefined,
      customizationPrepMinutes: item.customization_prep_minutes !== null && item.customization_prep_minutes !== undefined ? Number(item.customization_prep_minutes) : undefined,
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
