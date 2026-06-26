import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getItemsSoldReport } from '../../app/api/client';
import { Plus, Edit2, Trash2, Search, ChevronRight, ChevronDown, Folder, FolderOpen, AlertTriangle, Package, PackagePlus, ShoppingCart, PackageCheck, Layers, X, Eye, TrendingUp, TrendingDown, RefreshCw, CheckCircle, Users, ClipboardList } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type {
  Adjustment,
  Bundle,
  InventoryItem,
  Location,
  ProductReceived,
  PurchaseOrder,
  Transfer,
  User,
} from '../../models/retail';
import { categorySubcategories, CHART_COLORS } from '../../app/utils/constants';
import { autoSortItem } from '../../app/utils/autoSortingRules';
import { useSession } from '../../app/hooks/useSession';
import { useRetailWorkspace, useRetailAuditLogsQuery } from '../lib/retail';

const formatAuditDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

export function ReportsView() {
  const { currentUser } = useSession();
  const {
    inventory,
    transfers,
    adjustments,
    purchaseOrders,
    productsReceived,
    locations,
    users,
  } = useRetailWorkspace({
    enabled: true,
    loadSharedData: true,
    loadUsers: currentUser?.role === 'Admin',
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'inventory' | 'sold' | 'transfers' | 'financial' | 'operations' | 'audit' | 'confidential'>('overview');
  const [auditModuleFilter, setAuditModuleFilter] = useState('all');
  const [soldFrom, setSoldFrom] = useState('');
  const [soldTo, setSoldTo] = useState('');
  const soldQuery = useQuery({
    queryKey: ['retail', 'items-sold', soldFrom || null, soldTo || null],
    queryFn: () => getItemsSoldReport({ module: 'RETAIL', from: soldFrom || undefined, to: soldTo || undefined }),
  });
  const sold = soldQuery.data;
  const [selectedLocation, setSelectedLocation] = useState<string>('all');

  const isAdmin = currentUser?.role === 'Admin';
  const hasFullAuditTrailAccess = currentUser?.role === 'Admin';

  // Overview Stats
  const overviewStats = useMemo(() => {
    const totalValue = inventory.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
    const avgPrice = totalItems > 0 ? totalValue / totalItems : 0;
    const totalTransfers = transfers.length;
    const completedTransfers = transfers.filter(t => t.status === 'Completed').length;
    const totalAdjustments = adjustments.length;
    const totalLocations = locations.length;

    return {
      totalValue,
      totalItems,
      avgPrice,
      totalTransfers,
      completedTransfers,
      totalAdjustments,
      totalLocations,
      uniqueItems: inventory.length
    };
  }, [inventory, transfers, adjustments, locations]);

  // Inventory Report Data
  const inventoryReportData = useMemo(() => {
    const categoryStats: { [key: string]: { quantity: number; value: number; items: number } } = {};
    inventory.forEach(item => {
      if (!categoryStats[item.category]) {
        categoryStats[item.category] = { quantity: 0, value: 0, items: 0 };
      }
      categoryStats[item.category].quantity += item.quantity;
      categoryStats[item.category].value += item.price * item.quantity;
      categoryStats[item.category].items += 1;
    });

    const conditionStats = { Excellent: 0, Good: 0, Fair: 0, Damaged: 0 };
    inventory.forEach(item => {
      conditionStats[item.condition] += item.quantity;
    });

    const locationStats: { [key: string]: { quantity: number; value: number; items: number } } = {};
    inventory.forEach(item => {
      if (!locationStats[item.location]) {
        locationStats[item.location] = { quantity: 0, value: 0, items: 0 };
      }
      locationStats[item.location].quantity += item.quantity;
      locationStats[item.location].value += item.price * item.quantity;
      locationStats[item.location].items += 1;
    });

    return { categoryStats, conditionStats, locationStats };
  }, [inventory]);

  // Transfer Report Data
  const transferReportData = useMemo(() => {
    const statusBreakdown = {
      Pending: transfers.filter(t => t.status === 'Pending').length,
      'In Transit': transfers.filter(t => t.status === 'In Transit').length,
      Completed: transfers.filter(t => t.status === 'Completed').length,
      Cancelled: transfers.filter(t => t.status === 'Cancelled').length
    };

    const routeStats: { [key: string]: number } = {};
    transfers.forEach(t => {
      const route = `${t.fromLocation} â†’ ${t.toLocation}`;
      routeStats[route] = (routeStats[route] || 0) + 1;
    });

    const totalItemsTransferred = transfers
      .filter(t => t.status === 'Completed')
      .reduce((sum, t) => sum + t.items.reduce((s, i) => s + i.quantity, 0), 0);

    return { statusBreakdown, routeStats, totalItemsTransferred };
  }, [transfers]);

  // Financial Report Data
  const financialReportData = useMemo(() => {
    const totalInventoryValue = inventory.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const poValue = purchaseOrders.reduce((sum, po) => sum + po.totalAmount, 0);
    const pendingPOValue = purchaseOrders
      .filter(po => po.status === 'Pending' || po.status === 'Approved')
      .reduce((sum, po) => sum + po.totalAmount, 0);

    const categoryValue: { [key: string]: number } = {};
    inventory.forEach(item => {
      categoryValue[item.category] = (categoryValue[item.category] || 0) + (item.price * item.quantity);
    });

    const damagedValue = inventory
      .filter(item => item.condition === 'Damaged')
      .reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return {
      totalInventoryValue,
      poValue,
      pendingPOValue,
      categoryValue,
      damagedValue
    };
  }, [inventory, purchaseOrders]);

  // Operations Report Data
  const operationsReportData = useMemo(() => {
    const adjustmentsByType: { [key: string]: number } = {};
    adjustments.forEach(adj => {
      adjustmentsByType[adj.type] = (adjustmentsByType[adj.type] || 0) + 1;
    });

    const approvedAdjustments = adjustments.filter(a => a.status === 'Approved').length;
    const pendingAdjustments = adjustments.filter(a => a.status === 'Pending').length;

    const receivedItems = productsReceived.reduce((sum, pr) =>
      sum + pr.items.reduce((s, i) => s + i.receivedQty, 0), 0
    );

    const lowStockItems = inventory.filter(item => item.quantity <= 3 && item.condition !== 'Damaged').length;

    return {
      adjustmentsByType,
      approvedAdjustments,
      pendingAdjustments,
      receivedItems,
      lowStockItems,
      totalReceipts: productsReceived.length
    };
  }, [adjustments, productsReceived, inventory]);

  // Confidential Report Data (Admin Only)
  const confidentialReportData = useMemo(() => {
    if (!isAdmin) return null;

    const userActivityLog = users.map(user => ({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLogin: user.lastLogin
    }));

    const systemAudit = {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.status === 'Active').length,
      inactiveUsers: users.filter(u => u.status === 'Inactive').length,
      adminUsers: users.filter(u => u.role === 'Admin').length,
      staffUsers: users.filter(u => u.role === 'Staff').length,
      // Retail has no distinct Manager role; kept for the confidential summary card
      // so it adds 0 instead of rendering NaN.
      managerUsers: 0
    };

    const financialSummary = {
      totalAssetValue: inventory.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      totalPurchaseValue: purchaseOrders.reduce((sum, po) => sum + po.totalAmount, 0),
      damagedLoss: inventory
        .filter(item => item.condition === 'Damaged')
        .reduce((sum, item) => sum + (item.price * item.quantity), 0),
      adjustmentImpact: adjustments
        .filter(a => a.status === 'Approved')
        .reduce((sum, adj) => {
          return sum + adj.items.reduce((s, i) => {
            const item = inventory.find(inv => inv.id === i.itemId);
            return s + (item ? item.price * Math.abs(i.quantityChange) : 0);
          }, 0);
        }, 0)
    };

    const criticalEvents = [
      ...adjustments
        .filter(a => a.type === 'Lost' || a.type === 'Damage')
        .map(a => ({
          type: 'Adjustment',
          description: `${a.type}: ${a.reason}`,
          date: a.date,
          createdBy: a.createdBy,
          status: a.status
        })),
      ...transfers
        .filter(t => t.status === 'Cancelled')
        .map(t => ({
          type: 'Transfer',
          description: `Cancelled Transfer: ${t.transferNumber}`,
          date: t.date,
          createdBy: t.createdBy,
          status: t.status
        }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      userActivityLog,
      systemAudit,
      financialSummary,
      criticalEvents
    };
  }, [isAdmin, users, inventory, purchaseOrders, adjustments, transfers]);

  // Real audit trail — one row per recorded activity (create / update / delete /
  // status change / receive / adjust) written by the backend audit log.
  const { data: auditTrail = [] } = useRetailAuditLogsQuery();

  const visibleAuditTrail = useMemo(() => {
    if (hasFullAuditTrailAccess) return auditTrail;
    const currentEmail = (currentUser?.email || '').trim().toLowerCase();
    if (!currentEmail) return [];
    return auditTrail.filter(entry =>
      (entry.performedBy || '').trim().toLowerCase() === currentEmail
    );
  }, [auditTrail, currentUser, hasFullAuditTrailAccess]);

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
  const auditCardClass = (active: boolean) =>
    `text-left w-full bg-white rounded-[14px] p-6 border shadow-sm cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 active:translate-y-0 active:shadow-md ${
      active ? 'border-secondary bg-secondary/5 shadow-md' : 'border-border'
    }`;

  const handleExportReport = (reportType: string) => {
    let csvContent = '';
    const timestamp = new Date().toISOString().split('T')[0];
    let filename = `${reportType}_Report_${timestamp}.csv`;

    switch (reportType) {
      case 'Overview':
        csvContent = 'Metric,Value\n';
        csvContent += `Total Inventory Value,₱${overviewStats.totalValue.toLocaleString()}\n`;
        csvContent += `Total Items,${overviewStats.totalItems}\n`;
        csvContent += `Average Price,₱${overviewStats.avgPrice.toFixed(2)}\n`;
        csvContent += `Total Transfers,${overviewStats.totalTransfers}\n`;
        csvContent += `Completed Transfers,${overviewStats.completedTransfers}\n`;
        csvContent += `Total Adjustments,${overviewStats.totalAdjustments}\n`;
        csvContent += `Total Locations,${overviewStats.totalLocations}\n`;
        csvContent += `Unique Items,${overviewStats.uniqueItems}\n`;
        break;

      case 'Inventory':
        csvContent = 'Category,Quantity,Value,Items\n';
        Object.entries(inventoryReportData.categoryStats).forEach(([category, stats]) => {
          csvContent += `${category},${stats.quantity},₱${stats.value.toLocaleString()},${stats.items}\n`;
        });
        csvContent += '\nCondition,Quantity\n';
        Object.entries(inventoryReportData.conditionStats).forEach(([condition, quantity]) => {
          csvContent += `${condition},${quantity}\n`;
        });
        csvContent += '\nLocation,Quantity,Value,Items\n';
        Object.entries(inventoryReportData.locationStats).forEach(([location, stats]) => {
          csvContent += `${location},${stats.quantity},₱${stats.value.toLocaleString()},${stats.items}\n`;
        });
        break;

      case 'Transfers':
        csvContent = 'Status,Count\n';
        Object.entries(transferReportData.statusBreakdown).forEach(([status, count]) => {
          csvContent += `${status},${count}\n`;
        });
        csvContent += '\nRoute,Transfers\n';
        Object.entries(transferReportData.routeStats)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .forEach(([route, count]) => {
            csvContent += `${route},${count}\n`;
          });
        csvContent += `\nTotal Items Transferred,${transferReportData.totalItemsTransferred}\n`;
        break;

      case 'Financial':
        csvContent = 'Metric,Value\n';
        csvContent += `Total Inventory Value,₱${financialReportData.totalInventoryValue.toLocaleString()}\n`;
        csvContent += `Total PO Investment,₱${financialReportData.poValue.toLocaleString()}\n`;
        csvContent += `Pending PO Value,₱${financialReportData.pendingPOValue.toLocaleString()}\n`;
        csvContent += `Loss from Damage,₱${financialReportData.damagedValue.toLocaleString()}\n`;
        csvContent += '\nCategory,Value\n';
        Object.entries(financialReportData.categoryValue).forEach(([category, value]) => {
          csvContent += `${category},₱${value.toLocaleString()}\n`;
        });
        break;

      case 'Operations':
        csvContent = 'Metric,Value\n';
        csvContent += `Total Receipts,${operationsReportData.totalReceipts}\n`;
        csvContent += `Items Received,${operationsReportData.receivedItems}\n`;
        csvContent += `Approved Adjustments,${operationsReportData.approvedAdjustments}\n`;
        csvContent += `Pending Adjustments,${operationsReportData.pendingAdjustments}\n`;
        csvContent += `Low Stock Items,${operationsReportData.lowStockItems}\n`;
        csvContent += '\nAdjustment Type,Count\n';
        Object.entries(operationsReportData.adjustmentsByType).forEach(([type, count]) => {
          csvContent += `${type},${count}\n`;
        });
        break;

      case 'Audit':
        csvContent = 'Date,Module,Action,Item,Quantity,Performed By,Reference,Details\n';
        visibleAuditTrail.forEach(entry => {
          csvContent += [
            formatAuditDate(entry.date),
            entry.module,
            entry.action,
            entry.item,
            entry.quantity,
            entry.performedBy,
            entry.reference,
            entry.details,
          ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
        });
        filename = `Audit_Trail_${timestamp}.csv`;
        break;

      case 'Confidential':
        if (!isAdmin || !confidentialReportData) {
          toast.error('Access denied. This report is restricted to administrators only.');
          return;
        }
        csvContent = 'CONFIDENTIAL REPORT - ADMIN ONLY\n\n';
        csvContent += 'System Audit Summary\n';
        csvContent += 'Metric,Value\n';
        csvContent += `Total Users,${confidentialReportData.systemAudit.totalUsers}\n`;
        csvContent += `Active Users,${confidentialReportData.systemAudit.activeUsers}\n`;
        csvContent += `Inactive Users,${confidentialReportData.systemAudit.inactiveUsers}\n`;
        csvContent += `Admin Users,${confidentialReportData.systemAudit.adminUsers}\n`;
        csvContent += `Staff Users,${confidentialReportData.systemAudit.staffUsers}\n`;
        csvContent += '\nFinancial Summary\n';
        csvContent += 'Metric,Value\n';
        csvContent += `Total Asset Value,₱${confidentialReportData.financialSummary.totalAssetValue.toLocaleString()}\n`;
        csvContent += `Total Purchase Value,₱${confidentialReportData.financialSummary.totalPurchaseValue.toLocaleString()}\n`;
        csvContent += `Damaged Loss,₱${confidentialReportData.financialSummary.damagedLoss.toLocaleString()}\n`;
        csvContent += `Adjustment Impact,₱${confidentialReportData.financialSummary.adjustmentImpact.toLocaleString()}\n`;
        csvContent += '\nUser Activity Log\n';
        csvContent += 'Name,Email,Role,Status,Last Login\n';
        confidentialReportData.userActivityLog.forEach(user => {
          csvContent += `${user.name},${user.email},${user.role},${user.status},${user.lastLogin}\n`;
        });
        csvContent += '\nCritical Events\n';
        csvContent += 'Type,Description,Date,Created By,Status\n';
        confidentialReportData.criticalEvents.slice(0, 20).forEach(event => {
          csvContent += `${event.type},"${event.description}",${event.date},${event.createdBy},${event.status}\n`;
        });
        break;

      default:
        toast.error('Unknown report type');
        return;
    }

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[30px] font-bold text-foreground">Reports & Analytics</h2>
          <p className="text-[14px] text-muted-foreground mt-1">Comprehensive system reports and insights</p>
        </div>
        <div className="flex gap-3">
          <label className="text-[12px] text-muted-foreground">
            From
            <input type="date" value={soldFrom} onChange={e => setSoldFrom(e.target.value)}
              className="block mt-1 bg-white border border-border rounded-[8px] px-3 py-2 text-[14px] text-foreground cursor-pointer hover:border-secondary/60 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary/40 focus:border-secondary transition-all duration-200" />
          </label>
          <label className="text-[12px] text-muted-foreground">
            To
            <input type="date" value={soldTo} onChange={e => setSoldTo(e.target.value)}
              className="block mt-1 bg-white border border-border rounded-[8px] px-3 py-2 text-[14px] text-foreground cursor-pointer hover:border-secondary/60 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary/40 focus:border-secondary transition-all duration-200" />
          </label>
          {(soldFrom || soldTo) && (
            <button onClick={() => { setSoldFrom(''); setSoldTo(''); }}
              className="self-end px-3 py-2 text-[14px] text-muted-foreground hover:text-foreground">Clear</button>
          )}
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="bg-white border border-border rounded-[8px] px-4 py-2 text-[14px] text-foreground cursor-pointer hover:border-secondary/60 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary/40 focus:border-secondary transition-all duration-200"
          >
            <option value="all">All Locations</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.name}>{loc.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-6 py-3 text-[14px] font-medium border-b-2 rounded-t-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 ${
            activeTab === 'overview'
              ? 'text-secondary border-secondary'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40 hover:border-border'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-6 py-3 text-[14px] font-medium border-b-2 rounded-t-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 ${
            activeTab === 'inventory'
              ? 'text-secondary border-secondary'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40 hover:border-border'
          }`}
        >
          Inventory Report
        </button>
        <button
          onClick={() => setActiveTab('sold')}
          className={`px-6 py-3 text-[14px] font-medium border-b-2 rounded-t-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 ${
            activeTab === 'sold'
              ? 'text-secondary border-secondary'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40 hover:border-border'
          }`}
        >
          Goods Sold
        </button>
        <button
          onClick={() => setActiveTab('transfers')}
          className={`px-6 py-3 text-[14px] font-medium border-b-2 rounded-t-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 ${
            activeTab === 'transfers'
              ? 'text-secondary border-secondary'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40 hover:border-border'
          }`}
        >
          Transfer Report
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('financial')}
            className={`px-6 py-3 text-[14px] font-medium border-b-2 rounded-t-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 ${
              activeTab === 'financial'
                ? 'text-secondary border-secondary'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40 hover:border-border'
            }`}
          >
            Financial Report
          </button>
        )}
        <button
          onClick={() => setActiveTab('operations')}
          className={`px-6 py-3 text-[14px] font-medium border-b-2 rounded-t-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 ${
            activeTab === 'operations'
              ? 'text-secondary border-secondary'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40 hover:border-border'
          }`}
        >
          Operations Report
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-6 py-3 text-[14px] font-medium border-b-2 rounded-t-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'text-secondary border-secondary'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40 hover:border-border'
          }`}
        >
          <ClipboardList className="size-4" />
          Audit Trail
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('confidential')}
            className={`px-6 py-3 text-[14px] font-medium border-b-2 rounded-t-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 flex items-center gap-2 ${
              activeTab === 'confidential'
                ? 'text-destructive border-destructive'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40 hover:border-border'
            }`}
          >
            <Eye className="size-4" />
            Confidential
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[20px] font-semibold text-foreground">System Overview</h3>
            <button
              onClick={() => handleExportReport('Overview')}
              className="bg-secondary text-white px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-secondary transition-colors"
            >
              Export Report
            </button>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Total Inventory Value</p>
              <p className="text-foreground text-[24px] font-bold">₱{overviewStats.totalValue.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Total Items</p>
              <p className="text-foreground text-[24px] font-bold">{overviewStats.totalItems.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Unique Items</p>
              <p className="text-foreground text-[24px] font-bold">{overviewStats.uniqueItems}</p>
            </div>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Active Locations</p>
              <p className="text-foreground text-[24px] font-bold">{overviewStats.totalLocations}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Total Transfers</p>
              <p className="text-foreground text-[24px] font-bold">{overviewStats.totalTransfers}</p>
              <p className="text-success text-[12px] mt-1">{overviewStats.completedTransfers} completed</p>
            </div>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Total Adjustments</p>
              <p className="text-foreground text-[24px] font-bold">{overviewStats.totalAdjustments}</p>
            </div>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Average Item Price</p>
              <p className="text-foreground text-[24px] font-bold">₱{Math.round(overviewStats.avgPrice)}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-border rounded-[14px] p-6">
              <h4 className="text-[16px] font-semibold text-foreground mb-4">Inventory by Category</h4>
              {Object.keys(inventoryReportData.categoryStats).length > 0 ? (
                <div className="flex items-center gap-4">
                  <PieChart width={200} height={200}>
                    <Pie
                      data={Object.entries(inventoryReportData.categoryStats).map(([name, data]) => ({ name, value: data.quantity }))}
                      cx={100}
                      cy={100}
                      labelLine={false}
                      label={false}
                      outerRadius={80}
                      dataKey="value"
                      key="inventory-category-pie"
                    >
                      {Object.keys(inventoryReportData.categoryStats).map((cat, index) => (
                        <Cell key={`inventory-category-cell-${cat}-${index}`} fill={['#007A5E', '#155DFC', '#FFA500', '#E7000B', '#8B5CF6', '#EC4899', '#10b981'][index % 7]} />
                      ))}
                    </Pie>
                    <Tooltip key="inventory-category-tooltip" />
                  </PieChart>
                  <div className="flex-1 space-y-2">
                    {Object.entries(inventoryReportData.categoryStats).map(([name, data], index) => {
                      const total = Object.values(inventoryReportData.categoryStats).reduce((sum: number, cat: any) => sum + cat.quantity, 0);
                      const percentage = total > 0 ? ((data.quantity / total) * 100).toFixed(1) : '0';
                      return (
                        <div key={`legend-${name}-${index}`} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="size-3 rounded-full"
                              style={{ backgroundColor: ['#007A5E', '#155DFC', '#FFA500', '#E7000B', '#8B5CF6', '#EC4899', '#10b981'][index % 7] }}
                            />
                            <span className="text-[13px] text-foreground">{name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] text-muted-foreground">{data.quantity}</span>
                            <span className="text-[13px] font-semibold text-foreground">{percentage}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground">No data available</div>
              )}
            </div>

            <div className="bg-white border border-border rounded-[14px] p-6">
              <h4 className="text-[16px] font-semibold text-foreground mb-4">Items by Condition</h4>
              <BarChart width={400} height={250} data={Object.entries(inventoryReportData.conditionStats).map(([name, value]) => ({ condition: name, count: value }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" key="inventory-condition-grid" />
                <XAxis dataKey="condition" stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} key="inventory-condition-xaxis" />
                <YAxis stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} key="inventory-condition-yaxis" />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }} key="inventory-condition-tooltip" />
                <Bar dataKey="count" fill="var(--secondary)" radius={[8, 8, 0, 0]} key="inventory-condition-bar" />
              </BarChart>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[20px] font-semibold text-foreground">Detailed Inventory Report</h3>
            <button
              onClick={() => handleExportReport('Inventory')}
              className="bg-secondary text-white px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-secondary transition-colors"
            >
              Export Report
            </button>
          </div>

          {/* Category Breakdown */}
          <div className="bg-white border border-border rounded-[14px] p-6 mb-4">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">Inventory by Category</h4>
            <div className="space-y-3">
              {Object.entries(inventoryReportData.categoryStats)
                .sort((a, b) => b[1].value - a[1].value)
                .map(([category, data]) => (
                  <div key={category} className="flex items-center justify-between p-3 bg-muted rounded-[8px]">
                    <div className="flex-1">
                      <p className="text-[14px] font-medium text-foreground">{category}</p>
                      <div className="flex gap-4 mt-1">
                        <span className="text-[12px] text-muted-foreground">{data.quantity} items</span>
                        <span className="text-[12px] text-muted-foreground">•</span>
                        <span className="text-[12px] text-muted-foreground">{data.items} unique products</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[16px] font-bold text-secondary">₱{data.value.toLocaleString()}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {overviewStats.totalValue > 0 ? ((data.value / overviewStats.totalValue) * 100).toFixed(1) : '0'}% of total
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Location Breakdown */}
          <div className="bg-white border border-border rounded-[14px] p-6 mb-4">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">Inventory by Location</h4>
            <div className="space-y-3">
              {Object.entries(inventoryReportData.locationStats)
                .sort((a, b) => b[1].value - a[1].value)
                .map(([location, data]) => (
                  <div key={location} className="flex items-center justify-between p-3 bg-muted rounded-[8px]">
                    <div className="flex-1">
                      <p className="text-[14px] font-medium text-foreground">{location}</p>
                      <div className="flex gap-4 mt-1">
                        <span className="text-[12px] text-muted-foreground">{data.quantity} items</span>
                        <span className="text-[12px] text-muted-foreground">•</span>
                        <span className="text-[12px] text-muted-foreground">{data.items} unique products</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[16px] font-bold text-secondary">₱{data.value.toLocaleString()}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {overviewStats.totalValue > 0 ? ((data.value / overviewStats.totalValue) * 100).toFixed(1) : '0'}% of total
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Condition Analysis */}
          <div className="bg-white border border-border rounded-[14px] p-6">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">Stock Condition Analysis</h4>
            <div className="grid grid-cols-4 gap-4">
              {Object.entries(inventoryReportData.conditionStats).map(([condition, count]) => (
                <div key={condition} className="p-4 bg-muted rounded-[8px]">
                  <p className="text-[12px] text-muted-foreground mb-1">{condition}</p>
                  <p className="text-[20px] font-bold text-foreground">{count}</p>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    {overviewStats.totalItems > 0 ? ((count / overviewStats.totalItems) * 100).toFixed(1) : '0'}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sold' && (
        <div>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
            <div>
              <h3 className="text-[20px] font-semibold text-foreground">Goods Sold</h3>
              <p className="text-[14px] text-muted-foreground">
                Units sold and revenue per item from completed sales{sold?.from || sold?.to ? '' : ' (last 30 days)'}. Voided/refunded sales are excluded.
              </p>
            </div>
            <div className="flex items-end gap-3">
              <label className="text-[12px] text-muted-foreground">
                From
                <input type="date" value={soldFrom} onChange={e => setSoldFrom(e.target.value)}
                  className="block mt-1 px-3 py-2 border border-border rounded-[8px] text-[14px] bg-background" />
              </label>
              <label className="text-[12px] text-muted-foreground">
                To
                <input type="date" value={soldTo} onChange={e => setSoldTo(e.target.value)}
                  className="block mt-1 px-3 py-2 border border-border rounded-[8px] text-[14px] bg-background" />
              </label>
              {(soldFrom || soldTo) && (
                <button onClick={() => { setSoldFrom(''); setSoldTo(''); }}
                  className="px-3 py-2 text-[14px] text-muted-foreground hover:text-foreground">Clear</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-card border border-border rounded-[12px] p-4">
              <p className="text-[12px] text-muted-foreground">Distinct items sold</p>
              <p className="text-[24px] font-semibold text-foreground">{sold?.totalItems ?? 0}</p>
            </div>
            <div className="bg-card border border-border rounded-[12px] p-4">
              <p className="text-[12px] text-muted-foreground">Total units sold</p>
              <p className="text-[24px] font-semibold text-foreground">{(sold?.totalUnitsSold ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-card border border-border rounded-[12px] p-4">
              <p className="text-[12px] text-muted-foreground">Total revenue</p>
              <p className="text-[24px] font-semibold text-foreground">₱{(sold?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-[12px] overflow-hidden">
            <table className="w-full text-[14px]">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Item</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-right px-4 py-3 font-medium">Units sold</th>
                  <th className="text-right px-4 py-3 font-medium">Revenue</th>
                  <th className="text-right px-4 py-3 font-medium">Sales</th>
                  <th className="text-right px-4 py-3 font-medium">Current stock</th>
                  <th className="text-left px-4 py-3 font-medium">Last sold</th>
                </tr>
              </thead>
              <tbody>
                {soldQuery.isLoading && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!soldQuery.isLoading && (sold?.items?.length ?? 0) === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No goods sold in this period.</td></tr>
                )}
                {sold?.items?.map(r => (
                  <tr key={r.itemId ?? r.name} className="border-t border-border">
                    <td className="px-4 py-3 text-foreground">{r.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.category ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-foreground font-medium">{r.unitsSold.toLocaleString()} {r.unit ?? ''}</td>
                    <td className="px-4 py-3 text-right text-foreground">₱{r.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.salesCount}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.currentStock ?? '—'} {r.unit ?? ''}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatAuditDate(r.lastSoldAt ?? undefined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'transfers' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[20px] font-semibold text-foreground">Transfer Activity Report</h3>
            <button
              onClick={() => handleExportReport('Transfers')}
              className="bg-secondary text-white px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-secondary transition-colors"
            >
              Export Report
            </button>
          </div>

          {/* Transfer Stats */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            {Object.entries(transferReportData.statusBreakdown).map(([status, count]) => (
              <div key={status} className="bg-white border border-border rounded-[14px] p-6">
                <p className="text-muted-foreground text-[12px] mb-2">{status}</p>
                <p className="text-foreground text-[24px] font-bold">{count}</p>
                <p className="text-muted-foreground text-[12px] mt-1">
                  {overviewStats.totalTransfers > 0 ? ((count / overviewStats.totalTransfers) * 100).toFixed(0) : '0'}%
                </p>
              </div>
            ))}
          </div>

          {/* Route Analysis */}
          <div className="bg-white border border-border rounded-[14px] p-6 mb-4">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">Transfer Routes Analysis</h4>
            <div className="space-y-3">
              {Object.entries(transferReportData.routeStats)
                .sort((a, b) => b[1] - a[1])
                .map(([route, count]) => (
                  <div key={route} className="flex items-center justify-between p-3 bg-muted rounded-[8px]">
                    <p className="text-[14px] font-medium text-foreground">{route}</p>
                    <div className="text-right">
                      <p className="text-[16px] font-bold text-secondary">{count} transfers</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Transfer Summary */}
          <div className="bg-white border border-border rounded-[14px] p-6">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">Transfer Summary</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-secondary/10 rounded-[8px]">
                <p className="text-[12px] text-secondary mb-1">Total Items Transferred</p>
                <p className="text-[24px] font-bold text-secondary">{transferReportData.totalItemsTransferred}</p>
              </div>
              <div className="p-4 bg-secondary/10 rounded-[8px]">
                <p className="text-[12px] text-secondary mb-1">Completion Rate</p>
                <p className="text-[24px] font-bold text-secondary">
                  {overviewStats.totalTransfers > 0
                    ? ((overviewStats.completedTransfers / overviewStats.totalTransfers) * 100).toFixed(0)
                    : 0}%
                </p>
              </div>
              <div className="p-4 bg-warning/10 rounded-[8px]">
                <p className="text-[12px] text-warning mb-1">Active Routes</p>
                <p className="text-[24px] font-bold text-warning">{Object.keys(transferReportData.routeStats).length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'financial' && !isAdmin && (
        <div className="bg-white border border-border rounded-[14px] p-12 text-center">
          <div className="bg-destructive/10 size-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Eye className="size-10 text-destructive" />
          </div>
          <h3 className="text-[20px] font-bold text-foreground mb-2">Access Denied</h3>
          <p className="text-[14px] text-muted-foreground">
            You do not have permission to view financial reports.<br />
            This section is restricted to administrators only.
          </p>
        </div>
      )}

      {activeTab === 'financial' && isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[20px] font-semibold text-foreground">Financial Report</h3>
            <button
              onClick={() => handleExportReport('Financial')}
              className="bg-secondary text-white px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-secondary transition-colors"
            >
              Export Report
            </button>
          </div>

          {/* Financial Overview */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Total Asset Value</p>
              <p className="text-foreground text-[24px] font-bold">₱{financialReportData.totalInventoryValue.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Purchase Orders Value</p>
              <p className="text-foreground text-[24px] font-bold">₱{financialReportData.poValue.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Pending PO Value</p>
              <p className="text-warning text-[24px] font-bold">₱{financialReportData.pendingPOValue.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Damaged Stock Value</p>
              <p className="text-destructive text-[24px] font-bold">₱{financialReportData.damagedValue.toLocaleString()}</p>
            </div>
          </div>

          {/* Value by Category */}
          <div className="bg-white border border-border rounded-[14px] p-6 mb-4">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">Value by Category</h4>
            <div className="space-y-3">
              {Object.entries(financialReportData.categoryValue)
                .sort((a, b) => b[1] - a[1])
                .map(([category, value]) => (
                  <div key={category}>
                    <div className="flex justify-between text-[14px] mb-1">
                      <span className="text-foreground font-medium">{category}</span>
                      <span className="text-secondary font-bold">₱{value.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-secondary rounded-full"
                        style={{ width: `${financialReportData.totalInventoryValue > 0 ? (value / financialReportData.totalInventoryValue) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Financial Charts */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-border rounded-[14px] p-6">
              <h4 className="text-[16px] font-semibold text-foreground mb-4">Value Distribution</h4>
              {Object.keys(financialReportData.categoryValue).length > 0 ? (
                <PieChart width={400} height={250}>
                  <Pie
                    data={Object.entries(financialReportData.categoryValue).map(([name, value]) => ({ name, value }))}
                    cx={200}
                    cy={125}
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${!isNaN(percent) ? (percent * 100).toFixed(0) : '0'}%`}
                    outerRadius={80}
                    dataKey="value"
                    key="financial-category-pie"
                  >
                    {Object.keys(financialReportData.categoryValue).map((cat, index) => (
                      <Cell key={`financial-category-cell-${cat}-${index}`} fill={['#007A5E', '#155DFC', '#FFA500', '#E7000B', '#8B5CF6', '#EC4899', '#10b981'][index % 7]} />
                    ))}
                  </Pie>
                  <Tooltip key="financial-category-tooltip" />
                </PieChart>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground">No data available</div>
              )}
            </div>

            <div className="bg-white border border-border rounded-[14px] p-6">
              <h4 className="text-[16px] font-semibold text-foreground mb-4">Financial Health Indicators</h4>
              <div className="space-y-4">
                <div className="p-4 bg-secondary/10 rounded-[8px]">
                  <p className="text-[12px] text-secondary mb-1">Asset Health Score</p>
                  <p className="text-[24px] font-bold text-secondary">
                    {financialReportData.totalInventoryValue > 0
                      ? (((financialReportData.totalInventoryValue - financialReportData.damagedValue) / financialReportData.totalInventoryValue) * 100).toFixed(1)
                      : '0'}%
                  </p>
                </div>
                <div className="p-4 bg-secondary/10 rounded-[8px]">
                  <p className="text-[12px] text-secondary mb-1">Investment Return Potential</p>
                  <p className="text-[24px] font-bold text-secondary">
                    {financialReportData.poValue > 0
                      ? ((financialReportData.totalInventoryValue / financialReportData.poValue) * 100).toFixed(0)
                      : 0}%
                  </p>
                </div>
                <div className="p-4 bg-destructive/10 rounded-[8px]">
                  <p className="text-[12px] text-destructive mb-1">Loss from Damage</p>
                  <p className="text-[24px] font-bold text-destructive">
                    ₱{financialReportData.damagedValue.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'operations' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[20px] font-semibold text-foreground">Operations Report</h3>
            <button
              onClick={() => handleExportReport('Operations')}
              className="bg-secondary text-white px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-secondary transition-colors"
            >
              Export Report
            </button>
          </div>

          {/* Operations Overview */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Total Receipts</p>
              <p className="text-foreground text-[24px] font-bold">{operationsReportData.totalReceipts}</p>
            </div>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Items Received</p>
              <p className="text-foreground text-[24px] font-bold">{operationsReportData.receivedItems}</p>
            </div>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Approved Adjustments</p>
              <p className="text-success text-[24px] font-bold">{operationsReportData.approvedAdjustments}</p>
            </div>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Low Stock Alerts</p>
              <p className="text-destructive text-[24px] font-bold">{operationsReportData.lowStockItems}</p>
            </div>
          </div>

          {/* Adjustment Analysis */}
          <div className="bg-white border border-border rounded-[14px] p-6 mb-4">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">Adjustments by Type</h4>
            <div className="space-y-3">
              {Object.entries(operationsReportData.adjustmentsByType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between p-3 bg-muted rounded-[8px]">
                    <div>
                      <p className="text-[14px] font-medium text-foreground">{type}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {overviewStats.totalAdjustments > 0
                          ? ((count / overviewStats.totalAdjustments) * 100).toFixed(0)
                          : 0}% of total
                      </p>
                    </div>
                    <p className="text-[18px] font-bold text-secondary">{count}</p>
                  </div>
                ))}
            </div>
          </div>

          {/* Operational Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-border rounded-[14px] p-6">
              <h4 className="text-[16px] font-semibold text-foreground mb-4">Adjustment Status</h4>
              <BarChart
                width={400}
                height={250}
                data={[
                  { status: 'Approved', count: operationsReportData.approvedAdjustments },
                  { status: 'Pending', count: operationsReportData.pendingAdjustments },
                  { status: 'Total', count: overviewStats.totalAdjustments }
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" key="adjustment-status-grid" />
                <XAxis dataKey="status" stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} key="adjustment-status-xaxis" />
                <YAxis stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} key="adjustment-status-yaxis" />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }} key="adjustment-status-tooltip" />
                <Bar dataKey="count" fill="var(--secondary)" radius={[8, 8, 0, 0]} key="adjustment-status-bar" />
              </BarChart>
            </div>

            <div className="bg-white border border-border rounded-[14px] p-6">
              <h4 className="text-[16px] font-semibold text-foreground mb-4">Stock Health</h4>
              <div className="space-y-4 mt-6">
                <div className="p-4 bg-secondary/10 rounded-[8px]">
                  <p className="text-[12px] text-secondary mb-1">Healthy Stock Items</p>
                  <p className="text-[24px] font-bold text-secondary">
                    {overviewStats.totalItems - operationsReportData.lowStockItems}
                  </p>
                </div>
                <div className="p-4 bg-destructive/10 rounded-[8px]">
                  <p className="text-[12px] text-destructive mb-1">Low Stock Items</p>
                  <p className="text-[24px] font-bold text-destructive">{operationsReportData.lowStockItems}</p>
                </div>
                <div className="p-4 bg-warning/10 rounded-[8px]">
                  <p className="text-[12px] text-warning mb-1">Pending Adjustments</p>
                  <p className="text-[24px] font-bold text-warning">{operationsReportData.pendingAdjustments}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[20px] font-semibold text-foreground">Audit Trail</h3>
            <div className="flex items-center gap-3">
              <span className="bg-muted border border-border px-3 py-1 rounded-[6px] text-[12px] text-muted-foreground">
                {hasFullAuditTrailAccess ? 'Full operation view' : 'Your activity only'}
              </span>
              <button
                onClick={() => handleExportReport('Audit')}
                className="bg-secondary text-white px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-secondary transition-colors"
              >
                Export Report
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4">
            <button type="button" onClick={() => toggleAuditModule('all')} aria-pressed={auditModuleFilter === 'all'} aria-label="Show all audit events" className={auditCardClass(auditModuleFilter === 'all')}>
              <p className="text-muted-foreground text-[12px] mb-2">Total Events</p>
              <p className="text-foreground text-[24px] font-bold">{visibleAuditTrail.length}</p>
            </button>
            <button type="button" onClick={() => toggleAuditModule('Purchase Order')} aria-pressed={auditModuleFilter === 'Purchase Order'} aria-label="Filter by purchase order events" className={auditCardClass(auditModuleFilter === 'Purchase Order')}>
              <p className="text-muted-foreground text-[12px] mb-2">Purchase Orders</p>
              <p className="text-secondary text-[24px] font-bold">{auditSummary.byModule['Purchase Order'] || 0}</p>
            </button>
            <button type="button" onClick={() => toggleAuditModule('Goods Received')} aria-pressed={auditModuleFilter === 'Goods Received'} aria-label="Filter by goods received events" className={auditCardClass(auditModuleFilter === 'Goods Received')}>
              <p className="text-muted-foreground text-[12px] mb-2">Goods Received</p>
              <p className="text-success text-[24px] font-bold">{auditSummary.byModule['Goods Received'] || 0}</p>
            </button>
            <div className="bg-white border border-border rounded-[14px] p-6">
              <p className="text-muted-foreground text-[12px] mb-2">Latest Activity</p>
              <p className="text-[12px] font-semibold text-foreground break-words">{auditSummary.latest}</p>
            </div>
          </div>

          <div className="bg-white border border-border rounded-[14px] p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[16px] font-semibold text-foreground">Recent Activity</h4>
              <p className="text-[12px] text-muted-foreground">
                {auditModuleFilter === 'all' ? '' : `${auditModuleFilter} • `}
                {filteredAuditTrail.length} record{filteredAuditTrail.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Module</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Action</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Item</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Qty</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">By</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Reference</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredAuditTrail.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-[14px] text-muted-foreground">
                        No audit trail records found
                      </td>
                    </tr>
                  ) : (
                    filteredAuditTrail.slice(0, 100).map(entry => (
                      <tr key={entry.id} className="hover:bg-muted transition-colors">
                        <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{formatAuditDate(entry.date)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-[6px] text-[11px] font-medium ${
                            entry.module === 'Purchase Order' ? 'bg-secondary/10 text-secondary' :
                            entry.module === 'Transfer' ? 'bg-warning/10 text-warning' :
                            entry.module === 'Adjustment' ? 'bg-destructive/10 text-destructive' :
                            'bg-secondary/10 text-secondary'
                          }`}>
                            {entry.module}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[13px] font-medium text-foreground capitalize">{entry.action.toLowerCase()}</td>
                        <td className="px-4 py-3 text-[13px] text-foreground">{entry.item}</td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground whitespace-nowrap">{entry.quantity || '-'}</td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">{entry.performedBy || 'System'}</td>
                        <td className="px-4 py-3 text-[12px] text-secondary font-medium whitespace-nowrap">{entry.reference}</td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground max-w-[260px] truncate">{entry.details || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'confidential' && isAdmin && confidentialReportData && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-destructive text-white px-3 py-1 rounded-[6px] text-[12px] font-bold flex items-center gap-2">
              <Eye className="size-4" />
              CONFIDENTIAL - ADMIN ONLY
            </div>
            <div className="flex-1" />
            <button
              onClick={() => handleExportReport('Confidential')}
              className="bg-destructive text-white px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-destructive transition-colors"
            >
              Export Confidential Report
            </button>
          </div>

          <div className="bg-destructive/10 border-2 border-destructive rounded-[14px] p-4 mb-6">
            <p className="text-[14px] text-destructive font-semibold">âš ï¸ Warning</p>
            <p className="text-[12px] text-foreground mt-1">
              This report contains sensitive financial and operational data. Access is restricted to administrators only.
              Do not share this information with unauthorized personnel.
            </p>
          </div>

          {/* System Audit */}
          <div className="bg-white border border-border rounded-[14px] p-6 mb-4">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">System Audit Summary</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-muted rounded-[8px]">
                <p className="text-[12px] text-muted-foreground mb-1">Total Users</p>
                <p className="text-[24px] font-bold text-foreground">{confidentialReportData.systemAudit.totalUsers}</p>
                <div className="flex gap-2 mt-2">
                  <span className="text-[11px] text-success">
                    Active: {confidentialReportData.systemAudit.activeUsers}
                  </span>
                  <span className="text-[11px] text-destructive">
                    Inactive: {confidentialReportData.systemAudit.inactiveUsers}
                  </span>
                </div>
              </div>
              <div className="p-4 bg-secondary/10 rounded-[8px]">
                <p className="text-[12px] text-secondary mb-1">Admin Users</p>
                <p className="text-[24px] font-bold text-secondary">{confidentialReportData.systemAudit.adminUsers}</p>
              </div>
              <div className="p-4 bg-secondary/10 rounded-[8px]">
                <p className="text-[12px] text-secondary mb-1">Staff Users</p>
                <p className="text-[24px] font-bold text-secondary">
                  {confidentialReportData.systemAudit.staffUsers + confidentialReportData.systemAudit.managerUsers}
                </p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-white border border-border rounded-[14px] p-6 mb-4">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">Confidential Financial Summary</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-secondary/10 rounded-[8px]">
                <p className="text-[12px] text-secondary mb-1">Total Asset Value</p>
                <p className="text-[28px] font-bold text-secondary">
                  ₱{confidentialReportData.financialSummary.totalAssetValue.toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">Current inventory valuation</p>
              </div>
              <div className="p-4 bg-warning/10 rounded-[8px]">
                <p className="text-[12px] text-warning mb-1">Total Purchase Investment</p>
                <p className="text-[28px] font-bold text-warning">
                  ₱{confidentialReportData.financialSummary.totalPurchaseValue.toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">All purchase orders</p>
              </div>
              <div className="p-4 bg-destructive/10 rounded-[8px]">
                <p className="text-[12px] text-destructive mb-1">Loss from Damaged Stock</p>
                <p className="text-[28px] font-bold text-destructive">
                  ₱{confidentialReportData.financialSummary.damagedLoss.toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">Non-recoverable items</p>
              </div>
              <div className="p-4 bg-secondary/10 rounded-[8px]">
                <p className="text-[12px] text-secondary mb-1">Adjustment Impact Value</p>
                <p className="text-[28px] font-bold text-secondary">
                  ₱{confidentialReportData.financialSummary.adjustmentImpact.toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">Approved adjustments</p>
              </div>
            </div>
          </div>

          {/* User Activity Log */}
          <div className="bg-white border border-border rounded-[14px] p-6 mb-4">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">User Activity Log</h4>
            <div className="space-y-2">
              {confidentialReportData.userActivityLog.map(user => (
                <div key={user.email} className="flex items-center justify-between p-3 bg-muted rounded-[8px]">
                  <div className="flex items-center gap-4">
                    <div className={`size-8 rounded-full flex items-center justify-center text-white text-[14px] font-bold ${
                      user.role === 'Admin' ? 'bg-destructive' : 'bg-secondary'
                    }`}>
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-foreground">{user.name}</p>
                      <p className="text-[12px] text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-[6px] text-[12px] font-medium ${
                      user.role === 'Admin' ? 'bg-destructive/10 text-destructive' : 'bg-secondary/10 text-secondary'
                    }`}>
                      {user.role}
                    </span>
                    <span className={`px-3 py-1 rounded-[6px] text-[12px] font-medium ${
                      user.status === 'Active' ? 'bg-secondary/10 text-success' : 'bg-muted text-muted-foreground'
                    }`}>
                      {user.status}
                    </span>
                    <p className="text-[12px] text-muted-foreground w-32 text-right">{user.lastLogin}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Critical Events */}
          <div className="bg-white border border-border rounded-[14px] p-6 mb-4">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">Critical Events & Incidents</h4>
            <div className="space-y-2">
              {confidentialReportData.criticalEvents.length === 0 ? (
                <p className="text-[14px] text-muted-foreground text-center py-4">No critical events recorded</p>
              ) : (
                confidentialReportData.criticalEvents.slice(0, 10).map((event, index) => (
                  <div key={index} className="flex items-start justify-between p-3 bg-destructive/10 rounded-[8px] border border-destructive">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-destructive text-white px-2 py-1 rounded text-[11px] font-bold">
                          {event.type}
                        </span>
                        <p className="text-[14px] font-medium text-foreground">{event.description}</p>
                      </div>
                      <p className="text-[12px] text-muted-foreground">Created by: {event.createdBy}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] text-foreground">{event.date}</p>
                      <span className={`text-[11px] font-medium ${
                        event.status === 'Approved' ? 'text-success' :
                        event.status === 'Pending' ? 'text-warning' :
                        'text-destructive'
                      }`}>
                        {event.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Purchase Orders History */}
          <div className="bg-white border border-border rounded-[14px] p-6 mb-4">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">Purchase Orders History</h4>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">PO ID</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Supplier</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Created By</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Total Amount</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {purchaseOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center">
                        <p className="text-[14px] text-muted-foreground">No purchase orders found</p>
                      </td>
                    </tr>
                  ) : (
                    purchaseOrders.map(po => (
                      <tr key={po.id} className="hover:bg-muted transition-colors">
                        <td className="px-4 py-3 text-[13px] text-foreground font-medium">{po.id}</td>
                        <td className="px-4 py-3 text-[13px] text-foreground">{po.supplier}</td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">{po.createdBy || 'Admin User'}</td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">{po.date}</td>
                        <td className="px-4 py-3 text-[13px] text-foreground font-medium">₱{po.totalAmount.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 text-[11px] font-medium rounded-full ${
                            po.status === 'Approved' ? 'bg-success/15 text-success' :
                            po.status === 'Pending' ? 'bg-warning/15 text-warning' :
                            po.status === 'Rejected' ? 'bg-destructive/10 text-destructive' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {po.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">{po.items.length} items</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Products Received History */}
          <div className="bg-white border border-border rounded-[14px] p-6">
            <h4 className="text-[16px] font-semibold text-foreground mb-4">Products Received History</h4>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Receipt ID</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">PO ID</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Received Date</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Received By</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Total Items</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Accepted</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Rejected</th>
                    <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {productsReceived.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center">
                        <p className="text-[14px] text-muted-foreground">No products received found</p>
                      </td>
                    </tr>
                  ) : (
                    productsReceived.map(pr => (
                      <tr key={pr.id} className="hover:bg-muted transition-colors">
                        <td className="px-4 py-3 text-[13px] text-foreground font-medium">{pr.id}</td>
                        <td className="px-4 py-3 text-[13px] text-secondary font-medium">{pr.poNumber}</td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">{pr.dateReceived}</td>
                        <td className="px-4 py-3 text-[13px] text-foreground">{pr.receivedBy}</td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">
                          {pr.items.reduce((sum, item) => sum + item.receivedQty, 0)}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-success font-medium">
                          {pr.items.reduce((sum, item) => sum + (item.acceptedQty || item.receivedQty), 0)}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-destructive font-medium">
                          {pr.items.reduce((sum, item) => sum + (item.rejectedQty || 0), 0)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 text-[11px] font-medium rounded-full ${
                            pr.status === 'Fully Accepted' ? 'bg-success/15 text-success' :
                            'bg-warning/15 text-warning'
                          }`}>
                            {pr.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'confidential' && !isAdmin && (
        <div className="bg-white border border-border rounded-[14px] p-12 text-center">
          <div className="bg-destructive/10 size-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Eye className="size-10 text-destructive" />
          </div>
          <h3 className="text-[20px] font-bold text-foreground mb-2">Access Denied</h3>
          <p className="text-[14px] text-muted-foreground">
            You do not have permission to view confidential reports.<br />
            This section is restricted to administrators only.
          </p>
        </div>
      )}
    </div>
  );
}

// Purchase Orders View

