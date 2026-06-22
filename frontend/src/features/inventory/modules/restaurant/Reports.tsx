import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { Download, TrendingUp, PhilippinePeso, ShoppingCart, Eye, AlertTriangle, ClipboardList } from "lucide-react";
import {
  useRestaurantAdjustmentsQuery,
  useRestaurantGoodsRecordsQuery,
  useRestaurantInventoryMovementsQuery,
  useRestaurantIngredientConsumptionQuery,
  useRestaurantInventoryQuery,
  useRestaurantKitchenOrdersQuery,
  useRestaurantPurchaseOrdersQuery,
  useRestaurantTransfersQuery,
  useRestaurantUsersQuery,
  useRestaurantWasteQuery,
} from "../lib/restaurant";
import { useSession } from "../../app/hooks/useSession";
import { defaultCategoryHierarchy, formatCurrency, getInventoryValue, splitCategory } from "../lib/inventoryLogic";

type TabType = 'overview' | 'inventory' | 'consumption' | 'orders' | 'operations' | 'audit' | 'financial' | 'confidential';

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

export function Reports() {
  const { currentUser } = useSession();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [consumptionFrom, setConsumptionFrom] = useState('');
  const [consumptionTo, setConsumptionTo] = useState('');
  const consumptionQuery = useRestaurantIngredientConsumptionQuery({
    from: consumptionFrom || undefined,
    to: consumptionTo || undefined,
  });
  const consumption = consumptionQuery.data;
  const [dateRange, setDateRange] = useState("30days");
  const [selectedMainCategory, setSelectedMainCategory] = useState("all");
  const [selectedSubCategory, setSelectedSubCategory] = useState("all");

  const isAdmin = currentUser?.role === "Admin";
  const hasFullAuditTrailAccess = currentUser?.role === "Admin" || currentUser?.role === "Manager";
  const currentUserEmail = currentUser?.email ?? "";

  const { data: products = [] } = useRestaurantInventoryQuery();
  const { data: purchaseOrders = [] } = useRestaurantPurchaseOrdersQuery();
  const { data: transfers = [] } = useRestaurantTransfersQuery();
  const { data: adjustments = [] } = useRestaurantAdjustmentsQuery();
  const { data: wasteLogs = [] } = useRestaurantWasteQuery();
  const { data: goodsReceived = [] } = useRestaurantGoodsRecordsQuery();
  const { data: inventoryMovements = [] } = useRestaurantInventoryMovementsQuery();
  const { data: posOrders = [] } = useRestaurantKitchenOrdersQuery();
  const { data: users = [] } = useRestaurantUsersQuery(isAdmin);

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

  const auditTrail = useMemo(() => {
    const entries = [
      ...inventoryMovements.map(movement => ({
        id: `movement-${movement.id}`,
        date: movement.date || '',
        module: 'Inventory',
        action: String(movement.type || 'Stock Movement').replace(/_/g, ' '),
        item: movement.item || 'Item',
        quantity: movement.quantity ? `${movement.quantity} ${movement.unit || ''}`.trim() : '',
        performedBy: movement.createdBy || movement.by || '',
        reference: movement.sourceId || movement.source || movement.id,
        details: [
          movement.previousQuantity !== undefined && movement.newQuantity !== undefined
            ? `${movement.previousQuantity} to ${movement.newQuantity}`
            : '',
          movement.notes || movement.reason || '',
          movement.location ? `Location: ${movement.location}` : '',
        ].filter(Boolean).join(' | '),
        status: 'recorded',
      })),
      ...posOrders.map(order => ({
        id: `pos-${order.id}`,
        date: order.voidedAt || order.orderedAt || '',
        module: 'POS / Kitchen',
        action: order.status === 'voided' ? 'Receipt Voided' : 'Receipt Completed',
        item: order.recipeName || 'Menu item',
        quantity: order.quantity ? `${order.quantity} order(s)` : '',
        performedBy: order.completedBy || '',
        reference: order.receiptNo || order.id,
        details: [
          order.modifiers?.length ? `Modifiers: ${order.modifiers.join(', ')}` : '',
          order.voidReason ? `Void reason: ${order.voidReason}` : '',
          order.notes || '',
        ].filter(Boolean).join(' | '),
        status: order.status || 'recorded',
      })),
      ...goodsReceived.map(receipt => ({
        id: `receipt-${receipt.backendId || receipt.id}`,
        date: receipt.receivedDate || '',
        module: 'Goods Received',
        action: 'Receipt Verified',
        item: `${receipt.items || receipt.receivedItems?.length || 0} item(s)`,
        quantity: `${(receipt.receivedItems || []).reduce((sum: number, item: any) => sum + (item.acceptedQuantity || 0), 0)} accepted`,
        performedBy: receipt.receivedBy || '',
        reference: receipt.id,
        details: receipt.notes || `PO: ${receipt.poId || 'N/A'}`,
        status: receipt.status || 'recorded',
      })),
      ...purchaseOrders.map(order => ({
        id: `po-${order.backendId || order.id}`,
        date: order.createdAt || order.date || '',
        module: 'Purchase Order',
        action: `PO ${order.status || 'created'}`,
        item: order.supplier || 'Supplier',
        quantity: `${order.items || order.orderItems?.length || 0} item(s)`,
        performedBy: order.createdBy || '',
        reference: order.id,
        details: order.rejectionNote || `Total: ${formatCurrency(order.total || 0)}`,
        status: order.status || 'recorded',
      })),
      ...transfers.map(transfer => ({
        id: `transfer-${transfer.backendId || transfer.id}`,
        date: transfer.completedDate || transfer.requestDate || '',
        module: 'Transfer',
        action: `Transfer ${transfer.status || 'requested'}`,
        item: transfer.item || 'Multiple items',
        quantity: transfer.quantity ? `${transfer.quantity} ${transfer.unit || ''}`.trim() : '',
        performedBy: transfer.requestedByEmail || transfer.requestedBy || '',
        reference: transfer.id,
        details: `${transfer.from || 'Source'} to ${transfer.to || 'Destination'}`,
        status: transfer.status || 'recorded',
      })),
      ...adjustments.map(adjustment => ({
        id: `adjustment-${adjustment.id}`,
        date: adjustment.date || '',
        module: 'Adjustment',
        action: adjustment.type || 'Correction',
        item: adjustment.item || 'Item',
        quantity: adjustment.quantity ? `${adjustment.quantity} ${adjustment.unit || ''}`.trim() : '',
        performedBy: adjustment.adjustedBy || '',
        reference: adjustment.id,
        details: adjustment.reason || adjustment.notes || '',
        status: 'recorded',
      })),
      ...wasteLogs.map(waste => ({
        id: `waste-${waste.id}`,
        date: waste.date || '',
        module: 'Waste',
        action: waste.wasteType || 'Waste Log',
        item: waste.item || 'Item',
        quantity: waste.quantity ? `${waste.quantity} ${waste.unit || ''}`.trim() : '',
        performedBy: waste.loggedBy || '',
        reference: waste.id,
        details: waste.notes || `Value: ${formatCurrency(waste.totalValue || 0)}`,
        status: 'recorded',
      })),
    ];

    return entries
      .filter(entry => entry.date || entry.reference)
      .sort((a, b) => {
        const aTime = new Date(a.date).getTime();
        const bTime = new Date(b.date).getTime();
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      });
  }, [inventoryMovements, posOrders, goodsReceived, purchaseOrders, transfers, adjustments, wasteLogs]);

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
      csv = 'Date,Supplier,Status,Total\n';
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
    } else if (activeTab === 'financial') {
      if (!isAdmin) return;
      csv = 'Metric,Value\n';
      csv += `Total Inventory Value,${financialData.totalInventoryValue.toFixed(2)}\n`;
      csv += `Total PO Spending,${financialData.totalPOSpending.toFixed(2)}\n`;
      csv += `Waste Loss,${financialData.wasteValue.toFixed(2)}\n`;
      csv += `Asset Health Score,${financialData.assetHealthScore.toFixed(1)}%\n`;
    } else if (activeTab === 'confidential') {
      if (!isAdmin) return;
      csv = 'CONFIDENTIAL\n\nUser List\nName,Email,Role,Status,Last Login\n';
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
    `px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
      activeTab === id
        ? danger
          ? 'text-red-600 border-red-600'
          : 'text-primary border-primary'
        : 'text-muted-foreground border-transparent hover:text-foreground'
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
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="bg-card border border-border rounded-xl px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="3months">Last 3 Months</option>
            <option value="year">This Year</option>
            <option value="all">All Time</option>
          </select>
          <button
            onClick={handleExport}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
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
          <button onClick={() => setActiveTab('financial')} className={tabCls('financial')}>Financial Report</button>
        )}
        {isAdmin && (
          <button onClick={() => setActiveTab('confidential')} className={tabCls('confidential', true)}>
            <Eye className="w-4 h-4" />
            Confidential
          </button>
        )}
      </div>

      {/* ── Overview ──────────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-foreground">System Overview</h3>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
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
            <div className="bg-card border border-border rounded-2xl p-6">
              <p className="text-muted-foreground text-xs mb-2">Total Events</p>
              <p className="text-2xl font-bold text-foreground">{visibleAuditTrail.length}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6">
              <p className="text-muted-foreground text-xs mb-2">Inventory Events</p>
              <p className="text-2xl font-bold text-primary">{auditSummary.byModule.Inventory || 0}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6">
              <p className="text-muted-foreground text-xs mb-2">Receiving Events</p>
              <p className="text-2xl font-bold text-green-700">{auditSummary.byModule['Goods Received'] || 0}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden">
              <p className="text-muted-foreground text-xs mb-2">Latest Activity</p>
              <p className="text-sm font-semibold text-foreground break-words">{auditSummary.latest}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-foreground">Recent Activity</h4>
              <p className="text-xs text-muted-foreground">{visibleAuditTrail.length} record{visibleAuditTrail.length !== 1 ? 's' : ''}</p>
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
                  {visibleAuditTrail.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No audit trail records found
                      </td>
                    </tr>
                  ) : (
                    visibleAuditTrail.slice(0, 100).map(entry => (
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

      {activeTab === 'financial' && !isAdmin && (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="bg-red-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Eye className="w-10 h-10 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Access Denied</h3>
          <p className="text-sm text-muted-foreground">
            You do not have permission to view financial reports.<br />
            This section is restricted to administrators only.
          </p>
        </div>
      )}

      {activeTab === 'financial' && isAdmin && (
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

      {/* ── Confidential (admin only) ──────────────────────────────────────────── */}
      {activeTab === 'confidential' && !isAdmin && (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="bg-red-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Eye className="w-10 h-10 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Access Denied</h3>
          <p className="text-sm text-muted-foreground">
            You do not have permission to view confidential reports.<br />
            This section is restricted to administrators only.
          </p>
        </div>
      )}

      {activeTab === 'confidential' && isAdmin && confidentialData && (
        <div>
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
                <p className="text-xs text-green-700 mb-1">Staff / Manager</p>
                <p className="text-2xl font-bold text-green-700">
                  {(confidentialData.byRole['staff'] || 0) + (confidentialData.byRole['manager'] || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* User Activity Log */}
          <div className="bg-card border border-border rounded-2xl p-6 mb-4">
            <h4 className="text-base font-semibold text-foreground mb-4">User Activity Log</h4>
            <div className="space-y-2">
              {users.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No user data available</p>
              ) : users.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${
                      u.role === 'admin' ? 'bg-red-600' : u.role === 'manager' ? 'bg-primary' : 'bg-secondary'
                    }`}>
                      {(u.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium capitalize ${statusPill(u.role)}`}>{u.role}</span>
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium capitalize ${statusPill(u.status)}`}>{u.status}</span>
                    <p className="text-xs text-muted-foreground w-28 text-right">{u.lastLogin || '—'}</p>
                  </div>
                </div>
              ))}
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
