import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar } from '../../shared/components/Sidebar';
import { Page, type StoreBrand } from '../../shared/App';
import type { StaffType, StoreType } from '../../auth/types/auth';
import { X, Search, Eye, CreditCard, Printer, RotateCcw, ChevronDown, Download, Users } from 'lucide-react';
import { useOrders, Order, type OrderItem } from '../../shared/context/OrderContext';
import { ThermalReceipt } from '../../shared/components/ThermalReceipt';
import { useStoreSettings } from '../../shared/context/StoreSettingsContext';
import { DeleteConfirmDialog } from '../../shared/components/DeleteConfirmDialog';
import { DateFilterControl, type DateFilterMode } from '../../shared/components/DateFilterControl';
import { formatManilaDateTime, formatManilaTime, getLocalDateKey, parseDatabaseTimestamp, parseLocalDateKey } from '../../shared/utils/date';
import { adminApi } from '../../shared/api/adminApi';
import type { ActivityLog } from '../../shared/api/activityApi';

interface OrderListProps {
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  isAdmin?: boolean;
  storeBrand?: StoreBrand;
  userName?: string | null;
  userRole?: string | null;
  storeType?: StoreType;
  staffType?: StaffType;
}

type ActiveModal = 'details' | 'payment' | 'receipt' | 'refund' | 'cancel' | 'item-cancel' | null;
type TransactionTab = 'history' | 'changes';

const ORDER_TYPES = ['Dine-In', 'Takeout', 'Mixed'];
const PAYMENT_STATUSES = ['Paid', 'Not Paid', 'Refunded', 'Partially Refunded'];
const ORDERS_PER_PAGE = 10;

