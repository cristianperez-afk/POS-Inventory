import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Search, ChevronRight, ChevronDown, Folder, FolderOpen, AlertTriangle, Package, PackagePlus, ShoppingCart, PackageCheck, Layers, X, Eye, TrendingUp, TrendingDown, RefreshCw, CheckCircle, Users } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type {
  InventoryItem,
  PurchaseOrder,
  ProductReceived,
  Bundle,
  Transfer,
  Adjustment,
  Location,
  User,
} from '../../app/utils/generateSampleData';
import { categorySubcategories, CHART_COLORS } from '../../app/utils/constants';
import { autoSortItem } from '../../app/utils/autoSortingRules';
import { useRetailWorkspace } from '../lib/retail';


export interface StockAlert {
  id: string;
  itemName: string;
  currentStock: number;
  threshold: number;
  severity: 'low' | 'critical';
}

export function DashboardView() {
  const {
    stats,
    stockAlerts,
    inventory,
    purchaseOrders,
    productsReceived,
  } = useRetailWorkspace({
    enabled: true,
    loadSharedData: true,
    loadUsers: false,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // Calculate additional stats
  const totalValue = inventory.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const pendingPOs = purchaseOrders.filter(po => po.status === 'Pending' || po.status === 'Approved').length;
  const recentReceipts = productsReceived.slice(-5);

  const handleRefresh = () => {
    setIsRefreshing(true);

    // Simulate data refresh with animation
    setTimeout(() => {
      setLastRefreshed(new Date());
      setIsRefreshing(false);
    }, 1000);
  };

  // Category breakdown for pie chart
  const categoryData = useMemo(() => {
    const categoryMap = new Map<string, number>();
    inventory.forEach(item => {
      const count = categoryMap.get(item.category) || 0;
      categoryMap.set(item.category, count + item.quantity);
    });
    return Array.from(categoryMap.entries()).map(([name, value], index) => ({
      id: `${name}-${index}`,
      name,
      value
    }));
  }, [inventory]);

  // Stock trend by month (simulated)
  const stockTrendData = useMemo(() => {
    return [
      { month: 'Jan', stock: 320 },
      { month: 'Feb', stock: 380 },
      { month: 'Mar', stock: 420 },
      { month: 'Apr', stock: 460 },
      { month: 'May', stock: stats.totalItems - 20 },
      { month: 'Jun', stock: stats.totalItems }
    ];
  }, [stats.totalItems]);

  // Condition breakdown for bar chart
  const conditionData = useMemo(() => {
    const conditionMap = { Excellent: 0, Good: 0, Fair: 0, Damaged: 0 };
    inventory.forEach(item => {
      conditionMap[item.condition] += item.quantity;
    });
    return Object.entries(conditionMap).map(([condition, count]) => ({ condition, count }));
  }, [inventory]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[30px] font-bold text-foreground leading-[36px]">Dashboard</h2>
          <p className="text-[14px] text-muted-foreground mt-1">
            Overview of your inventory system
            {!isRefreshing && (
              <span className="ml-2 text-[12px] text-muted-foreground">
                • Last updated: {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-white border border-border text-foreground px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Items"
          value={stats.totalItems}
          subtitle="All units across locations"
          color="#ffedd4"
          iconColor="#F54900"
          icon={<Package className="size-6" />}
        />
        <StatCard
          title="Available Stock"
          value={stats.availableStock}
          subtitle="Non-damaged units"
          color="#fef3c6"
          iconColor="#FFA500"
          icon={<Package className="size-6" />}
        />
        <StatCard
          title="Total Value"
          value={`₱${(totalValue / 1000).toFixed(1)}K`}
          subtitle="Inventory worth"
          color="#E0F5F1"
          iconColor="#008967"
          icon={<TrendingUp className="size-6" />}
        />
        <StatCard
          title="Low Stock Alerts"
          value={stockAlerts.length}
          subtitle="Requires attention"
          color="#ffe2e2"
          iconColor="#E7000B"
          isWarning
          icon={<AlertTriangle className="size-6" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Stock Trend Chart */}
        <div className="bg-white border border-border rounded-[14px] p-6">
          <h3 className="text-[18px] font-semibold text-foreground mb-4">Stock Trend (2026)</h3>
          <LineChart width={400} height={250} data={stockTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" key="grid-trend" />
            <XAxis dataKey="month" stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} key="xaxis-trend" />
            <YAxis stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} key="yaxis-trend" />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}
              labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
              key="tooltip-trend"
            />
            <Line type="monotone" dataKey="stock" stroke="var(--secondary)" strokeWidth={2} dot={{ fill: 'var(--secondary)', r: 4 }} key="line-trend" />
          </LineChart>
        </div>

        {/* Category Distribution Chart */}
        <div className="bg-white border border-border rounded-[14px] p-6">
          <h3 className="text-[18px] font-semibold text-foreground mb-4">Inventory by Category</h3>
          {categoryData.length > 0 ? (
            <div className="flex items-center gap-4">
              <PieChart width={200} height={200}>
                <Pie
                  data={categoryData}
                  cx={100}
                  cy={100}
                  labelLine={false}
                  label={false}
                  outerRadius={80}
                  dataKey="value"
                  nameKey="name"
                >
                  {categoryData.map((entry, index) => (
                    <Cell
                      key={`pie-cell-${entry.id}-${entry.name}`}
                      fill={['#007A5E', '#155DFC', '#FFA500', '#E7000B', '#8B5CF6', '#EC4899'][index % 6]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
              <div className="flex-1 space-y-2">
                {categoryData.map((entry, index) => {
                  const total = categoryData.reduce((sum, item) => sum + item.value, 0);
                  const percentage = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0';
                  return (
                    <div key={`legend-${entry.id}`} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="size-3 rounded-full"
                          style={{ backgroundColor: ['#007A5E', '#155DFC', '#FFA500', '#E7000B', '#8B5CF6', '#EC4899'][index % 6] }}
                        />
                        <span className="text-[13px] text-foreground">{entry.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-muted-foreground">{entry.value}</span>
                        <span className="text-[13px] font-semibold text-foreground">{percentage}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No data available</p>
          )}
        </div>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Condition Breakdown Chart */}
        <div className="bg-white border border-border rounded-[14px] p-6">
          <h3 className="text-[18px] font-semibold text-foreground mb-4">Items by Condition</h3>
          <BarChart width={400} height={250} data={conditionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" key="grid-condition" />
            <XAxis dataKey="condition" stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} key="xaxis-condition" />
            <YAxis stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} key="yaxis-condition" />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}
              key="tooltip-condition"
            />
            <Bar dataKey="count" fill="var(--secondary)" radius={[8, 8, 0, 0]} key="bar-condition" />
          </BarChart>
        </div>

        {/* Quick Stats Grid */}
        <div className="bg-white border border-border rounded-[14px] p-6">
          <h3 className="text-[18px] font-semibold text-foreground mb-4">Quick Stats</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-[8px]">
              <div className="flex items-center gap-3">
                <div className="bg-secondary/10 rounded-full p-2">
                  <ShoppingCart className="size-5 text-secondary" />
                </div>
                <div>
                  <p className="text-[12px] text-muted-foreground">Pending Purchase Orders</p>
                  <p className="text-[18px] font-bold text-foreground">{pendingPOs}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-[8px]">
              <div className="flex items-center gap-3">
                <div className="bg-secondary/10 rounded-full p-2">
                  <PackageCheck className="size-5 text-secondary" />
                </div>
                <div>
                  <p className="text-[12px] text-muted-foreground">Products Received</p>
                  <p className="text-[18px] font-bold text-foreground">{productsReceived.length}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-[8px]">
              <div className="flex items-center gap-3">
                <div className="bg-warning/10 rounded-full p-2">
                  <Package className="size-5 text-warning" />
                </div>
                <div>
                  <p className="text-[12px] text-muted-foreground">Unique Items</p>
                  <p className="text-[18px] font-bold text-foreground">{inventory.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity & Alerts */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent Receipts */}
        <div className="bg-white border border-border rounded-[14px] p-6">
          <h3 className="text-[18px] font-semibold text-foreground mb-4">Recent Receipts</h3>
          {recentReceipts.length === 0 ? (
            <p className="text-[14px] text-muted-foreground text-center py-8">No recent receipts</p>
          ) : (
            <div className="space-y-3">
              {recentReceipts.map(receipt => (
                <div key={receipt.id} className="flex items-center justify-between p-3 bg-muted rounded-[8px]">
                  <div>
                    <p className="text-[14px] font-medium text-foreground">{receipt.receiptNumber}</p>
                    <p className="text-[12px] text-muted-foreground">{receipt.supplier}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-secondary">{receipt.totalAccepted} items</p>
                    <p className="text-[11px] text-muted-foreground">{receipt.dateReceived}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white border border-border rounded-[14px] p-6">
          <h3 className="text-[18px] font-semibold text-foreground mb-4">Low Stock Alerts</h3>
          {stockAlerts.length === 0 ? (
            <p className="text-[14px] text-muted-foreground text-center py-8">No low stock alerts</p>
          ) : (
            <div className="space-y-3">
              {stockAlerts.slice(0, 5).map(alert => {
                const item = inventory.find(i => i.id === alert.id);
                return item ? (
                  <div key={alert.id} className="flex items-center justify-between p-3 bg-warning/10 rounded-[8px]">
                    <div>
                      <p className="text-[14px] font-medium text-foreground">{item.name}</p>
                      <p className="text-[12px] text-muted-foreground">{item.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold text-warning">{item.quantity} left</p>
                      <p className="text-[11px] text-muted-foreground">Min: {alert.threshold}</p>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ title, value, change, subtitle, color, iconColor, isWarning, icon }: any) {
  return (
    <div className="bg-white border border-border rounded-[14px] p-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-foreground text-[14px] leading-[20px] mb-1">{title}</p>
          <p className="text-foreground text-[30px] font-bold leading-[36px]">{value}</p>
        </div>
        <div className="rounded-full size-[48px] flex items-center justify-center" style={{ backgroundColor: color, color: iconColor }}>
          {icon}
        </div>
      </div>
      {change !== undefined && !isWarning && (
        <div className="flex items-center gap-1">
          {change >= 0 ? <TrendingUp className="size-4 text-success" /> : <TrendingDown className="size-4 text-destructive" />}
          <span className={`text-[14px] font-medium ${change >= 0 ? 'text-success' : 'text-destructive'}`}>
            {change >= 0 ? '+' : ''}{change}%
          </span>
        </div>
      )}
      {subtitle && (
        <p className="text-foreground text-[12px] leading-[16px]">{subtitle}</p>
      )}
    </div>
  );
}

// Stock Alerts View
