import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { getLocalDateKey } from '../../shared/utils/date';

export interface OrderItem {
  name: string;
  category: string;
  size?: string;
  color?: string;
  quantity: number;
  price: number;
  image?: string;
  refunded?: boolean;
  refundedQuantity?: number;
}

export interface Order {
  id: string;
  transactionNumber?: string;
  customer?: string;
  contactNumber?: string;
  amountNumber: number;
  subtotal: number;
  serviceFee: number;
  tax: number;
  discount: number;
  discountType?: string;
  paymentStatus: 'Paid' | 'Not Paid' | 'Refunded' | 'Partially Refunded' | 'Void';
  paymentMethod?: 'Cash' | 'Card' | 'GCash' | 'PayMaya';
  date: string;
  time: string;
  items: OrderItem[];
  paymentId?: string;
  receiptId?: string;
  cashReceived?: number;
  changeGiven?: number;
  cashier?: string;
  refundTransactionId?: string;
  refundDate?: string;
  refundReason?: string;
  voidDate?: string;
  voidReason?: string;
  voidBy?: string;
}

export interface CustomerPurchaseHistory {
  customerId: string;
  customerName: string;
  contactNumber?: string;
  purchases: Order[];
  totalSpent: number;
  lastPurchaseDate: string;
  frequentCategories: string[];
}

const initialOrders: Order[] = [
  {
    id: '000001',
    customer: 'Juan Dela Cruz',
    amountNumber: 620.00,
    subtotal: 550.00,
    serviceFee: 0,
    tax: 66.00,
    discount: 0,
    paymentStatus: 'Paid',
    paymentMethod: 'Cash',
    date: '2026-05-28',
    time: '10:30 AM',
    items: [
      { name: 'Denim Jacket', category: 'Jackets', size: 'L', color: 'Blue', quantity: 1, price: 250 },
      { name: 'Polo Shirt', category: 'Shirts', size: 'M', color: 'White', quantity: 2, price: 150 },
    ],
    paymentId: 'PAY-001234',
    receiptId: 'REC-001234',
    cashReceived: 700,
    changeGiven: 80,
    cashier: 'Joseph Dalton',
  },
  {
    id: '000002',
    customer: 'Maria Santos',
    amountNumber: 895.00,
    subtotal: 850.00,
    serviceFee: 0,
    tax: 102.00,
    discount: 57.00,
    discountType: 'Senior Citizen (20%)',
    paymentStatus: 'Paid',
    paymentMethod: 'GCash',
    date: '2026-05-28',
    time: '11:15 AM',
    items: [
      { name: 'Floral Dress', category: 'Dresses', size: 'M', color: 'Pink', quantity: 1, price: 350 },
      { name: 'Leather Bag', category: 'Bags', color: 'Brown', quantity: 1, price: 500 },
    ],
    paymentId: 'PAY-001235',
    receiptId: 'REC-001235',
    cashReceived: 900,
    changeGiven: 5,
    cashier: 'Joseph Dalton',
  },
  {
    id: '000003',
    customer: 'Mark Reyes',
    amountNumber: 380.00,
    subtotal: 350.00,
    serviceFee: 0,
    tax: 42.00,
    discount: 12.00,
    discountType: 'PWD (10%)',
    paymentStatus: 'Paid',
    paymentMethod: 'Cash',
    date: '2026-05-28',
    time: '12:00 PM',
    items: [
      { name: 'Chino Pants', category: 'Pants', size: '32', color: 'Khaki', quantity: 1, price: 200 },
      { name: 'Belt', category: 'Accessories', color: 'Black', quantity: 1, price: 150 },
    ],
    paymentId: 'PAY-001236',
    receiptId: 'REC-001236',
    cashReceived: 400,
    changeGiven: 20,
    cashier: 'Maria Santos',
  },
  {
    id: '000004',
    customer: 'Anna Lim',
    amountNumber: 580.00,
    subtotal: 520.00,
    serviceFee: 0,
    tax: 62.40,
    discount: 0,
    paymentStatus: 'Paid',
    paymentMethod: 'Cash',
    date: '2026-05-29',
    time: '01:20 PM',
    items: [
      { name: 'Sneakers', category: 'Shoes', size: '7', color: 'White', quantity: 1, price: 400 },
      { name: 'Cap', category: 'Accessories', color: 'Red', quantity: 1, price: 120 },
    ],
    paymentId: 'PAY-001237',
    receiptId: 'REC-001237',
    cashReceived: 600,
    changeGiven: 20,
    cashier: 'Joseph Dalton',
  },
  {
    id: '000005',
    customer: 'Angel Cruize',
    amountNumber: 720.00,
    subtotal: 650.00,
    serviceFee: 0,
    tax: 78.00,
    discount: 8.00,
    paymentStatus: 'Paid',
    paymentMethod: 'PayMaya',
    date: '2026-05-30',
    time: '02:45 PM',
    items: [
      { name: 'Cardigan', category: 'Jackets', size: 'S', color: 'Gray', quantity: 1, price: 280 },
      { name: 'Jeans', category: 'Pants', size: '28', color: 'Blue', quantity: 1, price: 320 },
      { name: 'Scarf', category: 'Accessories', color: 'Beige', quantity: 1, price: 50 },
    ],
    paymentId: 'PAY-001238',
    receiptId: 'REC-001238',
    cashReceived: 720,
    changeGiven: 0,
    cashier: 'Maria Santos',
  },
];

