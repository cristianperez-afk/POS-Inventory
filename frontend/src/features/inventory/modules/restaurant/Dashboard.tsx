import { useState, useEffect } from "react";
import { Apple, TrendingUp, AlertTriangle, PhilippinePeso, ShoppingCart, ArrowUp, ArrowDown, Calendar, Filter, Clock, ArrowRight, ChevronDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  useRestaurantGoodsRecordsQuery,
  useRestaurantInventoryQuery,
  useRestaurantKitchenOrdersQuery,
  useRestaurantPurchaseOrdersQuery,
} from "../lib/restaurant";
import { useSession } from "../../app/hooks/useSession";
import { defaultCategoryHierarchy, formatCurrency, getInventoryValue, isExpiringSoon, splitCategory, type InventoryProduct } from "../lib/inventoryLogic";
import { formatManilaFullDateTime, getManilaDateKey } from "../../../../shared/utils/date";
import { InlineDataLoading } from "../shared/InlineDataLoading";

type PendingOrder = {
  id: string;
  supplier: string;
  createdBy: string;
  date: string;
  items: number;
  total: number;
  expectedDelivery: string;
};

type PurchaseOrderSummary = {
  id: string;
  date: string;
  total: number;
  status: string;
};

type GoodsRecordSummary = {
  id: string;
  poId: string;
  receivedDate: string;
  status: string;
};

const navigateRestaurant = (target: string) =>
  window.dispatchEvent(new CustomEvent('restaurant-navigate', { detail: target }));

const goToInventory = () => navigateRestaurant('restaurant-food-inventory');

const goToStockAlerts = () => navigateRestaurant('restaurant-stock-alerts');

const goToKitchenOrders = () => navigateRestaurant('restaurant-pos-kitchen');

const goToPurchaseOrders = () => {
  sessionStorage.setItem('po-open-approval', 'true');
  navigateRestaurant('restaurant-purchase-orders');
};

const formatDuration = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 mins";
  if (minutes < 60) return `${Math.round(minutes)} mins`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return `${hours}h${rest ? ` ${rest}m` : ""}`;
};

const minutesBetween = (start?: string | null, end?: string | null) => {
  if (!start) return 0;
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0;
  return Math.max(0, Math.round((endTime - startTime) / 60000));
};