function generateId(prefix: string) {
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

function normalizeSearchValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatDuration(minutes?: number) {
  if (minutes === undefined) return '-';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} hr${hours === 1 ? '' : 's'}${rest ? ` ${rest} mins` : ''}`;
}

type OrderChangeRecord = {
  id: string;
  createdAt: string;
  orderNumber: string;
  type: string;
  affectedItems: string;
  quantity: string;
  amount: string;
  reason: string;
  initiatedBy: string;
  approvedBy: string;
};

function detailLine(details: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return details.match(new RegExp(`(?:^|\\n)${escapedLabel}:\\s*(.*)`, 'i'))?.[1]?.trim() ?? '';
}

function orderChangeType(log: ActivityLog) {
  const action = log.action.toLowerCase();
  if (action === 'partial item cancellation') return 'Partial Cancellation';
  if (action === 'order cancelled') return 'Full Cancellation';
  if (action.includes('refund')) return detailLine(log.details, 'Items') ? 'Item Refund' : 'Full Refund';
  return '';
}

function parseQuantity(items: string) {
  if (!items || items === 'Full order') return '-';
  const quantities = Array.from(items.matchAll(/\bx\s*([0-9.]+)/gi)).map((match) => Number(match[1]));
  if (quantities.length === 0 || quantities.some((quantity) => !Number.isFinite(quantity))) return '-';
  return String(quantities.reduce((sum, quantity) => sum + quantity, 0));
}

function buildOrderChangeRecords(logs: ActivityLog[]): OrderChangeRecord[] {
  return logs
    .map((log) => {
      const type = orderChangeType(log);
      if (!type) return null;

      const affectedItems = detailLine(log.details, 'Items') || 'Full order';
      const amount = detailLine(log.details, 'Amount');
      return {
        id: String(log.id),
        createdAt: log.created_at,
        orderNumber: log.details.match(/Order #([^\s\n]+)/i)?.[1] ?? '-',
        type,
        affectedItems,
        quantity: parseQuantity(affectedItems),
        amount: amount ? `PHP ${Number(amount).toFixed(2)}` : '-',
        reason: detailLine(log.details, 'Reason') || '-',
        initiatedBy: log.user_name || '-',
        approvedBy: detailLine(log.details, 'Authorized by') || '-',
      };
    })
    .filter((record): record is OrderChangeRecord => Boolean(record));
}

function OrderItemDetail({ item }: { item: OrderItem }) {
  const details = [
    ...(item.removedIngredients ?? []).map((value) => `REMOVE: ${value}`),
    ...(item.addedIngredients ?? []).map((value) => `ADD: ${value}`),
    ...(item.changedIngredients ?? []).map((value) => `CHANGE: ${value}`),
    ...(item.replacedIngredients ?? []).map((value) => `REPLACE: ${value}`),
    ...(item.modifiers ?? []).map((value) => `OPTION: ${value}`),
    ...(item.notes?.trim() ? [`NOTE: ${item.notes.trim()}`] : []),
  ];

  return (
    <div className={`border-b pb-2 ${details.length > 0 ? 'rounded-lg border border-amber-200 bg-amber-50 p-2' : 'border-gray-50'}`}>
      <div className="flex justify-between gap-3 text-sm text-gray-700">
        <span className="flex items-center gap-2">{item.quantity}× {item.name}{details.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-800">Modified</span>}</span>
        <span>₱{Number(item.lineTotal ?? item.price * item.quantity).toFixed(2)}</span>
      </div>
      {details.map((detail, index) => <p key={`${detail}-${index}`} className="mt-1 pl-3 text-[10px] font-medium text-amber-800">{detail}</p>)}
    </div>
  );
}

function formatElapsed(start?: string, end?: string, duration?: number, now = Date.now()) {
  const savedSeconds = Number(duration);
  const startMs = start ? parseDatabaseTimestamp(start).getTime() : NaN;
  const endMs = end ? parseDatabaseTimestamp(end).getTime() : NaN;
  const seconds = Number.isFinite(startMs)
    ? Math.max(0, Math.floor(((Number.isFinite(endMs) ? endMs : now) - startMs) / 1000))
    : Number.isFinite(savedSeconds)
    ? Math.max(0, Math.floor(savedSeconds))
    : 0;
  if (!Number.isFinite(seconds)) return '00:00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [hours, minutes, seconds % 60].map((value) => String(value).padStart(2, '0')).join(':');
}

function preparationEnd(order: Order) {
  if (order.servedAt) return order.servedAt;
  if (!isFinalServedOrder(order)) return undefined;
  return order.runningTimeEnd ?? order.completedAt ?? order.tableEndedAt ?? order.paymentAt;
}

function isFinalServedOrder(order: Order) {
  return order.orderStatus === 'Served' || order.orderStatus === 'Completed';
}

function serveTimeStart(order: Order) {
  const end = preparationEnd(order);
  const endMs = end ? parseDatabaseTimestamp(end).getTime() : Date.now();
  const candidates = [order.orderedAt, order.runningTimeStart, order.preparingStartedAt, order.createdAt];
  return candidates.find((value) => {
    if (!value) return false;
    const startMs = parseDatabaseTimestamp(value).getTime();
    return Number.isFinite(startMs) && (!Number.isFinite(endMs) || startMs <= endMs);
  });
}

function serveTimeDisplay(order: Order, now = Date.now()) {
  if (order.orderStatus === 'Cancelled') return '00:00:00';
  const savedSeconds = Number(order.serviceDuration ?? NaN);
  if (isFinalServedOrder(order) && Number.isFinite(savedSeconds) && savedSeconds > 0) {
    return formatElapsed(undefined, undefined, savedSeconds, now);
  }
  return formatElapsed(serveTimeStart(order), preparationEnd(order), order.serviceDuration, now);
}

function isDineInOrder(order: Order) {
  return order.type === 'Dine-In' || order.type === 'Mixed';
}

function stayEnd(order: Order) {
  if (!isDineInOrder(order)) return undefined;
  return order.tableEndedAt ?? order.runningTimeEnd;
}

function stayStart(order: Order) {
  if (!isDineInOrder(order)) return undefined;
  const end = stayEnd(order);
  const endMs = end ? parseDatabaseTimestamp(end).getTime() : Date.now();
  const candidates = [order.tableStartedAt, order.orderedAt, order.runningTimeStart, order.createdAt];
  return candidates.find((value) => {
    if (!value) return false;
    const startMs = parseDatabaseTimestamp(value).getTime();
    return Number.isFinite(startMs) && (!Number.isFinite(endMs) || startMs <= endMs);
  });
}

function estimatedWaitDisplay(order: Order, _strategy: 'parallel' | 'sequential') {
  const estimate = Number(order.estimatedPrepMinutes ?? 0);
  if (!Number.isFinite(estimate) || estimate <= 0) return null;
  const orderedAt = order.orderedAt ? parseDatabaseTimestamp(order.orderedAt) : null;
  const computedReadyAt = orderedAt && !Number.isNaN(orderedAt.getTime())
    ? new Date(orderedAt.getTime() + Math.ceil(estimate) * 60000).toISOString()
    : order.estimatedReadyAt;
  return {
    minutes: Math.ceil(estimate),
    readyAt: computedReadyAt,
  };
}

export function OrderList({ onNavigate, onLogout, isAdmin = false, storeBrand, userName, userRole, storeType, staffType }: OrderListProps) {
  const { orders, completePayment, cancelOrder, cancelOrderItems, refundOrderItems, reloadOrders } = useOrders();
  const { settings } = useStoreSettings();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [datePreset, setDatePreset] = useState<DateFilterMode>('all');
  const [activeTab, setActiveTab] = useState<TransactionTab>('history');

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [cashReceived, setCashReceived] = useState('');
  const [changeAmount, setChangeAmount] = useState(0);
  const [currentPaymentId, setCurrentPaymentId] = useState('');
  const [currentReceiptId, setCurrentReceiptId] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundingOrder, setRefundingOrder] = useState<Order | null>(null);
  const [selectedRefundItems, setSelectedRefundItems] = useState<Record<number, boolean>>({});
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [itemCancelReason, setItemCancelReason] = useState('');
  const [itemCancellingOrder, setItemCancellingOrder] = useState<Order | null>(null);
  const [selectedCancelItems, setSelectedCancelItems] = useState<Record<number, boolean>>({});
  const [managerPin, setManagerPin] = useState('');
  const [managerPinError, setManagerPinError] = useState('');
  const [isAuthorizingManagerPin, setIsAuthorizingManagerPin] = useState(false);
  const [authorizedManager, setAuthorizedManager] = useState<{ id?: number; full_name?: string; email?: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [orderChangeLogs, setOrderChangeLogs] = useState<ActivityLog[]>([]);
  const [orderChangeLoading, setOrderChangeLoading] = useState(false);
  const [orderChangeError, setOrderChangeError] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);
  const showTableManagementColumns = settings.enable_table_management;
  const showEstimatedPrepTime = settings.enable_estimated_prep_time;
  const canProcessTransactions = !isAdmin && userRole === 'STAFF' && staffType === 'POS_STAFF';
  const canViewOrderChangeAudit =
    storeType === 'RESTAURANT' &&
    ((userRole === 'STAFF' && staffType === 'POS_STAFF') || ['ADMIN', 'POS_MANAGER', 'POS_ADMIN'].includes(userRole ?? ''));
  const canPayOrder = (order: Order) => order.paymentStatus === 'Not Paid' && order.orderStatus === 'Served';
  const hasCompletedPayment = (order: Order) => order.paymentStatus === 'Paid';
  const isRestaurantRefundWindowOpen = (order: Order) => order.date === getLocalDateKey();
  const canCancelOrder = (order: Order) => order.orderStatus === 'Pending' && (order.paymentStatus === 'Not Paid' || order.paymentStatus === 'Paid' || order.paymentStatus === 'Partially Refunded');
  const canCancelItemsOrder = (order: Order) => canCancelOrder(order) && order.items.length > 1;
  const canRefundOrder = (order: Order) =>
    settings.enable_refund &&
    hasCompletedPayment(order) &&
    isRestaurantRefundWindowOpen(order) &&
    ['Preparing', 'Served', 'Completed'].includes(order.orderStatus);

  useEffect(() => {
    void reloadOrders();
  }, [reloadOrders]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setSelectedOrder((current) => {
      if (!current) return current;
      return orders.find((order) => order.id === current.id) ?? current;
    });
  }, [orders]);

  const openModal = (order: Order, modal: ActiveModal) => {
    if (!canProcessTransactions && ['payment', 'refund', 'cancel', 'item-cancel'].includes(String(modal))) return;
    if (modal === 'payment' && !canPayOrder(order)) {
      alert('Payment can only be processed after the order has been served.');
      return;
    }
    if (modal === 'refund' && !canRefundOrder(order)) return;
    if (modal === 'cancel' && !canCancelOrder(order)) return;
    if (modal === 'item-cancel' && !canCancelItemsOrder(order)) return;
    if (modal === 'refund') setSelectedRefundItems({});
    if (modal === 'item-cancel') setSelectedCancelItems({});
    setSelectedOrder(order);
    setActiveModal(modal);
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedOrder(null);
    setCashReceived('');
    setChangeAmount(0);
    setRefundReason('');
    setSelectedRefundItems({});
    setCancelReason('');
    setItemCancelReason('');
    setSelectedCancelItems({});
    setManagerPin('');
    setManagerPinError('');
    setAuthorizedManager(null);
  };

  const handleConfirmPayment = async () => {
    if (!canProcessTransactions) return;
    if (!selectedOrder) return;
    if (!canPayOrder(selectedOrder)) {
      alert('Payment can only be processed after the order has been served.');
      return;
    }
    const cash = parseFloat(cashReceived);
    if (cash < selectedOrder.amountNumber) return;
    if (isCompletingPayment) return;

    const change = cash - selectedOrder.amountNumber;
    const pId = generateId('PAY');
    const rId = generateId('REC');

    setChangeAmount(change);
    setCurrentPaymentId(pId);
    setCurrentReceiptId(rId);
    setIsCompletingPayment(true);

    try {
      await completePayment(selectedOrder.id, { cashReceived: cash, changeGiven: change, cashier: userName ?? undefined, paymentId: pId, receiptId: rId });
      const paidAt = new Date().toISOString();
      const shouldCloseStay = selectedOrder.paymentStatus !== 'Paid';
      const updates = {
        paymentStatus: 'Paid' as const,
        paymentAt: paidAt,
        orderStatus: shouldCloseStay && (selectedOrder.type === 'Dine-In' || selectedOrder.type === 'Mixed') ? 'Completed' as const : selectedOrder.orderStatus,
        completedAt: shouldCloseStay && (selectedOrder.type === 'Dine-In' || selectedOrder.type === 'Mixed') ? (selectedOrder.completedAt ?? paidAt) : selectedOrder.completedAt,
        tableEndedAt: shouldCloseStay && (selectedOrder.type === 'Dine-In' || selectedOrder.type === 'Mixed') ? (selectedOrder.tableEndedAt ?? paidAt) : selectedOrder.tableEndedAt,
        runningTimeEnd: shouldCloseStay && (selectedOrder.type === 'Dine-In' || selectedOrder.type === 'Mixed') ? (selectedOrder.runningTimeEnd ?? paidAt) : selectedOrder.runningTimeEnd,
        isRunning: shouldCloseStay && (selectedOrder.type === 'Dine-In' || selectedOrder.type === 'Mixed') ? false : selectedOrder.isRunning,
        paymentId: pId,
        receiptId: rId,
        cashReceived: cash,
        changeGiven: change,
        cashier: userName ?? undefined,
      };
      setSelectedOrder(prev => prev ? { ...prev, ...updates } : null);
      await reloadOrders();
      setActiveModal('receipt');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to complete payment.');
    } finally {
      setIsCompletingPayment(false);
    }
  };

  const handleCloseReceiptAfterPayment = () => {
    closeModal();
  };

  const verifyManagerPin = async () => {
    if (managerPin.trim().length < 4) {
      setManagerPinError('Enter the manager PIN.');
      return false;
    }

    setIsAuthorizingManagerPin(true);
    setManagerPinError('');
    try {
      const response = await adminApi.verifyPosManagerPin(managerPin.trim());
      setAuthorizedManager(response.manager ?? null);
      return true;
    } catch (error) {
      setManagerPinError(error instanceof Error ? error.message : 'Unable to authorize manager PIN.');
      return false;
    } finally {
      setIsAuthorizingManagerPin(false);
    }
  };

  const handleRefundSubmit = async () => {
    if (!canProcessTransactions) return;
    if (!settings.enable_refund) return;
    if (!selectedOrder || !canRefundOrder(selectedOrder)) return;
    if (Object.values(selectedRefundItems).filter(Boolean).length === 0) return;
    if (!selectedOrder || !refundReason.trim()) return;
    if (!(await verifyManagerPin())) return;
    setRefundingOrder(selectedOrder);
  };

  const handleCancelSubmit = async () => {
    if (!canProcessTransactions) return;
    if (!selectedOrder || !cancelReason.trim()) return;
    if (!(await verifyManagerPin())) return;
    setCancellingOrder(selectedOrder);
  };

  const handleItemCancelSubmit = async () => {
    if (!canProcessTransactions) return;
    if (!selectedOrder || !canCancelItemsOrder(selectedOrder)) return;
    const selectedCount = Object.values(selectedCancelItems).filter(Boolean).length;
    if (selectedCount === 0 || selectedCount >= selectedOrder.items.length) return;
    if (!itemCancelReason.trim()) return;
    if (!(await verifyManagerPin())) return;
    setItemCancellingOrder(selectedOrder);
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const cashFloat = parseFloat(cashReceived) || 0;
  const isEnough = selectedOrder ? cashFloat >= selectedOrder.amountNumber : false;

  const isWithinDateFilter = (date: string) => {
    const todayString = getLocalDateKey();
    const today = parseLocalDateKey(todayString);
    const start = new Date(today);

    if (datePreset === 'all') {
      return true;
    }

    if (datePreset === 'today') {
      return date === todayString;
    }

    if (datePreset === 'date') {
      return !dateFilter || date === dateFilter;
    }

    if (datePreset === 'week') {
      start.setDate(today.getDate() - 6);
    } else if (datePreset === 'month') {
      start.setDate(1);
    } else {
      start.setMonth(0, 1);
    }

    const startString = getLocalDateKey(start);
    return date >= startString && date <= todayString;
  };

  const orderChangeDateRange = useMemo<{ from?: string; to?: string }>(() => {
    const todayString = getLocalDateKey();
    const today = parseLocalDateKey(todayString);
    const start = new Date(today);

    if (datePreset === 'date') {
      return dateFilter ? { from: dateFilter, to: dateFilter } : {};
    }
    if (datePreset === 'today') {
      return { from: todayString, to: todayString };
    }
    if (datePreset === 'week') {
      start.setDate(today.getDate() - 6);
      return { from: getLocalDateKey(start), to: todayString };
    }
    if (datePreset === 'month') {
      start.setDate(1);
      return { from: getLocalDateKey(start), to: todayString };
    }
    if (datePreset === 'year') {
      start.setMonth(0, 1);
      return { from: getLocalDateKey(start), to: todayString };
    }
    return {};
  }, [dateFilter, datePreset]);

  const loadOrderChangeLogs = useCallback(async () => {
    if (!canViewOrderChangeAudit) {
      setOrderChangeLogs([]);
      return;
    }

    setOrderChangeLoading(true);
    try {
      const params = new URLSearchParams();
      if (orderChangeDateRange.from) params.set('date_from', orderChangeDateRange.from);
      if (orderChangeDateRange.to) params.set('date_to', orderChangeDateRange.to);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      setOrderChangeLogs(await adminApi.listPosOrderChangeLogs(params));
      setOrderChangeError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load cancelled/refunded items.';
      setOrderChangeError(
        message.includes('Cannot GET /admin/pos/order-change-logs')
          ? 'Cancelled/refunded item history is not available yet. Please restart the backend server to load the new POS audit endpoint.'
          : message,
      );
    } finally {
      setOrderChangeLoading(false);
    }
  }, [canViewOrderChangeAudit, orderChangeDateRange.from, orderChangeDateRange.to, searchTerm]);

  useEffect(() => {
    void loadOrderChangeLogs();
  }, [loadOrderChangeLogs]);

  const filteredOrders = orders.filter(order => {
    const term = searchTerm.toLowerCase();
    const normalizedTerm = normalizeSearchValue(searchTerm);
    const normalizedOrderNumber = normalizeSearchValue(order.orderNumber || '');
    const normalizedOrderId = normalizeSearchValue(order.id);
    const matchesSearch = !term ||
      order.id.toLowerCase().includes(term) ||
      (order.orderNumber || '').toLowerCase().includes(term) ||
      order.customer.toLowerCase().includes(term) ||
      Boolean(normalizedTerm && (
        normalizedOrderId.includes(normalizedTerm) ||
        normalizedOrderNumber.includes(normalizedTerm)
      ));
    const matchesType = typeFilter === 'All' || order.type === typeFilter;
    const matchesPayment = paymentFilter === 'All' || order.paymentStatus === paymentFilter;
    const matchesDate = isWithinDateFilter(order.date);
    return matchesSearch && matchesType && matchesPayment && matchesDate;
  });
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const pageStartIndex = (currentPage - 1) * ORDERS_PER_PAGE;
  const paginatedOrders = filteredOrders.slice(pageStartIndex, pageStartIndex + ORDERS_PER_PAGE);
  const visibleStart = filteredOrders.length === 0 ? 0 : pageStartIndex + 1;
  const visibleEnd = Math.min(pageStartIndex + ORDERS_PER_PAGE, filteredOrders.length);
  const tableColumnCount = (showTableManagementColumns ? 13 : 10) + (showEstimatedPrepTime ? 1 : 0);
  const orderChangeRecords = useMemo(() => buildOrderChangeRecords(orderChangeLogs), [orderChangeLogs]);
  const tabButtonClass = (tab: TransactionTab) =>
    `relative px-1 pb-3 text-sm font-medium transition-colors ${
      activeTab === tab ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
    }`;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, paymentFilter, dateFilter, datePreset]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const getPaymentBadge = (status: string) => {
    if (status === 'Paid') return 'bg-[#dcfce7] text-[#15803d]';
    if (status === 'Void') return 'bg-purple-50 text-purple-700 border-purple-200';
    if (status === 'Refunded') return 'bg-amber-100 text-amber-800 border-amber-200';
    if (status === 'Partially Refunded') return 'bg-orange-50 text-orange-700 border-orange-200';
    return 'bg-[#fef2f2] text-[#ef4444]';
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Dine-In': return 'bg-[#eff6ff] text-[#3b82f6]';
      case 'Takeout': return 'bg-[#fff7ed] text-[#d97706]';
      case 'Mixed': return 'bg-[#f5f3ff] text-[#8b5cf6]';
      default: return 'bg-[#f1f5f9] text-[#64748b]';
    }
  };

  const getOrderStatusBadge = (status: string) => {
    if (status === 'Completed') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (status === 'Served') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (status === 'Ready') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'Preparing') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (status === 'Cancelled') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
  };

  const dineInItems = selectedOrder?.items.filter(i => i.itemType === 'dine-in') ?? [];
  const takeoutItems = selectedOrder?.items.filter(i => i.itemType === 'takeout') ?? [];
  const isMixed = selectedOrder?.type === 'Mixed';
  const selectedRefundIndices = Object.keys(selectedRefundItems)
    .filter(key => selectedRefundItems[Number(key)])
    .map(key => Number(key));
  const selectedRefundAmount = selectedRefundIndices.reduce((total, index) => {
    const item = selectedOrder?.items[index];
    return total + (item ? Number(item.lineTotal ?? item.price * item.quantity) : 0);
  }, 0);
  const selectedCancelIndices = Object.keys(selectedCancelItems)
    .filter(key => selectedCancelItems[Number(key)])
    .map(key => Number(key));
  const selectedCancelAmount = selectedCancelIndices.reduce((total, index) => {
    const item = selectedOrder?.items[index];
    return total + (item ? Number(item.lineTotal ?? item.price * item.quantity) : 0);
  }, 0);
  const toggleRefundItem = (index: number) => {
    setSelectedRefundItems(current => ({
      ...current,
      [index]: !current[index],
    }));
  };
  const toggleCancelItem = (index: number) => {
    setSelectedCancelItems(current => ({
      ...current,
      [index]: !current[index],
    }));
  };
  const buildAuthorization = (reason: string) => ({
    reason,
    managerId: authorizedManager?.id,
    managerName: authorizedManager?.full_name || authorizedManager?.email || undefined,
  });
  const managerPinField = (
    <div>
      <label className="block text-sm text-gray-700 mb-2" style={{ fontWeight: 500 }}>Manager PIN *</label>
      <input
        type="password"
        inputMode="numeric"
        value={managerPin}
        onChange={(event) => {
          setManagerPin(event.target.value);
          setManagerPinError('');
        }}
        placeholder="Enter manager PIN"
        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-muted"
      />
      {managerPinError && <p className="mt-2 text-xs text-red-600">{managerPinError}</p>}
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentPage="order-list" onNavigate={onNavigate} onLogout={onLogout} isAdmin={isAdmin} storeBrand={storeBrand} userName={userName} userRole={userRole} storeType={storeType} staffType={staffType} />

      <div className="flex-1 overflow-auto p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[28px] text-primary" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, letterSpacing: '0.04em' }}>
            Transaction History
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage and track all restaurant orders</p>
        </div>

        <div className="mb-5 border-b border-border">
          <div className="flex flex-wrap gap-10">
            <button type="button" onClick={() => setActiveTab('history')} className={tabButtonClass('history')}>
              Order List
              {activeTab === 'history' && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
            {canViewOrderChangeAudit && (
              <button type="button" onClick={() => setActiveTab('changes')} className={tabButtonClass('changes')}>
                Cancelled / Refund
                {activeTab === 'changes' && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />}
              </button>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by Order ID or Customer..."
                className="w-full pl-9 pr-4 py-2.5 bg-muted border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {activeTab === 'history' && (
              <>
                {/* Type Filter */}
                <div className="relative">
                  <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2.5 bg-muted border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                  >
                    <option value="All">All Types</option>
                    {ORDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>

                {/* Payment Filter */}
                <div className="relative">
                  <select
                    value={paymentFilter}
                    onChange={e => setPaymentFilter(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2.5 bg-muted border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                  >
                    <option value="All">All Payments</option>
                    {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </>
            )}

            {/* Date Filter */}
            <DateFilterControl
              mode={datePreset}
              selectedDate={dateFilter}
              onModeChange={setDatePreset}
              onDateChange={setDateFilter}
              className="appearance-none pl-3 pr-8 py-2.5 bg-muted border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
            />

            <span className="text-xs text-gray-400 ml-auto">
              {activeTab === 'history'
                ? `${filteredOrders.length} order${filteredOrders.length !== 1 ? 's' : ''}`
                : `${orderChangeRecords.length} record${orderChangeRecords.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {activeTab === 'history' && (
          <>
            {/* Table Card */}
            <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className={`w-full ${showTableManagementColumns ? 'min-w-[1300px]' : 'min-w-[1000px]'}`}>
              <thead className="bg-muted/30">
                <tr>
                  <th className="w-[13%] text-left px-5 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Order Number</th>
                  <th className="w-[10%] text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Customer</th>
                  <th className="w-[8%] text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Type</th>
                  {showTableManagementColumns && (
                    <>
                      <th className="w-[7%] text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Table</th>
                      <th className="w-[6%] text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Party</th>
                      <th className="w-[7%] text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Queue</th>
                    </>
                  )}
                  <th className="w-[9%] text-right px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Total</th>
                  <th className="w-[8%] text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Payments</th>
                  <th className="w-[8%] text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Order Status</th>
                  <th className="w-[9%] text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Date and Time</th>
                  {showEstimatedPrepTime && (
                    <th className="w-[8%] text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Est. Prep</th>
                  )}
                  <th className="w-[8%] text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Stay</th>
                  <th className="w-[9%] text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Serve Time</th>
                  <th className="w-[14%] text-center px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="text-center py-16 text-gray-400 text-sm">
                      No orders found matching your filters.
                    </td>
                  </tr>
                ) : paginatedOrders.map((order) => {
                  const waitingTime = order.isQueued ? Math.floor((new Date().getTime() - new Date(`${order.date} ${order.time}`).getTime()) / 60000) : 0;
                  const estimatedWait = estimatedWaitDisplay(order, settings.prep_time_strategy);

                  return (<tr key={order.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-5 text-sm font-mono text-primary whitespace-nowrap overflow-hidden text-ellipsis">
                      {order.orderNumber || order.id}
                    </td>
                    <td className="px-4 py-5 text-sm text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis">
                      {order.customer}
                    </td>
                    <td className="px-4 py-5">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getTypeBadge(order.type)}`}>
                        {order.type}
                      </span>
                    </td>
                    {showTableManagementColumns && (
                      <>
                        <td className="px-4 py-5 text-sm text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">
                          {order.table}
                        </td>
                        <td className="px-4 py-5">
                          {order.partySize ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium whitespace-nowrap">
                              <Users className="w-3 h-3" />
                              {order.partySize}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-5">
                          {order.isQueued ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center justify-center w-fit px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded-full whitespace-nowrap">
                                #{order.queuePosition}
                              </span>
                              <span className="text-xs text-gray-500 whitespace-nowrap">{waitingTime} min</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-5 text-sm text-right font-medium whitespace-nowrap">
                      <span className="text-primary">&#8369;{order.amountNumber.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-5">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs border whitespace-nowrap ${getPaymentBadge(order.paymentStatus)}`}>
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-5">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs border whitespace-nowrap ${getOrderStatusBadge(order.orderStatus)}`}>
                        {order.orderStatus}
                      </span>
                    </td>
                    <td className="px-4 py-5">
                      <div className="text-xs text-gray-600 whitespace-nowrap">{order.date}</div>
                      <div className="text-xs text-gray-400 whitespace-nowrap">{order.time}</div>
                    </td>
                    {showEstimatedPrepTime && (
                      <td className="px-4 py-5 text-xs text-gray-600 whitespace-nowrap">
                        {estimatedWait ? `${estimatedWait.minutes} mins` : '-'}
                        {estimatedWait?.readyAt && (
                          <div className="text-xs text-gray-400">{formatManilaTime(estimatedWait.readyAt)}</div>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-5 text-xs text-gray-600 whitespace-nowrap">
                      {order.orderStatus === 'Cancelled'
                        ? '00:00:00'
                        : isDineInOrder(order)
                        ? formatElapsed(stayStart(order), stayEnd(order), order.runningDuration, clock)
                        : '-'}
                    </td>
                    <td className="px-4 py-5 text-xs text-gray-600 whitespace-nowrap">
                      {serveTimeDisplay(order, clock)}
                    </td>
                    <td className="px-4 py-5">
                      <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                        {/* View Details - always */}
                        <button
                          onClick={() => openModal(order, 'details')}
                          title="View Details"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>

                        {/* Process Payment - only if Not Paid */}
                        {canProcessTransactions && canPayOrder(order) && (
                          <button
                            onClick={() => openModal(order, 'payment')}
                            title="Process Payment"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Payment
                          </button>
                        )}

                        {/* Receipt - only if Paid */}
                        {hasCompletedPayment(order) && (
                          <button
                            onClick={() => openModal(order, 'receipt')}
                            title="View Receipt"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Receipt
                          </button>
                        )}

                        {/* Refund request - only after kitchen progress */}
                        {canProcessTransactions && canRefundOrder(order) && (
                          <button
                            onClick={() => openModal(order, 'refund')}
                            title="Request Refund"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Refund
                          </button>
                        )}

                        {canProcessTransactions && canCancelOrder(order) && (
                          <button
                            onClick={() => openModal(order, 'cancel')}
                            title="Cancel Order"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <X className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        )}

                        {canProcessTransactions && canCancelItemsOrder(order) && (
                          <button
                            onClick={() => openModal(order, 'item-cancel')}
                            title="Cancel Item"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Cancel Item
                          </button>
                        )}

                      </div>
                    </td>
                  </tr>);
                })}
              </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Showing {visibleStart} to {visibleEnd} of {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-semibold text-primary">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
        {activeTab === 'changes' && canViewOrderChangeAudit && (
          <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-primary">Cancelled & Refunded Items</h2>
              <p className="text-xs text-muted-foreground">Order change history for cancellations, item removals, and refund approvals.</p>
            </div>
            {orderChangeError && (
              <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">{orderChangeError}</div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Order #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Affected Dish(es)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Staff</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Manager</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orderChangeLoading ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-sm text-gray-400">Loading cancelled/refunded items...</td></tr>
                  ) : orderChangeRecords.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-sm text-gray-400">No cancelled or refunded items found.</td></tr>
                  ) : orderChangeRecords.map((record) => (
                    <tr key={record.id} className="align-top hover:bg-muted/20">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">{formatManilaDateTime(record.createdAt)}</td>
                      <td className="px-4 py-3 font-mono text-primary">{record.orderNumber}</td>
                      <td className="px-4 py-3 text-gray-700">{record.type}</td>
                      <td className="max-w-xs px-4 py-3 text-gray-700">{record.affectedItems}</td>
                      <td className="px-4 py-3 text-gray-700">{record.quantity}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">{record.amount}</td>
                      <td className="max-w-xs px-4 py-3 text-gray-700">{record.reason}</td>
                      <td className="px-4 py-3 text-gray-700">{record.initiatedBy}</td>
                      <td className="px-4 py-3 text-gray-700">{record.approvedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: View Details ── */}
      {activeModal === 'details' && selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base text-gray-900" style={{ fontWeight: 600 }}>Order Details</h2>
                <p className="text-xs text-gray-400">{selectedOrder.orderNumber || selectedOrder.id}</p>
              </div>
              <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Customer</p>
                  <p className="text-sm text-gray-800" style={{ fontWeight: 600 }}>{selectedOrder.customer}</p>
                </div>
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Order Type</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getTypeBadge(selectedOrder.type)}`}>
                    {selectedOrder.type}
                  </span>
                </div>
                {selectedOrder.table !== '-' && selectedOrder.table !== '—' && (
                  <div className="bg-muted rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-1">Table</p>
                    <p className="text-sm text-gray-800">{selectedOrder.table}</p>
                  </div>
                )}
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Date & Time</p>
                  <p className="text-sm text-gray-800">{selectedOrder.date} · {selectedOrder.time}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Stay Time</p>
                  <p className="text-sm text-gray-800">
                    {selectedOrder.orderStatus === 'Cancelled'
                      ? '00:00:00'
                      : selectedOrder.type === 'Dine-In' || selectedOrder.type === 'Mixed'
                      ? formatElapsed(stayStart(selectedOrder), stayEnd(selectedOrder), selectedOrder.runningDuration, clock)
                      : '-'}
                  </p>
                </div>
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Serve Time</p>
                  <p className="text-sm text-gray-800">{serveTimeDisplay(selectedOrder, clock)}</p>
                </div>
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Served At</p>
                  <p className="text-sm text-gray-800">{selectedOrder.servedAt ? formatManilaDateTime(selectedOrder.servedAt) : '-'}</p>
                </div>
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Payment Time</p>
                  <p className="text-sm text-gray-800">{selectedOrder.paymentAt ? formatManilaDateTime(selectedOrder.paymentAt) : '-'}</p>
                </div>
                {showEstimatedPrepTime && (
                  <div className="bg-muted rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-1">Estimated Preparation</p>
                    <p className="text-sm text-gray-800">
                      {(() => {
                        const estimatedWait = estimatedWaitDisplay(selectedOrder, settings.prep_time_strategy);
                        if (!estimatedWait) return '-';
                        return `${estimatedWait.minutes} mins${estimatedWait.readyAt ? `, ready around ${formatManilaTime(estimatedWait.readyAt)}` : ''}`;
                      })()}
                    </p>
                  </div>
                )}
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Preparing Start</p>
                  <p className="text-sm text-gray-800">{selectedOrder.preparingStartedAt ? formatManilaDateTime(selectedOrder.preparingStartedAt) : '-'}</p>
                </div>
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Ready to Serve</p>
                  <p className="text-sm text-gray-800">{selectedOrder.readyAt ? formatManilaDateTime(selectedOrder.readyAt) : '-'}</p>
                </div>
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Completed Time</p>
                  <p className="text-sm text-gray-800">{selectedOrder.completedAt ? formatManilaDateTime(selectedOrder.completedAt) : '-'}</p>
                </div>
              </div>

              {/* Payment Badge */}
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPaymentBadge(selectedOrder.paymentStatus)}`}>
                  {selectedOrder.paymentStatus}
                </span>
              </div>

              {/* Items */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Order Items</p>
                {isMixed ? (
                  <>
                    {dineInItems.length > 0 && (
                      <>
                        <p className="text-xs text-blue-600 font-medium mb-1.5">Dine-In</p>
                        <div className="space-y-2 mb-3">
                          {dineInItems.map((item, i) => (
                            <OrderItemDetail key={i} item={item} />
                          ))}
                        </div>
                      </>
                    )}
                    {takeoutItems.length > 0 && (
                      <>
                        <p className="text-xs text-amber-600 font-medium mb-1.5">Takeout</p>
                        <div className="space-y-2">
                          {takeoutItems.map((item, i) => (
                            <OrderItemDetail key={i} item={item} />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, i) => (
                      <OrderItemDetail key={i} item={item} />
                    ))}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="bg-muted rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>₱{selectedOrder.subtotal.toFixed(2)}</span>
                </div>
                {selectedOrder.serviceFee > 0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Service Fee</span>
                    <span>₱{selectedOrder.serviceFee.toFixed(2)}</span>
                  </div>
                )}
                {selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-xs text-red-500">
                    <span>Discount ({selectedOrder.discountType} 20%)</span>
                    <span>− ₱{selectedOrder.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-primary border-t border-gray-200 pt-2" style={{ fontWeight: 700 }}>
                  <span>Total</span>
                  <span>₱{selectedOrder.amountNumber.toFixed(2)}</span>
                </div>
              </div>

              {canProcessTransactions && canPayOrder(selectedOrder) && (
                <button
                  onClick={() => setActiveModal('payment')}
                  className="w-full py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                  style={{ fontWeight: 600 }}
                >
                  <CreditCard className="w-4 h-4" />
                  Process Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Payment ── */}
      {activeModal === 'payment' && selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-base text-gray-900" style={{ fontWeight: 600 }}>Process Payment</h2>
              <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Order Summary */}
              <div className="bg-muted rounded-xl p-4 space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Order {selectedOrder.id} — {selectedOrder.customer}</p>
                {selectedOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs text-gray-600">
                    <span>{item.quantity}× {item.name}</span>
                    <span>₱{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-2 space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Subtotal</span>
                    <span>₱{selectedOrder.subtotal.toFixed(2)}</span>
                  </div>
                  {selectedOrder.serviceFee > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Service Fee</span>
                      <span>₱{selectedOrder.serviceFee.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOrder.discount > 0 && (
                    <div className="flex justify-between text-xs text-red-500">
                      <span>Discount ({selectedOrder.discountType} 20%)</span>
                      <span>− ₱{selectedOrder.discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-primary pt-1" style={{ fontWeight: 700 }}>
                    <span>Total Amount Due</span>
                    <span>₱{selectedOrder.amountNumber.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Cash Input */}
              <div>
                <label className="block text-sm text-gray-700 mb-2" style={{ fontWeight: 500 }}>Cash Received</label>
                <input
                  type="number"
                  value={cashReceived}
                  onChange={e => setCashReceived(e.target.value)}
                  placeholder="Enter amount"
                  autoFocus
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-muted"
                />
              </div>

              {/* Change Preview */}
              {cashReceived && isEnough && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <p className="text-xs text-emerald-600 mb-1">Change</p>
                  <p className="text-2xl text-emerald-700" style={{ fontWeight: 700 }}>₱{(cashFloat - selectedOrder.amountNumber).toFixed(2)}</p>
                </div>
              )}
              {cashReceived && !isEnough && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-xs text-red-500">Insufficient amount. Need ₱{(selectedOrder.amountNumber - cashFloat).toFixed(2)} more.</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={!isEnough || isCompletingPayment}
                  className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontWeight: 600 }}
                >
                  {isCompletingPayment ? 'Processing...' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Receipt (Thermal Style) ── */}
      {activeModal === 'receipt' && selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-hidden shadow-2xl flex flex-col my-8">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm text-gray-700" style={{ fontWeight: 600 }}>Receipt Preview</h2>
              <button onClick={handleCloseReceiptAfterPayment} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <ThermalReceipt
              orderNumber={selectedOrder.orderNumber || selectedOrder.id}
              customerName={selectedOrder.customer}
              orderType={selectedOrder.type as 'Dine-In' | 'Takeout' | 'Mixed'}
              table={selectedOrder.table !== '-' && selectedOrder.table !== '—' ? selectedOrder.table : undefined}
              items={selectedOrder.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                lineTotal: item.lineTotal,
                itemType: item.itemType,
                notes: item.notes,
                addedIngredients: item.addedIngredients,
                removedIngredients: item.removedIngredients,
                changedIngredients: item.changedIngredients,
                replacedIngredients: item.replacedIngredients,
                modifiers: item.modifiers,
              }))}
              subtotal={selectedOrder.subtotal}
              serviceFee={selectedOrder.serviceFee}
              tax={selectedOrder.tax}
              discount={selectedOrder.discount}
              discountType={selectedOrder.discountType}
              total={selectedOrder.amountNumber}
              cashReceived={selectedOrder.cashReceived ?? cashFloat}
              changeGiven={selectedOrder.changeGiven ?? changeAmount}
              date={selectedOrder.date}
              time={selectedOrder.time}
              receiptId={selectedOrder.receiptId || currentReceiptId}
              paymentId={selectedOrder.paymentId || currentPaymentId}
              estimatedPrepMinutes={selectedOrder.estimatedPrepMinutes}
              estimatedReadyAt={selectedOrder.estimatedReadyAt}
              cashier={selectedOrder.cashier ?? userName ?? 'Staff'}
              storeBrand={storeBrand}
            />

            {/* Actions */}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={handleCloseReceiptAfterPayment}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={handlePrintReceipt}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                style={{ fontWeight: 600 }}
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
              <button
                onClick={handlePrintReceipt}
                title="Download Receipt"
                className="py-2.5 px-3 border border-primary/20 text-primary hover:bg-primary/10 rounded-xl text-sm transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Refund ── */}
      {activeModal === 'refund' && selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-base text-red-600" style={{ fontWeight: 600 }}>Request Refund</h2>
              <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <p className="text-sm text-red-700 mb-1" style={{ fontWeight: 600 }}>⚠ Refund Warning</p>
                <p className="text-xs text-red-500">Select the dishes to refund. Manager PIN authorization is required.</p>
              </div>

              <div className="bg-muted rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Order #</span>
                  <span className="text-gray-800 font-medium">{selectedOrder.id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Customer</span>
                  <span className="text-gray-800">{selectedOrder.customer}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Selected Refund</span>
                  <span className="text-red-600" style={{ fontWeight: 700 }}>₱{selectedOrder.amountNumber.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2" style={{ fontWeight: 500 }}>Dishes to Refund *</label>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-100 bg-muted p-2">
                  {selectedOrder.items.map((item, index) => {
                    const amount = Number(item.lineTotal ?? item.price * item.quantity);
                    return (
                      <label key={`${item.id ?? index}-${item.name}`} className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 hover:bg-red-50/40">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedRefundItems[index])}
                          onChange={() => toggleRefundItem(index)}
                          className="mt-1 h-4 w-4 accent-red-500"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-800">{item.name}</span>
                          <span className="mt-1 block text-xs text-gray-500">Qty: {item.quantity} - {item.itemType === 'dine-in' ? 'Dine-in' : 'Takeout'}</span>
                        </span>
                        <span className="text-sm font-semibold text-red-600">&#8369;{amount.toFixed(2)}</span>
                      </label>
                    );
                  })}
                </div>
                {selectedRefundIndices.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600">Select at least one dish to refund.</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2" style={{ fontWeight: 500 }}>Reason for Refund *</label>
                <textarea
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  placeholder="Enter the reason for this refund..."
                  autoFocus
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 bg-muted resize-none"
                />
              </div>

              {managerPinField}

              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRefundSubmit}
                  disabled={selectedRefundIndices.length === 0 || !refundReason.trim() || managerPin.trim().length < 4 || isAuthorizingManagerPin}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontWeight: 600 }}
                >
                  {isAuthorizingManagerPin ? 'Authorizing...' : 'Request Refund'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeModal === 'item-cancel' && selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-base text-amber-700" style={{ fontWeight: 600 }}>Cancel Item</h2>
              <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-sm text-amber-800 mb-1" style={{ fontWeight: 600 }}>Pending Order Item Cancellation</p>
                <p className="text-xs text-amber-700">Only selected dishes will be removed. If this was paid already, the selected amount is treated as a partial refund.</p>
              </div>

              <div className="bg-muted rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Order #</span>
                  <span className="text-gray-800 font-medium">{selectedOrder.orderNumber || selectedOrder.id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Selected Amount</span>
                  <span className="text-amber-700" style={{ fontWeight: 700 }}>₱{selectedCancelAmount.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2" style={{ fontWeight: 500 }}>Dishes to Cancel *</label>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-100 bg-muted p-2">
                  {selectedOrder.items.map((item, index) => {
                    const amount = Number(item.lineTotal ?? item.price * item.quantity);
                    const wouldSelectAll = !selectedCancelItems[index] && selectedCancelIndices.length + 1 >= selectedOrder.items.length;
                    return (
                      <label key={`${item.id ?? index}-${item.name}`} className={`flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 ${wouldSelectAll ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-amber-50/40'}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(selectedCancelItems[index])}
                          disabled={wouldSelectAll}
                          onChange={() => toggleCancelItem(index)}
                          className="mt-1 h-4 w-4 accent-amber-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-800">{item.name}</span>
                          <span className="mt-1 block text-xs text-gray-500">Qty: {item.quantity} - {item.itemType === 'dine-in' ? 'Dine-in' : 'Takeout'}</span>
                        </span>
                        <span className="text-sm font-semibold text-amber-700">₱{amount.toFixed(2)}</span>
                      </label>
                    );
                  })}
                </div>
                {selectedCancelIndices.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600">Select at least one dish to cancel.</p>
                )}
                {selectedCancelIndices.length >= selectedOrder.items.length - 1 && (
                  <p className="mt-2 text-xs text-gray-500">Use full Cancel Order if every dish must be removed.</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2" style={{ fontWeight: 500 }}>Reason for Item Cancellation *</label>
                <textarea
                  value={itemCancelReason}
                  onChange={e => setItemCancelReason(e.target.value)}
                  placeholder="Enter the reason for cancelling selected dishes..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 bg-muted resize-none"
                />
              </div>

              {managerPinField}

              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleItemCancelSubmit}
                  disabled={selectedCancelIndices.length === 0 || selectedCancelIndices.length >= selectedOrder.items.length || !itemCancelReason.trim() || managerPin.trim().length < 4 || isAuthorizingManagerPin}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontWeight: 600 }}
                >
                  {isAuthorizingManagerPin ? 'Authorizing...' : 'Cancel Items'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeModal === 'cancel' && selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-base text-red-700" style={{ fontWeight: 600 }}>Cancel Order</h2>
              <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <p className="text-sm text-red-700 mb-1" style={{ fontWeight: 600 }}>Cancel Warning</p>
                <p className="text-xs text-red-500">This will cancel the pending order. If it was already paid, payment will be marked as refunded.</p>
              </div>

              <div className="bg-muted rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Order #</span>
                  <span className="text-gray-800 font-medium">{selectedOrder.orderNumber || selectedOrder.id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Customer</span>
                  <span className="text-gray-800">{selectedOrder.customer}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Amount</span>
                  <span className="text-red-600" style={{ fontWeight: 700 }}>₱{selectedRefundAmount.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2" style={{ fontWeight: 500 }}>Reason for Cancel *</label>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Enter the reason for cancelling this order..."
                  autoFocus
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 bg-muted resize-none"
                />
              </div>

              {managerPinField}

              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCancelSubmit}
                  disabled={!cancelReason.trim() || managerPin.trim().length < 4 || isAuthorizingManagerPin}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontWeight: 600 }}
                >
                  {isAuthorizingManagerPin ? 'Authorizing...' : 'Cancel Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmDialog
        isOpen={Boolean(refundingOrder)}
        title="Confirm Refund"
        description={`Refund ${selectedRefundIndices.length} selected item(s) from order ${refundingOrder?.id ?? ''}? The receipt will stay in history.`}
        onCancel={() => setRefundingOrder(null)}
        onConfirm={async () => {
          if (!refundingOrder) return;
          await refundOrderItems(refundingOrder.id, selectedRefundIndices, buildAuthorization(refundReason.trim()));
          await loadOrderChangeLogs();
          setRefundingOrder(null);
          closeModal();
        }}
      />
      <DeleteConfirmDialog
        isOpen={Boolean(cancellingOrder)}
        title="Confirm Cancel"
        description={`Are you sure you want to cancel order ${cancellingOrder?.orderNumber || cancellingOrder?.id || ''}?`}
        onCancel={() => setCancellingOrder(null)}
        onConfirm={() => {
          if (!cancellingOrder) return;
          void cancelOrder(cancellingOrder.id, false, buildAuthorization(cancelReason.trim()))
            .then(async () => {
              await loadOrderChangeLogs();
              setCancellingOrder(null);
              closeModal();
            })
            .catch((error) => {
              alert(error instanceof Error ? error.message : 'Unable to cancel order.');
              setCancellingOrder(null);
            });
        }}
      />
      <DeleteConfirmDialog
        isOpen={Boolean(itemCancellingOrder)}
        title="Confirm Item Cancellation"
        description={`Cancel ${selectedCancelIndices.length} selected item(s) from order ${itemCancellingOrder?.orderNumber || itemCancellingOrder?.id || ''}?`}
        onCancel={() => setItemCancellingOrder(null)}
        onConfirm={() => {
          if (!itemCancellingOrder) return;
          void cancelOrderItems(itemCancellingOrder.id, selectedCancelIndices, buildAuthorization(itemCancelReason.trim()))
            .then(async () => {
              await loadOrderChangeLogs();
              setItemCancellingOrder(null);
              closeModal();
            })
            .catch((error) => {
              alert(error instanceof Error ? error.message : 'Unable to cancel selected items.');
              setItemCancellingOrder(null);
            });
        }}
      />
    </div>
  );
}