interface OrderContextType {
  orders: Order[];
  addOrder: (order: Omit<Order, 'id'>) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;
  removeOrder: (id: string) => void;
  refundOrderItems: (orderId: string, itemIndices: number[], refundReason?: string) => void;
  voidTransaction: (orderId: string, voidReason: string, voidBy?: string) => void;
  completePayment: (orderId: string, paymentData: {
    cashReceived: number;
    changeGiven: number;
    paymentMethod: 'Cash' | 'Card' | 'GCash' | 'PayMaya';
    cashier?: string;
  }) => void;
  getCustomerHistory: (customerName: string) => CustomerPurchaseHistory | null;
  getRecommendedProducts: (customerName: string) => string[];
}

const OrderContext = createContext<OrderContextType | null>(null);

export function RetailOrderProvider({ children, currentUser }: { children: ReactNode; currentUser: AuthenticatedUser | null }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const loadOrders = async () => {
      if (!currentUser?.id || currentUser.store_type !== 'RETAIL_STORE') {
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

        const mapped = data.map(mapDatabaseRetailOrder);
        setOrders(mapped);
        nextId.current = mapped.reduce((highest, order) => {
          const numericId = Number(order.id);
          return Number.isFinite(numericId) ? Math.max(highest, numericId) : highest;
        }, 0) + 1;
      } catch {
        setOrders([]);
      }
    };

    void loadOrders();
  }, [currentUser?.id, currentUser?.store_type]);

  const addOrder = (order: Omit<Order, 'id'>) => {
    const id = order.transactionNumber || String(nextId.current).padStart(6, '0');
    nextId.current += 1;
    setOrders(prev => [{ ...order, id }, ...prev]);
  };

  const updateOrder = (id: string, updates: Partial<Order>) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const removeOrder = (id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
  };

  const refundOrderItems = (orderId: string, itemIndices: number[], refundReason?: string) => {
    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;

      const updatedItems = order.items.map((item, index) => {
        if (itemIndices.includes(index)) {
          return {
            ...item,
            refunded: true,
            refundedQuantity: item.quantity
          };
        }
        return item;
      });

      // Check if all items are refunded
      const allRefunded = updatedItems.every(item => item.refunded);
      const someRefunded = updatedItems.some(item => item.refunded);

      // Determine new payment status
      let newPaymentStatus = order.paymentStatus;
      if (allRefunded) {
        newPaymentStatus = 'Refunded' as const;
      } else if (someRefunded) {
        newPaymentStatus = 'Partially Refunded' as const;
      }

      return {
        ...order,
        items: updatedItems,
        paymentStatus: newPaymentStatus,
        refundDate: getLocalDateKey(),
        refundReason: refundReason || 'Customer request',
        refundTransactionId: `REF-${Date.now()}`
      };
    }));
  };

  const voidTransaction = (orderId: string, voidReason: string, voidBy?: string) => {
    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;

      return {
        ...order,
        paymentStatus: 'Void' as const,
        voidDate: getLocalDateKey(),
        voidReason: voidReason || 'Transaction voided',
        voidBy: voidBy || 'Cashier',
      };
    }));
  };

  const completePayment = (orderId: string, paymentData: {
    cashReceived: number;
    changeGiven: number;
    paymentMethod: 'Cash' | 'Card' | 'GCash' | 'PayMaya';
    cashier?: string;
  }) => {
    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? {
            ...o,
            paymentStatus: 'Paid' as const,
            cashReceived: paymentData.cashReceived,
            changeGiven: paymentData.changeGiven,
            paymentMethod: paymentData.paymentMethod,
            cashier: paymentData.cashier,
            paymentId: `PAY-${Date.now()}`,
            receiptId: `REC-${Date.now()}`,
          }
        : o
    ));
  };

  const getCustomerHistory = (customerName: string): CustomerPurchaseHistory | null => {
    const customerOrders = orders.filter(
      o => o.customer && o.customer.toLowerCase() === customerName.toLowerCase() &&
      (o.paymentStatus === 'Paid' || o.paymentStatus === 'Partially Refunded')
    );

    if (customerOrders.length === 0) return null;

    const totalSpent = customerOrders.reduce((sum, o) => sum + o.amountNumber, 0);
    const categoryCount: Record<string, number> = {};

    customerOrders.forEach(order => {
      order.items.forEach(item => {
        categoryCount[item.category] = (categoryCount[item.category] || 0) + item.quantity;
      });
    });

    const frequentCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category]) => category);

    return {
      customerId: customerName.toLowerCase().replace(/\s+/g, '-'),
      customerName,
      purchases: customerOrders,
      totalSpent,
      lastPurchaseDate: customerOrders[0].date,
      frequentCategories,
    };
  };

  const getRecommendedProducts = (customerName: string): string[] => {
    const history = getCustomerHistory(customerName);
    if (!history || history.frequentCategories.length === 0) return [];

    return history.frequentCategories;
  };

  return (
    <OrderContext.Provider value={{
      orders,
      addOrder,
      updateOrder,
      removeOrder,
      refundOrderItems,
      voidTransaction,
      completePayment,
      getCustomerHistory,
      getRecommendedProducts,
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

function mapDatabaseRetailOrder(row: any): Order {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const items = Array.isArray(row.items) ? row.items : [];

  return {
    id: String(row.id).padStart(6, '0'),
    transactionNumber: row.order_number ?? String(row.id).padStart(6, '0'),
    customer: row.customer_name || undefined,
    amountNumber: Number(row.total_amount ?? 0),
    subtotal: Number(row.subtotal ?? 0),
    serviceFee: Number(row.service_charge ?? 0),
    tax: Number(row.tax_amount ?? 0),
    discount: Number(row.discount_amount ?? 0),
    discountType: row.discount_type ?? undefined,
    paymentStatus:
      row.payment_status === 'REFUNDED' ? 'Refunded' :
      row.payment_status === 'PARTIALLY_REFUNDED' ? 'Partially Refunded' :
      row.payment_status === 'VOIDED' ? 'Void' :
      row.payment_status === 'PAID' ? 'Paid' :
      'Not Paid',
    paymentMethod:
      row.payment_method === 'Card' ? 'Card' :
      row.payment_method === 'GCash' ? 'GCash' :
      row.payment_method === 'PayMaya' ? 'PayMaya' :
      'Cash',
    date: getLocalDateKey(createdAt),
    time: createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    items: items.map((item: any) => ({
      name: item.product_name,
      category: item.category_name ?? 'Uncategorized',
      size: item.size ?? undefined,
      color: item.color ?? undefined,
      quantity: Number(item.quantity ?? 0),
      price: Number(item.unit_price ?? 0),
      image: item.image_url ?? item.image ?? undefined,
    })),
    paymentId: row.payment_number ?? undefined,
    cashReceived: row.amount_paid !== null && row.amount_paid !== undefined ? Number(row.amount_paid) : undefined,
    changeGiven: row.change_amount !== null && row.change_amount !== undefined ? Number(row.change_amount) : undefined,
    cashier: row.cashier_name ?? undefined,
  };
}