export function Dashboard() {
  const { currentUser } = useSession();
  const userRole = currentUser?.role === "Admin" ? "admin" : "staff";
  const [selectedMainCategory, setSelectedMainCategory] = useState("all");
  const [selectedSubCategory, setSelectedSubCategory] = useState("all");
  const [chartKey, setChartKey] = useState(0);

  useEffect(() => {
    setChartKey(prev => prev + 1);
  }, [selectedMainCategory, selectedSubCategory]);

  const { data: products = [], isLoading: productsLoading } = useRestaurantInventoryQuery<InventoryProduct[]>();
  const liveCategoryHierarchy = products.reduce<{ [key: string]: string[] }>((acc, product) => {
    const { main, sub } = splitCategory(product.category);
    if (!acc[main]) acc[main] = [];
    if (!acc[main].includes(sub)) acc[main].push(sub);
    return acc;
  }, {});
  const categoryHierarchy = Object.keys(liveCategoryHierarchy).length > 0 ? liveCategoryHierarchy : defaultCategoryHierarchy;

  const mainCategories = Object.keys(categoryHierarchy);
  const currentSubCategories = selectedMainCategory !== "all" && selectedMainCategory in categoryHierarchy
    ? categoryHierarchy[selectedMainCategory]
    : [];

  const handleMainCategoryChange = (category: string) => {
    setSelectedMainCategory(category);
    setSelectedSubCategory("all");
  };

  const { data: purchaseOrders = [], isLoading: purchaseOrdersLoading } = useRestaurantPurchaseOrdersQuery();
  const { data: goodsRecords = [], isLoading: goodsRecordsLoading } = useRestaurantGoodsRecordsQuery();
  const { data: kitchenOrders = [], isLoading: kitchenOrdersLoading } = useRestaurantKitchenOrdersQuery();
  const dashboardLoading = productsLoading || purchaseOrdersLoading || goodsRecordsLoading || kitchenOrdersLoading;
  const pendingOrders: PendingOrder[] = purchaseOrders
    .filter((order) => order.backendStatus === "SUBMITTED")
    .map((order) => ({
      id: order.id,
      supplier: order.supplier,
      createdBy: order.createdBy,
      date: order.date,
      items: order.items,
      total: order.total,
      expectedDelivery: order.expectedDelivery,
    }));

  const completedKitchenOrders = (kitchenOrders as any[]).filter((order) => ['completed', 'cancelled'].includes(String(order.status ?? '').toLowerCase()));
  const averageRunningTime = completedKitchenOrders.length > 0
    ? completedKitchenOrders.reduce((sum, order) => sum + minutesBetween(order.orderedAt, order.completedAt ?? order.updatedAt), 0) / completedKitchenOrders.length
    : 0;
  const dineInStayOrders = (kitchenOrders as any[]).filter((order) => order.tableStartedAt);
  const averageStayTime = dineInStayOrders.length > 0
    ? dineInStayOrders.reduce((sum, order) => sum + minutesBetween(order.tableStartedAt, order.tableEndedAt ?? order.completedAt ?? order.updatedAt), 0) / dineInStayOrders.length
    : 0;

  const stats = [
    {
      title: "Total Food Items",
      value: products.length.toString(),
      change: "Live",
      trend: "up",
      icon: Apple,
      color: "from-orange-500 to-red-500",
      onClick: goToInventory,
    },
    {
      title: "Expiring Soon",
      value: products.filter(isExpiringSoon).length.toString(),
      change: "Live",
      trend: "down",
      icon: Calendar,
      color: "from-orange-500 to-yellow-500",
      onClick: goToStockAlerts,
    },
    {
      title: "Total Value",
      value: formatCurrency(getInventoryValue(products)),
      change: "Live",
      trend: "up",
      icon: PhilippinePeso,
      color: "from-green-500 to-lime-500",
      onClick: goToInventory,
    },
    {
      title: userRole === "admin" ? "Pending Approvals" : "My Orders",
      value: userRole === "admin" ? pendingOrders.length.toString() : "0",
      change: "Local",
      trend: "up",
      icon: userRole === "admin" ? Clock : ShoppingCart,
      color: "from-amber-500 to-orange-500",
      onClick: goToPurchaseOrders,
    },
    {
      title: "Avg Running Time",
      value: formatDuration(averageRunningTime),
      change: "POS",
      trend: "up",
      icon: Clock,
      color: "from-cyan-500 to-blue-500",
      onClick: goToKitchenOrders,
    },
    {
      title: "Avg Dine-In Stay",
      value: formatDuration(averageStayTime),
      change: "Tables",
      trend: "up",
      icon: Clock,
      color: "from-violet-500 to-fuchsia-500",
      onClick: goToKitchenOrders,
    },
  ];

  const receivedPurchaseOrders: PurchaseOrderSummary[] = purchaseOrders.filter(order => order.status === "received");
  const receiptTrendData = receivedPurchaseOrders.map((order) => ({
    month: order.date || order.id,
    value: order.total,
  }));

  const formatActivityTimestamp = (timestamp: string) => {
    const formatted = formatManilaFullDateTime(timestamp);
    return formatted === 'Invalid Date' ? timestamp : formatted;
  };

  const allInventoryData = products.map((product) => {
    const { main, sub } = splitCategory(product.category);
    return {
      id: product.sku,
      category: main,
      subCategory: sub,
      value: product.stock,
    };
  });

  // Filter data based on selected categories
  const inventoryData = allInventoryData.filter(item => {
    const matchesMain = selectedMainCategory === "all" || item.category === selectedMainCategory;
    const matchesSub = selectedSubCategory === "all" || item.subCategory === selectedSubCategory;
    return matchesMain && matchesSub;
  });

  // Aggregate for pie chart display
  const aggregatedData = inventoryData.reduce((acc: any[], item) => {
    const existing = acc.find(a => a.category === item.category);
    if (existing) {
      existing.value += item.value;
    } else {
      acc.push({
        id: (item.category || '').toLowerCase().replace(/\s+/g, '-'),
        category: item.category,
        value: item.value
      });
    }
    return acc;
  }, []);

  const COLORS = ["#ea580c", "#65a30d", "#eab308", "#f59e0b", "#dc2626", "#854d0e"];

  const recentActivity = [
    ...products.slice(0, 3).map((product, index) => ({
      id: `product-${product.sku || index}`,
      action: "Inventory item added",
      item: product.name,
      time: `2026-05-31T0${8 + index}:15:00`,
      type: "add",
    })),
    ...purchaseOrders.slice(0, 3).map((order, index) => ({
      id: `po-${order.id}`,
      action: `Purchase order ${order.status}`,
      item: order.id,
      time: order.date ? `${order.date}T0${8 + index}:00:00` : "local record",
      type: "order",
    })),
    ...goodsRecords.slice(0, 3).map((record, index) => ({
      id: `gr-${record.id}`,
      action: `Goods received ${record.status}`,
      item: record.poId,
      time: record.receivedDate ? `${record.receivedDate}T1${index}:30:00` : "local record",
      type: "update",
    })),
  ].slice(0, 6);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          </div>

          {/* Category Filters */}
          <div className="flex gap-3">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <select
                value={selectedMainCategory}
                onChange={(e) => handleMainCategoryChange(e.target.value)}
                className="pl-9 pr-9 py-2 bg-input-background border border-input rounded-xl hover:border-primary/60 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200 appearance-none cursor-pointer min-w-[150px] text-sm"
              >
                <option value="all">All Categories</option>
                {mainCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>

            {selectedMainCategory !== "all" && (
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <select
                  value={selectedSubCategory}
                  onChange={(e) => setSelectedSubCategory(e.target.value)}
                  className="pl-9 pr-9 py-2 bg-input-background border border-input rounded-xl hover:border-primary/60 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200 appearance-none cursor-pointer min-w-[150px] text-sm"
                >
                  <option value="all">All {selectedMainCategory}</option>
                  {currentSubCategories.map((subCat) => (
                    <option key={subCat} value={subCat}>{subCat}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-2 xl:grid-cols-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <button
              type="button"
              key={`stat-${index}`}
              onClick={stat.onClick}
              aria-label={`View ${stat.title}`}
              className="group text-left w-full bg-card rounded-2xl p-6 shadow-sm border border-border cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/25 hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-lg active:shadow-primary/30 active:border-primary"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center shadow-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className={`flex items-center gap-1 text-sm ${stat.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                  {stat.trend === 'up' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  <span>{stat.change}</span>
                </div>
              </div>
              <h3 className="text-muted-foreground text-sm mb-1">{stat.title}</h3>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Inventory Receipt Trend Chart */}
        <div className="col-span-2 bg-card rounded-2xl p-6 shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Receipt Trend</h2>
              <p className="text-sm text-muted-foreground">Based on received purchase orders.</p>
            </div>
            {receiptTrendData.length > 0 && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-xl">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">{receiptTrendData.length} POs</span>
              </div>
            )}
          </div>
          {dashboardLoading ? (
            <InlineDataLoading label="Loading receipt activity…" className="min-h-[120px]" />
          ) : receiptTrendData.length === 0 ? (
            <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
              No received purchase order activity yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={receiptTrendData} key="receipt-line-chart">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" key="grid" />
                <XAxis dataKey="month" stroke="#64748b" key="x-axis" tick={{ fontSize: 8 }} />
                <YAxis stroke="#64748b" key="y-axis" tick={{ fontSize: 8 }} />
                <Tooltip
                  key="line-tooltip"
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '9px',
                    padding: '4px 6px'
                  }}
                />
                <Line
                  key="receipt-line"
                  type="monotone"
                  dataKey="value"
                  stroke="#0ea5e9"
                  strokeWidth={1.5}
                  dot={{ fill: '#0ea5e9', r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Inventory Distribution */}
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
          <h2 className="text-lg font-bold text-foreground mb-4">By Category</h2>
          <ResponsiveContainer width="100%" height={120} key={`pie-container-${chartKey}`}>
            <PieChart key={`piechart-${chartKey}`}>
              <Pie
                key={`pie-slice-${chartKey}`}
                data={aggregatedData}
                cx="50%"
                cy="50%"
                innerRadius={25}
                outerRadius={38}
                paddingAngle={2}
                dataKey="value"
                nameKey="category"
                isAnimationActive={false}
                onClick={() => goToInventory()}
                cursor="pointer"
              >
                {aggregatedData.map((entry, index) => (
                  <Cell key={`cell-${chartKey}-${index}-${entry.category}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                key={`pie-tooltip-${chartKey}`}
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '9px',
                  padding: '4px 6px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-1.5">
            {aggregatedData.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-sm p-1.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => goToInventory()}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index] }}></div>
                  <span className="text-foreground truncate">{item.category}</span>
                </div>
                <span className="text-muted-foreground font-medium ml-2">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Staff Info Banner */}
      {userRole === "staff" && (
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-6 shadow-sm mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 mb-1">Staff Account - Limited Access</h3>
              <p className="text-sm text-blue-800">
                You have access to core inventory operations. Purchase orders you create will require admin approval before processing.
                User management and approval features are restricted to admin accounts.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Purchase Order Approvals - Admin Only */}
      {userRole === "admin" && pendingOrders.length > 0 && (
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-amber-200 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Purchase Orders Awaiting Approval</h2>
                <p className="text-sm text-muted-foreground">{pendingOrders.length} order{pendingOrders.length !== 1 ? 's' : ''} pending your review</p>
              </div>
            </div>
            <button
              onClick={goToPurchaseOrders}
              className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              Go to Purchase Orders
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {pendingOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl text-slate-900"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-amber-200">
                    <ShoppingCart className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-950">{order.id}</h3>
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded text-xs font-medium">
                        Pending Approval
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">
                      Supplier: <span className="font-medium text-slate-950">{order.supplier}</span> •
                      Created by: <span className="font-medium text-slate-950">{order.createdBy}</span> •
                      {order.items} item{order.items !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      Expected Delivery: {getManilaDateKey(order.expectedDelivery)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-600">Total Amount</p>
                  <p className="text-lg font-bold text-slate-950">₱{order.total.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
        <h2 className="text-lg font-bold text-foreground mb-4">Recent Activity</h2>
        <div className="space-y-2">
          {dashboardLoading ? (
            <InlineDataLoading label="Loading recent activity…" />
          ) : recentActivity.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No activity yet</div>
          ) : recentActivity.map((activity) => (
            <div key={activity.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                activity.type === 'add' ? 'bg-green-100 text-green-600' :
                activity.type === 'update' ? 'bg-blue-100 text-blue-600' :
                activity.type === 'alert' ? 'bg-orange-100 text-orange-600' :
                'bg-purple-100 text-purple-600'
              }`}>
                <Apple className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground font-medium text-sm truncate">{activity.action}: {activity.item}</p>
              </div>
              <span className="text-muted-foreground text-xs whitespace-nowrap">{formatActivityTimestamp(activity.time)}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
