import { useEffect, useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { ChevronDown, ChevronRight, Clock, Download, TrendingUp, PhilippinePeso, ShoppingCart, Eye, AlertTriangle, ClipboardList, Search, Activity } from "lucide-react";
import {
  useRestaurantAdjustmentsQuery,
  useRestaurantGoodsRecordsQuery,
  useRestaurantIngredientConsumptionQuery,
  useRestaurantInventoryQuery,
  useRestaurantKitchenOrdersQuery,
  useRestaurantPurchaseOrdersQuery,
  useRestaurantTransfersQuery,
  useRestaurantUsersQuery,
  useRestaurantWasteQuery,
  useRestaurantAuditLogsQuery,
} from "../lib/restaurant";
import { useSession } from "../../app/hooks/useSession";
import { defaultCategoryHierarchy, formatCurrency, getInventoryValue, splitCategory } from "../lib/inventoryLogic";

type TabType = 'overview' | 'inventory' | 'consumption' | 'orders' | 'operations' | 'audit' | 'admin';

const COLORS = ["#007A5E", "#009BA5", "#F59E0B", "#DC2626", "#8B5CF6", "#EC4899", "#10b981"];

const statusPill = (status: string) => {
  const map: Record<string, string> = {
    received: 'bg-green-100 text-green-700',
    approved: 'bg-blue-100 text-blue-700',
    partial: 'bg-yellow-100 text-yellow-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
    completed: 'bg-green-100 text-green-700',
    'in-transit': 'bg-blue-100 text-blue-700',
    pending: 'bg-yellow-100 text-yellow-700',
    verified: 'bg-green-100 text-green-700',
    admin: 'bg-red-100 text-red-700',
    manager: 'bg-blue-100 text-blue-700',
    staff: 'bg-gray-100 text-gray-700',
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-600',
  };
  return map[status?.toLowerCase()] ?? 'bg-gray-100 text-gray-600';
};

const formatAuditDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const csvValue = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const normalizeAuditActor = (value: unknown) => String(value ?? '').trim().toLowerCase();
const cleanList = (items?: unknown[]) =>
  Array.from(new Set((items ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)));
const formatDuration = (start?: string, end?: string) => {
  if (!start) return '0 mins';
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return '0 mins';
  const minutes = Math.max(0, Math.round((endTime - startTime) / 60000));
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} hr${hours === 1 ? '' : 's'}${rest ? ` ${rest} mins` : ''}`;
};
const formatRunningSeconds = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':');
};
const runningSeconds = (order: any, now: number) => {
  if (order.runningDuration !== null && order.runningDuration !== undefined && !order.isRunning) {
    return Number(order.runningDuration);
  }
  const start = order.runningTimeStart ?? order.running_time_start ?? order.preparingStartedAt;
  const end = order.runningTimeEnd ?? order.running_time_end ?? (order.isRunning ? undefined : order.completedAt);
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : now;
  return Number.isNaN(startMs) || Number.isNaN(endMs) ? 0 : Math.max(0, Math.floor((endMs - startMs) / 1000));
};
const normalizeOrderStatus = (value?: string) =>
  String(value ?? 'pending').replace(/_/g, ' ').toLowerCase();

function DetailValues({ label, values, warning = false }: { label: string; values: string[]; warning?: boolean }) {
  return (
    <div>
      <p className={`text-xs font-semibold ${warning && values.length > 0 ? 'text-amber-700' : 'text-foreground'}`}>{label}</p>
      {values.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">None</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span key={value} className={`rounded border px-2 py-1 text-xs ${warning ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-border bg-muted/40 text-muted-foreground'}`}>
              {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Reports() {
  const { currentUser } = useSession();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [expandedPosTransactions, setExpandedPosTransactions] = useState<Record<string, boolean>>({});
  const [auditModuleFilter, setAuditModuleFilter] = useState('all');
  const [activityQuery, setActivityQuery] = useState('');
  const [activityDateFrom, setActivityDateFrom] = useState('');
  const [activityDateTo, setActivityDateTo] = useState('');
  const [activityUserFilter, setActivityUserFilter] = useState('All');
  const [activityModuleFilter, setActivityModuleFilter] = useState('All');
  const [activityActionFilter, setActivityActionFilter] = useState('All');
  const [consumptionFrom, setConsumptionFrom] = useState('');
  const [consumptionTo, setConsumptionTo] = useState('');
  const consumptionQuery = useRestaurantIngredientConsumptionQuery({
    from: consumptionFrom || undefined,
    to: consumptionTo || undefined,
  });
  const consumption = consumptionQuery.data;
  const [selectedMainCategory, setSelectedMainCategory] = useState("all");
  const [selectedSubCategory, setSelectedSubCategory] = useState("all");
  const [runningClock, setRunningClock] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setRunningClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const isAdmin = currentUser?.role === "Admin";
  const hasFullAuditTrailAccess = currentUser?.role === "Admin";
  const currentUserEmail = currentUser?.email ?? "";

  const { data: products = [] } = useRestaurantInventoryQuery();
  const { data: purchaseOrders = [] } = useRestaurantPurchaseOrdersQuery();
  const { data: transfers = [] } = useRestaurantTransfersQuery();
  const { data: adjustments = [] } = useRestaurantAdjustmentsQuery();
  const { data: wasteLogs = [] } = useRestaurantWasteQuery();
  const { data: goodsReceived = [] } = useRestaurantGoodsRecordsQuery();
  const { data: posOrders = [] } = useRestaurantKitchenOrdersQuery();
  const { data: users = [] } = useRestaurantUsersQuery(isAdmin);
  // Real audit trail — one row per recorded activity (create / update / delete /
  // status change / receive / adjust / setting change) written by the backend.
  const { data: auditTrail = [] } = useRestaurantAuditLogsQuery();

  const inventoryValue = getInventoryValue(products);

  // ── Category helpers ────────────────────────────────────────────────────────
  const liveCategoryHierarchy = useMemo(() =>
    products.reduce<Record<string, string[]>>((acc, product) => {
      const { main, sub } = splitCategory(product.category);
      if (!acc[main]) acc[main] = [];
      if (!acc[main].includes(sub)) acc[main].push(sub);
      return acc;
    }, {}),
    [products],
  );
  const categoryHierarchy = Object.keys(liveCategoryHierarchy).length > 0
    ? liveCategoryHierarchy
    : defaultCategoryHierarchy;
  const mainCategories = Object.keys(categoryHierarchy);
  const currentSubCategories = selectedMainCategory !== "all" && selectedMainCategory in categoryHierarchy
    ? categoryHierarchy[selectedMainCategory]
    : [];

  const handleMainCategoryChange = (cat: string) => {
    setSelectedMainCategory(cat);
    setSelectedSubCategory("all");
  };

  // ── Overview ────────────────────────────────────────────────────────────────
  const receivedPOs = useMemo(() => purchaseOrders.filter(o => o.status === "received"), [purchaseOrders]);

  const allCategoryPerf = useMemo(() =>
    products.map(p => {
      const { main, sub } = splitCategory(p.category);
      return { id: p.sku, category: main, subCategory: sub, sales: p.stock * p.price };
    }),
    [products],
  );

  const categoryPerformance = useMemo(() => {
    const filtered = allCategoryPerf.filter(item => {
      const matchesMain = selectedMainCategory === "all" || item.category === selectedMainCategory;
      const matchesSub = selectedSubCategory === "all" || item.subCategory === selectedSubCategory;
      return matchesMain && matchesSub;
    });
    const grouped: Record<string, number> = {};
    filtered.forEach(item => {
      const key = selectedMainCategory !== "all" ? item.subCategory : item.category;
      grouped[key] = (grouped[key] || 0) + item.sales;
    });
    const arr = Object.entries(grouped).map(([category, sales]) => ({
      id: category.toLowerCase().replace(/\s+/g, '-'),
      category,
      sales,
      percentage: 0,
    }));
    const total = arr.reduce((s, i) => s + i.sales, 0);
    arr.forEach(i => { i.percentage = total > 0 ? Math.round((i.sales / total) * 100) : 0; });
    return arr;
  }, [allCategoryPerf, selectedMainCategory, selectedSubCategory]);

  const topProducts = useMemo(() =>
    [...products]
      .sort((a, b) => b.stock * b.price - a.stock * a.price)
      .slice(0, 5)
      .map(p => ({ id: p.sku, name: p.name, stock: p.stock, unit: p.unit || "pcs", revenue: p.stock * p.price })),
    [products],
  );

  const categoryStats = useMemo(() => {
    const stats: Record<string, { quantity: number; value: number; items: number }> = {};
    products.forEach(p => {
      const { main } = splitCategory(p.category);
      if (!stats[main]) stats[main] = { quantity: 0, value: 0, items: 0 };
      stats[main].quantity += p.stock;
      stats[main].value += p.stock * p.price;
      stats[main].items += 1;
    });
    return stats;
  }, [products]);

  const receiptTrendData = useMemo(() =>
    receivedPOs.map((o, i) => ({ date: o.date || `PO ${i + 1}`, value: o.total })),
    [receivedPOs],
  );

  const posTransactions = useMemo(() =>
    (posOrders as any[]).map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const orderedAt = order.runningTimeStart ?? order.running_time_start ?? order.preparingStartedAt ?? '';
      const completedAt = ['completed', 'cancelled'].includes(String(order.status ?? '').toLowerCase())
        ? order.completedAt ?? order.tableEndedAt ?? order.updatedAt ?? orderedAt
        : undefined;
      const tableStartedAt = order.tableStartedAt ?? undefined;
      const tableEndedAt = order.tableEndedAt ?? completedAt;
      return {
        id: order.id,
        orderNumber: order.orderNumber ?? order.receiptNo ?? order.id,
        customerName: order.customerName ?? 'Walk-in Customer',
        orderType: order.orderType ?? 'Takeout',
        tableNumber: order.tableNumber || 'No table selected',
        paymentMethod: order.paymentMethod ?? 'POS',
        paymentStatus: String(order.paymentStatus ?? 'NOT_PAID').replace(/_/g, ' '),
        orderStatus: normalizeOrderStatus(order.status),
        totalAmount: Number(order.totalAmount ?? 0),
        orderedAt,
        completedAt,
        paymentAt: order.paymentAt ?? undefined,
        preparingStartedAt: order.preparingStartedAt ?? undefined,
        readyAt: order.readyAt ?? undefined,
        tableStartedAt,
        tableEndedAt,
        preparationTime: order.preparingStartedAt ? formatDuration(order.preparingStartedAt, order.readyAt ?? undefined) : 'Not started',
        runningTime: formatRunningSeconds(runningSeconds(order, runningClock)),
        customerStayDuration: tableStartedAt ? formatDuration(tableStartedAt, tableEndedAt) : 'No table selected',
        items,
      };
    }),
    [posOrders, runningClock],
  );

  const averageCompletionTime = useMemo(() => {
    const finalized = posTransactions.filter((order) => order.completedAt);
    if (finalized.length === 0) return '00:00:00';
    const total = finalized.reduce((sum, order) => sum + runningSeconds(order, runningClock), 0);
    return formatRunningSeconds(total / finalized.length);
  }, [posTransactions, runningClock]);

  const averagePreparationTime = useMemo(() => {
    const prepared = posTransactions.filter((order) => order.preparingStartedAt && order.readyAt);
    if (prepared.length === 0) return '00:00:00';
    const total = prepared.reduce((sum, order) => {
      const start = new Date(order.preparingStartedAt!).getTime();
      const end = new Date(order.readyAt!).getTime();
      return sum + (Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.max(0, Math.floor((end - start) / 1000)));
    }, 0);
    return formatRunningSeconds(total / prepared.length);
  }, [posTransactions]);

  // ── Operations ──────────────────────────────────────────────────────────────
  const operationsData = useMemo(() => {
    const completedTransfers = transfers.filter(t => t.status === 'completed').length;
    const pendingTransfers = transfers.filter(t => ['pending', 'in-transit'].includes(t.status)).length;

    const wasteByType: Record<string, { count: number; value: number }> = {};
    wasteLogs.forEach(w => {
      const t = w.wasteType || 'other';
      if (!wasteByType[t]) wasteByType[t] = { count: 0, value: 0 };
      wasteByType[t].count += 1;
      wasteByType[t].value += w.totalValue || 0;
    });

    const totalReceivedItems = goodsReceived.reduce((sum, gr) =>
      sum + (gr.receivedItems || []).reduce((s: number, item: any) => s + (item.acceptedQuantity || 0), 0), 0);

    const adjustmentsByType: Record<string, number> = {};
    adjustments.forEach(a => {
      const t = a.type || 'other';
      adjustmentsByType[t] = (adjustmentsByType[t] || 0) + 1;
    });

    return { completedTransfers, pendingTransfers, wasteByType, totalReceivedItems, adjustmentsByType };
  }, [transfers, wasteLogs, goodsReceived, adjustments]);

  // ── Financial ───────────────────────────────────────────────────────────────
  const financialData = useMemo(() => {
    const totalInventoryValue = products.reduce((sum, p) => sum + p.stock * p.price, 0);
    const totalPOSpending = purchaseOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const receivedPOValue = receivedPOs.reduce((sum, o) => sum + (o.total || 0), 0);
    const wasteValue = wasteLogs.reduce((sum, w) => sum + (w.totalValue || 0), 0);

    const categoryValue: Record<string, number> = {};
    products.forEach(p => {
      const { main } = splitCategory(p.category);
      categoryValue[main] = (categoryValue[main] || 0) + p.stock * p.price;
    });

    const assetHealthScore = totalInventoryValue > 0
      ? ((totalInventoryValue - wasteValue) / totalInventoryValue) * 100
      : 0;

    return { totalInventoryValue, totalPOSpending, receivedPOValue, wasteValue, categoryValue, assetHealthScore };
  }, [products, purchaseOrders, receivedPOs, wasteLogs]);

  const visibleAuditTrail = useMemo(() => {
    if (hasFullAuditTrailAccess) return auditTrail;
    if (!currentUserEmail) return [];

    const normalizedEmail = normalizeAuditActor(currentUserEmail);
    return auditTrail.filter(
      entry => normalizeAuditActor(entry.performedBy) === normalizedEmail,
    );
  }, [auditTrail, currentUserEmail, hasFullAuditTrailAccess]);

  const auditSummary = useMemo(() => {
    const byModule = visibleAuditTrail.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.module] = (acc[entry.module] || 0) + 1;
      return acc;
    }, {});
    const latest = visibleAuditTrail[0]?.date ? formatAuditDate(visibleAuditTrail[0].date) : 'No activity';
    return { byModule, latest };
  }, [visibleAuditTrail]);

  // Summary cards filter the activity table below by module; clicking the active
  // card (or Total Events) clears it back to "all".
  const toggleAuditModule = (module: string) => {
    setAuditModuleFilter((current) => (current === module ? 'all' : module));
  };

  const filteredAuditTrail = useMemo(
    () =>
      auditModuleFilter === 'all'
        ? visibleAuditTrail
        : visibleAuditTrail.filter((entry) => entry.module === auditModuleFilter),
    [visibleAuditTrail, auditModuleFilter],
  );

  // ── Confidential ────────────────────────────────────────────────────────────
  const confidentialData = useMemo(() => {
    if (!isAdmin) return null;

    const byRole: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    users.forEach(u => {
      byRole[u.role] = (byRole[u.role] || 0) + 1;
      byStatus[u.status] = (byStatus[u.status] || 0) + 1;
    });

    const criticalEvents = [
      ...wasteLogs.map(w => ({
        kind: 'Waste',
        description: `${w.wasteType || 'Waste'}: ${w.item}`,
        date: w.date || '',
        by: w.loggedBy || '—',
        value: w.totalValue || 0,
      })),
      ...adjustments.map(a => ({
        kind: 'Adjustment',
        description: `${a.type || 'correction'}: ${a.item}`,
        date: a.date || '',
        by: a.adjustedBy || '—',
        value: 0,
      })),
    ]
      .filter(e => e.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);

    return { byRole, byStatus, criticalEvents };
  }, [isAdmin, users, wasteLogs, adjustments]);

  // Activity Log — a POS-style event feed over the real audit trail, with the same
  // filter set as the POS Activity Log page (date range, user, module, action,
  // free-text search).
  const activityUsers = useMemo(() => {
    const map = new Map<string, string>();
    auditTrail.forEach((entry) => {
      const value = (entry.performedBy || '').trim();
      if (value && !map.has(value)) map.set(value, entry.performedByName || value);
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [auditTrail]);

  const activityModules = useMemo(
    () => ['All', ...Array.from(new Set(auditTrail.map((e) => e.module).filter(Boolean))).sort()],
    [auditTrail],
  );
  const activityActions = useMemo(
    () => ['All', ...Array.from(new Set(auditTrail.map((e) => e.action).filter(Boolean))).sort()],
    [auditTrail],
  );

  const activityLog = useMemo(() => {
    const query = activityQuery.trim().toLowerCase();
    return auditTrail.filter((entry) => {
      if (activityUserFilter !== 'All' && normalizeAuditActor(entry.performedBy) !== normalizeAuditActor(activityUserFilter)) return false;
      if (activityModuleFilter !== 'All' && entry.module !== activityModuleFilter) return false;
      if (activityActionFilter !== 'All' && entry.action !== activityActionFilter) return false;
      const day = (entry.date || '').slice(0, 10);
      if (activityDateFrom && (!day || day < activityDateFrom)) return false;
      if (activityDateTo && (!day || day > activityDateTo)) return false;
      if (query) {
        const haystack = [
          entry.performedByName, entry.performedBy, entry.module, entry.action,
          entry.item, entry.quantity, entry.details,
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [auditTrail, activityUserFilter, activityModuleFilter, activityActionFilter, activityDateFrom, activityDateTo, activityQuery]);

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    let csv = '';
    let filename = `restaurant_${activeTab}_${timestamp}.csv`;

    if (activeTab === 'overview' || activeTab === 'inventory') {
      csv = 'Category,Units in Stock,Value,Products\n';
      Object.entries(categoryStats).forEach(([cat, d]) => {
        csv += `${cat},${d.quantity},${d.value.toFixed(2)},${d.items}\n`;
      });
    } else if (activeTab === 'consumption') {
      csv = 'Ingredient,Category,Total Consumed,Unit,Times Used,Current Stock,Last Used\n';
      (consumption?.items ?? []).forEach(r => {
        csv += [
          r.name,
          r.category ?? '',
          r.totalConsumed,
          r.unit ?? '',
          r.movementCount,
          r.currentStock ?? '',
          formatAuditDate(r.lastConsumedAt ?? undefined),
        ].map(csvValue).join(',') + '\n';
      });
    } else if (activeTab === 'orders') {
      csv = 'Type,Order Number,Customer,Order Type,Table,Payment Method,Payment Status,Order Status,Total,Time Ordered,Time Completed,Preparation Time,Running Time,Customer Stay Duration\n';
      posTransactions.forEach(order => {
        csv += [
          'POS Transaction',
          order.orderNumber,
          order.customerName,
          order.orderType,
          order.tableNumber,
          order.paymentMethod,
          order.paymentStatus,
          order.orderStatus,
          order.totalAmount.toFixed(2),
          formatAuditDate(order.orderedAt),
          order.completedAt ? formatAuditDate(order.completedAt) : '',
          order.preparationTime,
          order.runningTime,
          order.customerStayDuration,
        ].map(csvValue).join(',') + '\n';
      });
      csv += '\nPurchase Date,Supplier,Status,Total\n';
      purchaseOrders.forEach(o => {
        csv += `${o.date || ''},${o.supplier || ''},${o.status || ''},${(o.total || 0).toFixed(2)}\n`;
      });
    } else if (activeTab === 'operations') {
      csv = 'Type,Count\n';
      csv += `Total Transfers,${transfers.length}\n`;
      csv += `Completed Transfers,${operationsData.completedTransfers}\n`;
      csv += `Total Adjustments,${adjustments.length}\n`;
      csv += `Total Waste Logs,${wasteLogs.length}\n`;
      csv += `Goods Received,${goodsReceived.length}\n`;
    } else if (activeTab === 'audit') {
      csv = 'Date,Module,Action,Item,Quantity,Performed By,Reference,Status,Details\n';
      visibleAuditTrail.forEach(entry => {
        csv += [
          formatAuditDate(entry.date),
          entry.module,
          entry.action,
          entry.item,
          entry.quantity,
          entry.performedBy,
          entry.reference,
          entry.status,
          entry.details,
        ].map(csvValue).join(',') + '\n';
      });
    } else if (activeTab === 'admin') {
      if (!isAdmin) return;
      csv = 'Metric,Value\n';
      csv += `Total Inventory Value,${financialData.totalInventoryValue.toFixed(2)}\n`;
      csv += `Total PO Spending,${financialData.totalPOSpending.toFixed(2)}\n`;
      csv += `Waste Loss,${financialData.wasteValue.toFixed(2)}\n`;
      csv += `Asset Health Score,${financialData.assetHealthScore.toFixed(1)}%\n`;
      csv += '\nUser List\nName,Email,Role,Status,Last Login\n';
      users.forEach(u => {
        csv += `${u.name},${u.email},${u.role},${u.status},${u.lastLogin || ''}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Tab button helper ───────────────────────────────────────────────────────
  const tabCls = (id: TabType, danger = false) =>
    `px-6 py-3 text-sm font-medium border-b-2 rounded-t-lg transition-all duration-200 flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
      activeTab === id
        ? danger
          ? 'text-red-600 border-red-600'
          : 'text-primary border-primary'
        : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40 hover:border-border'
    }`;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">Comprehensive restaurant reports and insights</p>
        </div>
        <div className="flex gap-3">
          <label className="text-xs text-muted-foreground">
            From
            <input type="date" value={consumptionFrom} onChange={e => setConsumptionFrom(e.target.value)}
              className="block mt-1 bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground cursor-pointer hover:border-primary/60 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200" />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <input type="date" value={consumptionTo} onChange={e => setConsumptionTo(e.target.value)}
              className="block mt-1 bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground cursor-pointer hover:border-primary/60 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200" />
          </label>
          {(consumptionFrom || consumptionTo) && (
            <button onClick={() => { setConsumptionFrom(''); setConsumptionTo(''); }}
              className="self-end px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Clear</button>
          )}
          <button
            onClick={handleExport}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-sm transition-all duration-200 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-6 border-b border-border overflow-x-auto">
        <button onClick={() => setActiveTab('overview')} className={tabCls('overview')}>Overview</button>
        <button onClick={() => setActiveTab('inventory')} className={tabCls('inventory')}>Inventory Report</button>
        <button onClick={() => setActiveTab('consumption')} className={tabCls('consumption')}>Ingredients Used</button>
        <button onClick={() => setActiveTab('orders')} className={tabCls('orders')}>Purchase Orders</button>
        <button onClick={() => setActiveTab('operations')} className={tabCls('operations')}>Operations Report</button>
        <button onClick={() => setActiveTab('audit')} className={tabCls('audit')}>
          <ClipboardList className="w-4 h-4" />
          Audit Trail
        </button>
        {isAdmin && (
          <button onClick={() => setActiveTab('admin')} className={tabCls('admin')}>
            <Eye className="w-4 h-4" />
            Admin Report
          </button>
        )}
      </div>

      {/* ── Overview ──────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-foreground">System Overview</h3>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <PhilippinePeso className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-muted-foreground text-xs mb-1">Inventory Value</p>
              <p className="text-2xl font-bold text-foreground break-words">{formatCurrency(inventoryValue)}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-muted-foreground text-xs mb-1">Completed Orders</p>
              <p className="text-2xl font-bold text-foreground">{receivedPOs.length}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-muted-foreground text-xs mb-1">Avg. Order Value</p>
              <p className="text-2xl font-bold text-foreground break-words">
                {formatCurrency(receivedPOs.length ? receivedPOs.reduce((s, o) => s + o.total, 0) / receivedPOs.length : 0)}
              </p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-muted-foreground text-xs mb-1">Avg. Completion Time</p>
              <p className="text-2xl font-bold text-foreground break-words">{averageCompletionTime}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-muted-foreground text-xs mb-1">Avg. Preparation Time</p>
              <p className="text-2xl font-bold text-foreground break-words">{averagePreparationTime}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Category Pie */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-base font-semibold text-foreground">Category Performance</h4>
                <div className="flex gap-2">
                  <select value={selectedMainCategory} onChange={e => handleMainCategoryChange(e.target.value)}
                    className="text-xs bg-card border border-border rounded-lg px-2 py-1 focus:outline-none">
                    <option value="all">All Categories</option>
                    {mainCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {selectedMainCategory !== "all" && (
                    <select value={selectedSubCategory} onChange={e => setSelectedSubCategory(e.target.value)}
                      className="text-xs bg-card border border-border rounded-lg px-2 py-1 focus:outline-none">
                      <option value="all">All {selectedMainCategory}</option>
                      {currentSubCategories.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              </div>
              {categoryPerformance.length > 0 ? (
                <div className="flex items-center gap-4">
                  <PieChart width={180} height={180}>
                    <Pie data={categoryPerformance} cx={90} cy={90} labelLine={false} label={false}
                      outerRadius={75} dataKey="sales" nameKey="category" isAnimationActive={false}>
                      {categoryPerformance.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                      formatter={(v: number) => [formatCurrency(v), 'Value']} />
                  </PieChart>
                  <div className="flex-1 space-y-2 min-w-0">
                    {categoryPerformance.map((item, i) => (
                      <div key={item.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-xs text-foreground truncate">{item.category}</span>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{item.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">No data available</div>
              )}
            </div>

            {/* Receipt Trend */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <h4 className="text-base font-semibold text-foreground mb-1">Receipt Trend</h4>
              <p className="text-xs text-muted-foreground mb-4">Based on received purchase orders.</p>
              {receiptTrendData.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No received purchase order data yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <BarChart width={Math.max(300, receiptTrendData.length * 55)} height={200} data={receiptTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#64748b" style={{ fontSize: '11px' }} />
                    <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                      formatter={(v: number) => [formatCurrency(v), 'Total']} />
                    <Bar dataKey="value" fill="#009BA5" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Inventory Report ───────────────────────────────────────────────────── */}
      {activeTab === 'inventory' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-foreground">Inventory Report</h3>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 mb-4">
            <h4 className="text-base font-semibold text-foreground mb-4">Inventory by Category</h4>
            <div className="space-y-3">
              {Object.entries(categoryStats).sort((a, b) => b[1].value - a[1].value).map(([cat, data]) => (
                <div key={cat} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{cat}</p>
                    <div className="flex gap-4 mt-1">
                      <span className="text-xs text-muted-foreground">{data.quantity} units in stock</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{data.items} unique products</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-sm font-bold text-primary">{formatCurrency(data.value)}</p>
                    <p className="text-xs text-muted-foreground">
                      {inventoryValue > 0 ? ((data.value / inventoryValue) * 100).toFixed(1) : '0'}% of total
                    </p>
                  </div>
                </div>
              ))}
              {Object.keys(categoryStats).length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">No inventory data yet</div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <h4 className="text-base font-semibold text-foreground mb-4">Top Products by Value</h4>
            <div className="space-y-3">
              {topProducts.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No products yet</div>
              ) : topProducts.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/30 transition-colors">
                  <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.stock} {p.unit} in stock</p>
                  </div>
                  <p className="text-sm font-bold text-foreground flex-shrink-0">{formatCurrency(p.revenue)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Ingredients Used (consumption) ─────────────────────────────────────── */}
      {activeTab === 'consumption' && (
        <div>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Ingredients Used</h2>
              <p className="text-sm text-muted-foreground">
                Quantity of each ingredient consumed by completed sales{consumption?.from || consumption?.to ? '' : ' (last 30 days)'}.
              </p>
            </div>
            <div className="flex items-end gap-3">
              <label className="text-xs text-muted-foreground">
                From
                <input type="date" value={consumptionFrom} onChange={e => setConsumptionFrom(e.target.value)}
                  className="block mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              </label>
              <label className="text-xs text-muted-foreground">
                To
                <input type="date" value={consumptionTo} onChange={e => setConsumptionTo(e.target.value)}
                  className="block mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-background" />
              </label>
              {(consumptionFrom || consumptionTo) && (
                <button onClick={() => { setConsumptionFrom(''); setConsumptionTo(''); }}
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Clear</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Ingredients used</p>
              <p className="text-2xl font-semibold text-foreground">{consumption?.totalIngredients ?? 0}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Total quantity consumed</p>
              <p className="text-2xl font-semibold text-foreground">{(consumption?.totalQuantityConsumed ?? 0).toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Ingredient</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-right px-4 py-3 font-medium">Consumed</th>
                  <th className="text-right px-4 py-3 font-medium">Times used</th>
                  <th className="text-right px-4 py-3 font-medium">Current stock</th>
                  <th className="text-left px-4 py-3 font-medium">Last used</th>
                </tr>
              </thead>
              <tbody>
                {consumptionQuery.isLoading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!consumptionQuery.isLoading && (consumption?.items?.length ?? 0) === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No ingredient consumption in this period.</td></tr>
                )}
                {consumption?.items?.map(r => (
                  <tr key={r.itemId} className="border-t border-border">
                    <td className="px-4 py-3 text-foreground">{r.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.category ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-foreground font-medium">{r.totalConsumed.toLocaleString()} {r.unit ?? ''}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.movementCount}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.currentStock ?? '—'} {r.unit ?? ''}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatAuditDate(r.lastConsumedAt ?? undefined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Purchase Orders ────────────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-foreground">Purchase Orders Report</h3>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-card border border-border rounded-2xl p-6">
              <p className="text-muted-foreground text-xs mb-2">Total Orders</p>
              <p className="text-2xl font-bold text-foreground">{purchaseOrders.length}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6">
              <p className="text-muted-foreground text-xs mb-2">Received Orders</p>
              <p className="text-2xl font-bold text-primary">{receivedPOs.length}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {purchaseOrders.length > 0 ? ((receivedPOs.length / purchaseOrders.length) * 100).toFixed(0) : 0}% completion rate
              </p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <p className="text-muted-foreground text-xs mb-2">Total Value Received</p>
              <p className="text-2xl font-bold text-foreground break-words">
                {formatCurrency(receivedPOs.reduce((s, o) => s + o.total, 0))}
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 mb-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-foreground">POS Transaction History</h4>
                <p className="text-xs text-muted-foreground">Expandable order details with products, ingredients, modifiers, payment status, running time, and stay duration.</p>
              </div>
              <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                {posTransactions.length} transaction{posTransactions.length === 1 ? '' : 's'}
              </span>
            </div>

            {posTransactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No POS transactions found</p>
            ) : (
              <div className="space-y-3">
                {posTransactions.slice(0, 100).map((order) => {
                  const isExpanded = expandedPosTransactions[order.id] ?? false;

                  return (
                    <div key={order.id} className="rounded-xl border border-border bg-card">
                      <button
                        type="button"
                        onClick={() => setExpandedPosTransactions((current) => ({ ...current, [order.id]: !isExpanded }))}
                        className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-muted/30 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          {isExpanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground">Transaction #{order.orderNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {order.customerName} - {order.orderType} - {order.tableNumber}
                            </p>
                          </div>
                        </div>
                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:min-w-[520px] lg:grid-cols-5">
                          <span>{formatAuditDate(order.orderedAt)}</span>
                          <span className={`rounded-full px-2 py-1 text-center font-medium capitalize ${statusPill(order.paymentStatus)}`}>{order.paymentStatus}</span>
                          <span className={`rounded-full px-2 py-1 text-center font-medium capitalize ${statusPill(order.orderStatus)}`}>{order.orderStatus}</span>
                          <span className="font-semibold text-foreground">{formatCurrency(order.totalAmount)}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {order.runningTime}</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border px-4 py-4">
                          <div className="mb-4 grid gap-3 md:grid-cols-4">
                            <div className="rounded-lg bg-muted/30 p-3">
                              <p className="text-xs text-muted-foreground">Payment Method</p>
                              <p className="text-sm font-semibold text-foreground">{order.paymentMethod}</p>
                            </div>
                            <div className="rounded-lg bg-muted/30 p-3">
                              <p className="text-xs text-muted-foreground">Completed Time</p>
                              <p className="text-sm font-semibold text-foreground">{order.completedAt ? formatAuditDate(order.completedAt) : 'In progress'}</p>
                            </div>
                            <div className="rounded-lg bg-muted/30 p-3">
                              <p className="text-xs text-muted-foreground">Payment Time</p>
                              <p className="text-sm font-semibold text-foreground">{order.paymentAt ? formatAuditDate(order.paymentAt) : '-'}</p>
                            </div>
                            <div className="rounded-lg bg-muted/30 p-3">
                              <p className="text-xs text-muted-foreground">Preparing Start</p>
                              <p className="text-sm font-semibold text-foreground">{order.preparingStartedAt ? formatAuditDate(order.preparingStartedAt) : '-'}</p>
                            </div>
                            <div className="rounded-lg bg-muted/30 p-3">
                              <p className="text-xs text-muted-foreground">Ready to Serve</p>
                              <p className="text-sm font-semibold text-foreground">{order.readyAt ? formatAuditDate(order.readyAt) : '-'}</p>
                            </div>
                            <div className="rounded-lg bg-muted/30 p-3">
                              <p className="text-xs text-muted-foreground">Preparation Time</p>
                              <p className="text-sm font-semibold text-foreground">{order.preparationTime}</p>
                            </div>
                            <div className="rounded-lg bg-muted/30 p-3">
                              <p className="text-xs text-muted-foreground">Running Time</p>
                              <p className="text-sm font-semibold text-foreground">{order.runningTime}</p>
                            </div>
                            <div className="rounded-lg bg-muted/30 p-3">
                              <p className="text-xs text-muted-foreground">Customer Stay Duration</p>
                              <p className="text-sm font-semibold text-foreground">{order.customerStayDuration}</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {order.items.length === 0 ? (
                              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">No product details saved for this transaction</p>
                            ) : order.items.map((item: any) => {
                              const ingredients = cleanList(item.ingredients);
                              const removed = cleanList(item.removedIngredients);
                              const added = cleanList(item.addedIngredients);
                              const replaced = cleanList(item.replacedIngredients);
                              const notes = cleanList([...(item.specialInstructions ?? []), item.notes ?? '', ...(item.modifiers ?? [])]);

                              return (
                                <div key={String(item.id)} className="rounded-lg border border-border p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-semibold text-foreground">{item.name} x{item.quantity}</p>
                                    <p className="text-sm text-muted-foreground">{formatCurrency(Number(item.price ?? 0))} - {Number(item.prepTimeMinutes ?? 0)} mins</p>
                                  </div>
                                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <DetailValues label="Ingredients" values={ingredients} />
                                    <DetailValues label="Removed" values={removed} warning />
                                    <DetailValues label="Added" values={added} warning />
                                    <DetailValues label="Replaced" values={replaced} warning />
                                    <DetailValues label="Special Notes" values={notes} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 mb-4">
            <h4 className="text-base font-semibold text-foreground mb-1">Receipt Trend</h4>
            <p className="text-xs text-muted-foreground mb-4">Based on received purchase orders.</p>
            {receiptTrendData.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No received purchase order data yet</div>
            ) : (
              <div className="overflow-x-auto">
                <BarChart width={Math.max(400, receiptTrendData.length * 60)} height={220} data={receiptTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" style={{ fontSize: '11px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                    formatter={(v: number) => [formatCurrency(v), 'Total']} />
                  <Bar dataKey="value" fill="#009BA5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <h4 className="text-base font-semibold text-foreground mb-4">Order History</h4>
            {purchaseOrders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No purchase orders yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                      <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</th>
                      <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created By</th>
                      <th className="pb-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="pb-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {purchaseOrders.map((o, i) => (
                      <tr key={i} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 text-sm text-foreground">{o.date || `PO ${i + 1}`}</td>
                        <td className="py-3 text-sm text-foreground">{o.supplier || '—'}</td>
                        <td className="py-3 text-sm text-muted-foreground">{o.createdBy || '—'}</td>
                        <td className="py-3">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${statusPill(o.status)}`}>
                            {o.status || 'pending'}
                          </span>
                        </td>
                        <td className="py-3 text-sm font-medium text-foreground text-right">{formatCurrency(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Operations Report ──────────────────────────────────────────────────── */}
      {activeTab === 'operations' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-foreground">Operations Report</h3>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-card border border-border rounded-2xl p-6">
              <p className="text-muted-foreground text-xs mb-2">Total Transfers</p>
              <p className="text-2xl font-bold text-foreground">{transfers.length}</p>
              <p className="text-xs text-muted-foreground mt-1">{operationsData.completedTransfers} completed</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6">
              <p className="text-muted-foreground text-xs mb-2">Total Adjustments</p>
              <p className="text-2xl font-bold text-foreground">{adjustments.length}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6">
              <p className="text-muted-foreground text-xs mb-2">Waste / Spoilage Logs</p>
              <p className="text-2xl font-bold text-red-600">{wasteLogs.length}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6">
              <p className="text-muted-foreground text-xs mb-2">Goods Received</p>
              <p className="text-2xl font-bold text-foreground">{goodsReceived.length}</p>
              <p className="text-xs text-muted-foreground mt-1">{operationsData.totalReceivedItems} items accepted</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Adjustments by type */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <h4 className="text-base font-semibold text-foreground mb-4">Adjustments by Type</h4>
              <div className="space-y-3">
                {Object.entries(operationsData.adjustmentsByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-foreground capitalize">{type}</p>
                      <p className="text-xs text-muted-foreground">
                        {adjustments.length > 0 ? ((count / adjustments.length) * 100).toFixed(0) : 0}% of total
                      </p>
                    </div>
                    <p className="text-lg font-bold text-primary">{count}</p>
                  </div>
                ))}
                {Object.keys(operationsData.adjustmentsByType).length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No adjustments recorded</p>
                )}
              </div>
            </div>

            {/* Waste by type */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <h4 className="text-base font-semibold text-foreground mb-4">Waste / Spoilage by Type</h4>
              <div className="space-y-3">
                {Object.entries(operationsData.wasteByType).sort((a, b) => b[1].count - a[1].count).map(([type, data]) => (
                  <div key={type} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-foreground capitalize">{type}</p>
                      <p className="text-xs text-muted-foreground">{data.count} log{data.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-sm font-bold text-red-600">{formatCurrency(data.value)}</p>
                  </div>
                ))}
                {Object.keys(operationsData.wasteByType).length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No waste logs recorded</p>
                )}
              </div>
            </div>
          </div>

          {/* Transfer summary */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h4 className="text-base font-semibold text-foreground mb-4">Transfer Summary</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 rounded-xl">
                <p className="text-xs text-green-700 mb-1">Completed</p>
                <p className="text-2xl font-bold text-green-700">{operationsData.completedTransfers}</p>
              </div>
              <div className="p-4 bg-yellow-50 rounded-xl">
                <p className="text-xs text-yellow-700 mb-1">Pending / In-Transit</p>
                <p className="text-2xl font-bold text-yellow-700">{operationsData.pendingTransfers}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Completion Rate</p>
                <p className="text-2xl font-bold text-foreground">
                  {transfers.length > 0 ? ((operationsData.completedTransfers / transfers.length) * 100).toFixed(0) : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Financial Report (admin only) ─────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-foreground">Audit Trail</h3>
            <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
              {hasFullAuditTrailAccess ? 'Full operation view' : 'Your activity only'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Total Events', value: visibleAuditTrail.length, valueClass: 'text-foreground', module: 'all' },
              { label: 'Inventory Events', value: auditSummary.byModule.Inventory || 0, valueClass: 'text-primary', module: 'Inventory' },
              { label: 'Receiving Events', value: auditSummary.byModule['Goods Received'] || 0, valueClass: 'text-green-700', module: 'Goods Received' },
            ].map((card) => {
              const isActive = auditModuleFilter === card.module;
              return (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => toggleAuditModule(card.module)}
                  aria-pressed={isActive}
                  aria-label={`Filter audit trail by ${card.label}`}
                  className={`group text-left w-full bg-card border rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/25 hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-lg active:shadow-primary/30 ${
                    isActive ? 'border-primary bg-primary/5 shadow-md shadow-primary/20' : 'border-border'
                  }`}
                >
                  <p className="text-muted-foreground text-xs mb-2">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.valueClass}`}>{card.value}</p>
                </button>
              );
            })}
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <p className="text-muted-foreground text-xs mb-2">Latest Activity</p>
              <p className="text-sm font-semibold text-foreground break-words">{auditSummary.latest}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-foreground">Recent Activity</h4>
              <p className="text-xs text-muted-foreground">
                {auditModuleFilter === 'all' ? '' : `${auditModuleFilter} • `}
                {filteredAuditTrail.length} record{filteredAuditTrail.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">Module</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">Reference</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAuditTrail.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No audit trail records found
                      </td>
                    </tr>
                  ) : (
                    filteredAuditTrail.slice(0, 100).map(entry => (
                      <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatAuditDate(entry.date)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 rounded-lg text-xs font-medium bg-muted text-foreground">
                            {entry.module}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground capitalize">{entry.action.toLowerCase()}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{entry.item}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{entry.quantity || '-'}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{entry.performedBy || 'System'}</td>
                        <td className="px-4 py-3 text-xs text-primary font-medium whitespace-nowrap">{entry.reference}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground max-w-[260px] truncate">{entry.details || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'admin' && isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-foreground">Financial Report</h3>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <p className="text-muted-foreground text-xs mb-2">Total Inventory Value</p>
              <p className="text-2xl font-bold text-foreground break-words">{formatCurrency(financialData.totalInventoryValue)}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <p className="text-muted-foreground text-xs mb-2">Total PO Investment</p>
              <p className="text-2xl font-bold text-foreground break-words">{formatCurrency(financialData.totalPOSpending)}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <p className="text-muted-foreground text-xs mb-2">Received PO Value</p>
              <p className="text-2xl font-bold text-primary break-words">{formatCurrency(financialData.receivedPOValue)}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <p className="text-muted-foreground text-xs mb-2">Waste / Loss Value</p>
              <p className="text-2xl font-bold text-red-600 break-words">{formatCurrency(financialData.wasteValue)}</p>
            </div>
          </div>

          {/* Value by Category */}
          <div className="bg-card border border-border rounded-2xl p-6 mb-4">
            <h4 className="text-base font-semibold text-foreground mb-4">Value by Category</h4>
            <div className="space-y-3">
              {Object.entries(financialData.categoryValue).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                <div key={cat}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-foreground">{cat}</span>
                    <span className="font-bold text-primary">{formatCurrency(val)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${financialData.totalInventoryValue > 0 ? (val / financialData.totalInventoryValue) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {Object.keys(financialData.categoryValue).length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No inventory data yet</p>
              )}
            </div>
          </div>

          {/* Financial health */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-2xl p-6">
              <h4 className="text-base font-semibold text-foreground mb-4">Value Distribution</h4>
              {Object.keys(financialData.categoryValue).length > 0 ? (
                <div className="flex items-center gap-4">
                  <PieChart width={180} height={180}>
                    <Pie
                      data={Object.entries(financialData.categoryValue).map(([name, value]) => ({ name, value }))}
                      cx={90} cy={90} labelLine={false} label={false} outerRadius={75} dataKey="value"
                      isAnimationActive={false}
                    >
                      {Object.keys(financialData.categoryValue).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                      formatter={(v: number) => [formatCurrency(v), 'Value']} />
                  </PieChart>
                  <div className="flex-1 space-y-2 min-w-0">
                    {Object.entries(financialData.categoryValue).map(([cat], i) => (
                      <div key={cat} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-xs text-foreground truncate">{cat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">No data</div>
              )}
            </div>

            <div className="bg-card border border-border rounded-2xl p-6">
              <h4 className="text-base font-semibold text-foreground mb-4">Financial Health Indicators</h4>
              <div className="space-y-4">
                <div className="p-4 bg-green-50 rounded-xl">
                  <p className="text-xs text-green-700 mb-1">Asset Health Score</p>
                  <p className="text-2xl font-bold text-green-700">{financialData.assetHealthScore.toFixed(1)}%</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-xl">
                  <p className="text-xs text-blue-700 mb-1">Investment Return Potential</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {financialData.totalPOSpending > 0
                      ? ((financialData.totalInventoryValue / financialData.totalPOSpending) * 100).toFixed(0)
                      : 0}%
                  </p>
                </div>
                <div className="p-4 bg-red-50 rounded-xl">
                  <p className="text-xs text-red-700 mb-1">Loss from Waste</p>
                  <p className="text-2xl font-bold text-red-700 break-words">{formatCurrency(financialData.wasteValue)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confidential / Security (part of the merged Admin Report) ───────────── */}
      {activeTab === 'admin' && isAdmin && confidentialData && (
        <div className="mt-6 pt-6 border-t border-border">
          {/* Badge + export */}
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2">
              <Eye className="w-3 h-3" />
              CONFIDENTIAL — ADMIN ONLY
            </div>
          </div>

          {/* Warning banner */}
          <div className="bg-red-50 border-2 border-red-500 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-600">Warning</p>
              <p className="text-xs text-foreground mt-1">
                This report contains sensitive operational and user data. Access is restricted to administrators only.
                Do not share this information with unauthorized personnel.
              </p>
            </div>
          </div>

          {/* System Audit */}
          <div className="bg-card border border-border rounded-2xl p-6 mb-4">
            <h4 className="text-base font-semibold text-foreground mb-4">System Audit Summary</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-muted/30 rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Total Users</p>
                <p className="text-2xl font-bold text-foreground">{users.length}</p>
                <div className="flex gap-3 mt-2">
                  <span className="text-xs text-green-600">Active: {confidentialData.byStatus['active'] || 0}</span>
                  <span className="text-xs text-red-600">Inactive: {confidentialData.byStatus['inactive'] || 0}</span>
                </div>
              </div>
              <div className="p-4 bg-red-50 rounded-xl">
                <p className="text-xs text-red-700 mb-1">Admin Users</p>
                <p className="text-2xl font-bold text-red-700">{confidentialData.byRole['admin'] || 0}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-xl">
                <p className="text-xs text-green-700 mb-1">Staff / Inventory Manager</p>
                <p className="text-2xl font-bold text-green-700">
                  {(confidentialData.byRole['staff'] || 0) + (confidentialData.byRole['manager'] || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Activity Log */}
          <div className="bg-card border border-border rounded-2xl p-6 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-primary" />
              <h4 className="text-base font-semibold text-foreground">Activity Log</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Review recorded inventory actions and staff activity. {activityLog.length} of {auditTrail.length} entr{auditTrail.length === 1 ? 'y' : 'ies'}.
            </p>

            <div className="mb-4 grid gap-3 md:grid-cols-5">
              <input type="date" value={activityDateFrom} onChange={(e) => setActivityDateFrom(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm bg-background" />
              <input type="date" value={activityDateTo} onChange={(e) => setActivityDateTo(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm bg-background" />
              <select value={activityUserFilter} onChange={(e) => setActivityUserFilter(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm bg-background">
                <option value="All">All Users</option>
                {activityUsers.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
              <select value={activityModuleFilter} onChange={(e) => setActivityModuleFilter(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm bg-background">
                {activityModules.map((m) => <option key={m} value={m}>{m === 'All' ? 'All Modules' : m}</option>)}
              </select>
              <select value={activityActionFilter} onChange={(e) => setActivityActionFilter(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm bg-background">
                {activityActions.map((a) => <option key={a} value={a}>{a === 'All' ? 'All Actions' : a}</option>)}
              </select>
              <div className="relative md:col-span-5">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={activityQuery} onChange={(e) => setActivityQuery(e.target.value)} placeholder="Search activity details..." className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm bg-background" />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Date &amp; Time</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">User</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Module</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Action</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activityLog.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No activity found.</td></tr>
                  ) : activityLog.slice(0, 200).map((entry) => (
                    <tr key={entry.id} className="align-top hover:bg-muted/30 transition-colors">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatAuditDate(entry.date)}</td>
                      <td className="px-4 py-3 text-foreground">{entry.performedByName || 'System'}</td>
                      <td className="px-4 py-3"><span className="capitalize">{entry.performedByRole || '—'}</span></td>
                      <td className="px-4 py-3"><span className="inline-flex rounded-lg bg-muted px-2 py-1 text-xs font-medium text-foreground">{entry.module}</span></td>
                      <td className="px-4 py-3 capitalize text-foreground">{entry.action.toLowerCase()}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {[entry.item && `${entry.item}${entry.quantity ? ` (${entry.quantity})` : ''}`, entry.details].filter(Boolean).join(' — ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Critical Events */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h4 className="text-base font-semibold text-foreground mb-4">Critical Events & Incidents</h4>
            <div className="space-y-2">
              {confidentialData.criticalEvents.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No critical events recorded</p>
              ) : confidentialData.criticalEvents.map((event, i) => (
                <div key={i} className="flex items-start justify-between p-3 bg-red-50 rounded-xl border border-red-200">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-red-600 text-white px-2 py-0.5 rounded text-xs font-bold flex-shrink-0">
                        {event.kind}
                      </span>
                      <p className="text-sm font-medium text-foreground truncate">{event.description}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">By: {event.by}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-xs text-foreground">{event.date}</p>
                    {event.value > 0 && (
                      <p className="text-xs font-medium text-red-600">{formatCurrency(event.value)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

