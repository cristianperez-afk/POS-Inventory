import { useState } from "react";
import { Package, Search, TrendingDown, TrendingUp, AlertCircle, RefreshCw, Download, BarChart3, Calendar, Clock } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useRestaurantAdjustmentsQuery,
  useRestaurantInventoryMovementsQuery,
  useRestaurantInventoryQuery,
  useRestaurantWasteQuery,
} from "../lib/restaurant";
import { formatQuantity, getDaysUntilExpiry, getStockStatus, splitCategory, StockStatus } from "../lib/inventoryLogic";
import { InlineDataLoading } from "../shared/InlineDataLoading";

type StockItem = {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  unit: string;
  minStock: number;
  maxStock: number;
  reorderPoint: number;
  unitCost: number;
  totalValue: number;
  status: StockStatus;
  turnoverRate: number | null;
  movementQuantity: number;
  classification: "A" | "B" | "C";
  expiry?: string;
  location?: string;
};

type ExpiryItem = {
  id: string;
  name: string;
  category: string;
  sku: string;
  location: string;
  expiry: string;
  expiryPeriod: string;
  stock: number;
  unit: string;
  daysUntilExpiry: number;
};

type ViewType = "control" | "low-stock" | "expiring";

type WasteLogSummary = {
  item: string;
  quantity: number;
};

type AdjustmentSummary = {
  item: string;
  quantity: number;
  type: "damage" | "shrinkage" | "waste" | "found" | "correction";
};

type InventoryMovementSummary = {
  item: string;
  quantity: number;
  type: "pos-consumption" | "pos-void";
};

const normalizeName = (value: string | undefined) => (value || '').trim().toLowerCase();
const compareStockItemsByName = (a: StockItem, b: StockItem) =>
  a.name.trim().localeCompare(b.name.trim(), undefined, { sensitivity: "base", numeric: true }) ||
  a.id.localeCompare(b.id, undefined, { sensitivity: "base", numeric: true });
const expiryPeriodOptions = ["Early Morning", "Morning", "Afternoon", "Evening", "Midnight"];

export function StockControl() {
  const [viewType, setViewType] = useState<ViewType>("control");
  const [searchQuery, setSearchQuery] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expiryDateFilter, setExpiryDateFilter] = useState("all");
  const [expiryPeriodFilter, setExpiryPeriodFilter] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: products = [], isLoading: productsLoading } = useRestaurantInventoryQuery();
  const { data: wasteLogs = [], isLoading: wasteLoading } = useRestaurantWasteQuery();
  const { data: adjustments = [], isLoading: adjustmentsLoading } = useRestaurantAdjustmentsQuery();
  const { data: inventoryMovements = [], isLoading: movementsLoading } = useRestaurantInventoryMovementsQuery();
  const stockDataLoading = productsLoading || wasteLoading || adjustmentsLoading || movementsLoading;
  const queryClient = useQueryClient();

  const getRecordedOutflowQuantity = (productName: string) => {
    const targetName = normalizeName(productName);
    const wasteQuantity = wasteLogs
      .filter((log) => normalizeName(log.item) === targetName)
      .reduce((sum, log) => sum + (Number(log.quantity) || 0), 0);
    const adjustmentQuantity = adjustments
      .filter((adjustment) =>
        normalizeName(adjustment.item) === targetName &&
        ["damage", "shrinkage", "waste"].includes(adjustment.type)
      )
      .reduce((sum, adjustment) => sum + (Number(adjustment.quantity) || 0), 0);
    const posConsumptionQuantity = inventoryMovements
      .filter((movement) => normalizeName(movement.item) === targetName && movement.type === "pos-consumption")
      .reduce((sum, movement) => sum + (Number(movement.quantity) || 0), 0);
    const posVoidQuantity = inventoryMovements
      .filter((movement) => normalizeName(movement.item) === targetName && movement.type === "pos-void")
      .reduce((sum, movement) => sum + (Number(movement.quantity) || 0), 0);

    return Math.max(0, wasteQuantity + adjustmentQuantity + posConsumptionQuantity - posVoidQuantity);
  };

  // ABC analysis: rank products by their share of total inventory value (Pareto rule),
  // not a fixed peso cutoff — A = top ~80% of cumulative value, B = next ~15%, C = the rest.
  const totalInventoryValue = products.reduce((sum, product) => sum + product.stock * product.price, 0);
  const classificationBySku = new Map<string, "A" | "B" | "C">();
  [...products]
    .sort((a, b) => b.stock * b.price - a.stock * a.price)
    .reduce((cumulativeValue, product) => {
      const nextCumulativeValue = cumulativeValue + product.stock * product.price;
      const cumulativePercent = totalInventoryValue > 0 ? (nextCumulativeValue / totalInventoryValue) * 100 : 100;
      const classification = cumulativePercent <= 80 ? "A" : cumulativePercent <= 95 ? "B" : "C";
      classificationBySku.set(product.sku, classification);
      return nextCumulativeValue;
    }, 0);

  const stockItems: StockItem[] = products.map((product) => {
    const totalValue = product.stock * product.price;
    const effectiveMinStock = product.minStock ?? Math.ceil(product.maxStock * 0.25);
    const effectiveReorderPoint = product.reorderPoint ?? Math.ceil(product.maxStock * 0.3);
    const status = getStockStatus(product.stock, product.maxStock, effectiveMinStock, effectiveReorderPoint);
    const classification = classificationBySku.get(product.sku) ?? "C";
    const { main } = splitCategory(product.category);
    const movementQuantity = getRecordedOutflowQuantity(product.name);
    const averageStockEstimate = movementQuantity > 0
      ? Math.max((product.stock + product.stock + movementQuantity) / 2, 1)
      : 0;

    return {
      id: product.sku,
      name: product.name,
      category: main,
      currentStock: product.stock,
      unit: product.unit || "pcs",
      minStock: effectiveMinStock,
      maxStock: product.maxStock,
      reorderPoint: effectiveReorderPoint,
      unitCost: product.price,
      totalValue,
      status,
      turnoverRate: movementQuantity > 0 ? Number((movementQuantity / averageStockEstimate).toFixed(2)) : null,
      movementQuantity,
      classification,
      expiry: product.expiry,
      location: product.location || "Unassigned",
    };
  });

  const expiryItems: ExpiryItem[] = products
    .map((product) => {
      const { main } = splitCategory(product.category);
      return {
        id: product.sku,
        name: product.name,
        category: main,
        sku: product.sku,
        location: product.location || "Unassigned",
        expiry: product.expiry,
        expiryPeriod: product.expiryPeriod || "",
        stock: product.stock,
        unit: product.unit || "pcs",
        daysUntilExpiry: getDaysUntilExpiry(product.expiry),
      };
    })
    .filter((item) => item.daysUntilExpiry <= 7)
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  const lowStockItems = stockItems.filter(item => item.status === "out-of-stock" || item.status === "critical" || item.status === "low");

  const filteredControlItems = stockItems
    .filter(item => {
      const matchesSearch = (item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (item.id || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesClassification = classificationFilter === "all" || item.classification === classificationFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesClassification && matchesStatus;
    })
    .sort(compareStockItemsByName);

  const filteredLowStockItems = lowStockItems.filter(item => {
    const matchesSearch = (item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (item.id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredExpiryItems = expiryItems.filter(item => {
    const matchesSearch = (item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (item.sku || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDate =
      expiryDateFilter === "all" ||
      (expiryDateFilter === "expired" && item.daysUntilExpiry < 0) ||
      (expiryDateFilter === "today" && item.daysUntilExpiry === 0) ||
      (expiryDateFilter === "tomorrow" && item.daysUntilExpiry === 1) ||
      (expiryDateFilter === "next3" && item.daysUntilExpiry >= 0 && item.daysUntilExpiry <= 3) ||
      (expiryDateFilter === "next7" && item.daysUntilExpiry >= 0 && item.daysUntilExpiry <= 7);
    const matchesPeriod = expiryPeriodFilter === "all" || (item.expiryPeriod || "") === expiryPeriodFilter;
    return matchesSearch && matchesDate && matchesPeriod;
  });

  const getStatusBadge = (status: string) => {
    const styles = {
      "out-of-stock": { bg: "#000000", text: "#FFFFFF", border: "#000000" },
      healthy: { bg: "#D1F2E8", text: "#007A5E", border: "#008967" },
      medium: { bg: "#FEF3C7", text: "#92400E", border: "#F59E0B" },
      low: { bg: "#FED7AA", text: "#9A3412", border: "#F59E0B" },
      critical: { bg: "#FEE2E2", text: "#991B1B", border: "#DC2626" },
      overstock: { bg: "#E0F7F7", text: "#005656", border: "#009BA5" },
    };
    const labels = {
      "out-of-stock": "Out of Stock",
      healthy: "Healthy Stock",
      medium: "Medium Stock",
      low: "Low Stock",
      critical: "Critical Stock",
      overstock: "Overstock",
    };
    const style = styles[status as keyof typeof styles];
    const label = labels[status as keyof typeof labels];

    if (!style || !label) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap" style={{ backgroundColor: "#E5E7EB", color: "#374151", borderColor: "#9CA3AF" }}>
          {status}
        </span>
      );
    }

    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap" style={{ backgroundColor: style.bg, color: style.text, borderColor: style.border }}>
        {label}
      </span>
    );
  };

  const getClassificationBadge = (classification: string) => {
    const styles = {
      A: { bg: "#E0F7F7", text: "#009BA5", border: "#00A7A5" },
      B: { bg: "#D1F2E8", text: "#007A5E", border: "#008967" },
      C: { bg: "#F3F4F6", text: "#6B7280", border: "#D1D5DB" },
    };
    const style = styles[classification as keyof typeof styles];

    if (!style) {
      return (
        <span className="px-2 py-1 rounded text-xs font-bold border" style={{ backgroundColor: "#E5E7EB", color: "#374151", borderColor: "#9CA3AF" }}>
          {classification}
        </span>
      );
    }

    return (
      <span className="px-2 py-1 rounded text-xs font-bold border" style={{ backgroundColor: style.bg, color: style.text, borderColor: style.border }}>
        {classification}
      </span>
    );
  };

  const getExpiryStatus = (daysUntilExpiry: number) => {
    if (daysUntilExpiry <= 0) {
      return {
        status: "expired",
        label: daysUntilExpiry === 0 ? "Expires Today" : "Expired",
        color: "#000000",
        textColor: "#FFFFFF",
        borderColor: "#000000",
      };
    } else if (daysUntilExpiry === 1) {
      return {
        status: "critical",
        label: "Expires Tomorrow",
        color: "#DC2626",
        textColor: "#FFFFFF",
        borderColor: "#DC2626",
      };
    } else if (daysUntilExpiry <= 3) {
      return {
        status: "urgent",
        label: `Expires in ${daysUntilExpiry} days`,
        color: "#F59E0B",
        textColor: "#FFFFFF",
        borderColor: "#F59E0B",
      };
    } else if (daysUntilExpiry <= 7) {
      return {
        status: "warning",
        label: `Expires in ${daysUntilExpiry} days`,
        color: "#FBBF24",
        textColor: "#FFFFFF",
        borderColor: "#FBBF24",
      };
    } else {
      return {
        status: "good",
        label: `Expires in ${daysUntilExpiry} days`,
        color: "#008967",
        textColor: "#FFFFFF",
        borderColor: "#008967",
      };
    }
  };

  // Cards drive the view/filters in-place. Out-of-stock / critical / low are
  // alerts, so they open the Low Stock Alerts tab narrowed to that status.
  // Medium / healthy / total value only exist in the Overview table, and
  // Expiring Soon switches to the Expiring Items view.
  const showAlert = (status: string) => {
    setViewType("low-stock");
    setStatusFilter(status);
  };
  const showStatus = (status: string) => {
    setViewType("control");
    setStatusFilter(status);
  };
  const showExpiring = () => {
    setViewType("expiring");
    setExpiryDateFilter("next3");
  };

  const stats = [
    { label: "Total Stock Value", value: `₱${stockItems.reduce((sum, item) => sum + item.totalValue, 0).toLocaleString()}`, icon: Package, color: "linear-gradient(to right, #009BA5, #00A7A5)", onClick: () => showStatus("all") },
    { label: "Out of Stock", value: stockItems.filter(i => i.status === "out-of-stock").length, icon: AlertCircle, color: "linear-gradient(to right, #000000, #52525B)", onClick: () => showAlert("out-of-stock") },
    { label: "Critical Stock", value: stockItems.filter(i => i.status === "critical").length, icon: AlertCircle, color: "linear-gradient(to right, #DC2626, #EF4444)", onClick: () => showAlert("critical") },
    { label: "Low Stock", value: stockItems.filter(i => i.status === "low").length, icon: TrendingDown, color: "linear-gradient(to right, #F59E0B, #FCD34D)", onClick: () => showAlert("low") },
    { label: "Medium Stock", value: stockItems.filter(i => i.status === "medium").length, icon: BarChart3, color: "linear-gradient(to right, #F59E0B, #FBBF24)", onClick: () => showStatus("medium") },
    { label: "Healthy Stock", value: stockItems.filter(i => i.status === "healthy").length, icon: Package, color: "linear-gradient(to right, #007A5E, #008967)", onClick: () => showStatus("healthy") },
    { label: "Expiring Soon", value: expiryItems.filter(i => i.daysUntilExpiry <= 3).length, icon: Calendar, color: "linear-gradient(to right, #F59E0B, #DC2626)", onClick: showExpiring },
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Refetch stock data (inventory, waste, adjustments, movements) from the backend.
      await queryClient.invalidateQueries();
      toast.success("Stock data refreshed successfully!");
    } catch {
      toast.error("Failed to refresh stock data");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportReport = () => {
    let csvContent = "";
    let filename = "";

    if (viewType === "control") {
      // Export Stock Control data
      csvContent = "SKU,Product Name,Category,Current Stock,Min Stock,Max Stock,Reorder Point,Unit Cost,Total Value,Status,Recorded Outflow,Turnover Rate,Classification,Location\n";

      filteredControlItems.forEach(item => {
        csvContent += `${item.id},${item.name},${item.category},${item.currentStock} ${item.unit},${item.minStock} ${item.unit},${item.maxStock} ${item.unit},${item.reorderPoint} ${item.unit},${item.unitCost.toFixed(2)},${item.totalValue.toFixed(2)},${item.status},${item.movementQuantity} ${item.unit},${item.turnoverRate === null ? "N/A" : `${item.turnoverRate}x`},${item.classification},${item.location}\n`;
      });

      filename = "stock_control_report.csv";
    } else if (viewType === "low-stock") {
      // Export Low Stock Alerts
      csvContent = "SKU,Product Name,Category,Current Stock,Min Stock,Reorder Point,Status,Location\n";

      filteredLowStockItems.forEach(item => {
        csvContent += `${item.id},${item.name},${item.category},${item.currentStock} ${item.unit},${item.minStock} ${item.unit},${item.reorderPoint} ${item.unit},${item.status},${item.location}\n`;
      });

      filename = "low_stock_alerts.csv";
    } else if (viewType === "expiring") {
      // Export Expiring Items
      csvContent = "SKU,Product Name,Category,Expiry Date,Expiry Period,Days Until Expiry,Current Stock,Location\n";

      filteredExpiryItems.forEach(item => {
        csvContent += `${item.sku},${item.name},${item.category},${item.expiry},${item.expiryPeriod || 'N/A'},${item.daysUntilExpiry},${item.stock} ${item.unit},${item.location}\n`;
      });

      filename = "expiring_items_report.csv";
    }

    // Create and download CSV file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Stock Control & Alerts</h1>
          <p className="text-muted-foreground">Monitor stock levels, alerts, reorder points, and inventory valuation</p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-6 py-3 bg-muted text-foreground rounded-2xl border border-transparent hover:bg-muted/80 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-sm transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none disabled:border-transparent"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={handleExportReport}
            className="px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-2xl hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-md transition-all duration-200 flex items-center gap-2"
          >
            <Download className="w-5 h-5" />
            Export Report
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-7 gap-6 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <button
              type="button"
              key={index}
              onClick={stat.onClick}
              aria-label={`Filter by ${stat.label}`}
              className="group text-left w-full bg-card rounded-2xl p-6 shadow-sm border border-border overflow-hidden min-w-0 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/25 hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-lg active:shadow-primary/30 active:border-primary"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: stat.color }}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <p className="text-muted-foreground text-sm mb-2 truncate">{stat.label}</p>
              <p className="text-xl font-bold text-foreground break-words">{stat.value}</p>
            </button>
          );
        })}
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2 bg-muted rounded-2xl p-1 mb-6 w-fit">
        <button
          onClick={() => setViewType("control")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            viewType === "control"
              ? "bg-primary text-white shadow-md"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => { setViewType("low-stock"); setStatusFilter("all"); }}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            viewType === "low-stock"
              ? "bg-primary text-white shadow-md"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="w-4 h-4" />
          Low Stock Alerts
        </button>
        <button
          onClick={() => setViewType("expiring")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            viewType === "expiring"
              ? "bg-primary text-white shadow-md"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="w-4 h-4" />
          Expiring Items
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-border mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by product name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
          {viewType === "control" && (
            <>
              <select
                value={classificationFilter}
                onChange={(e) => setClassificationFilter(e.target.value)}
                className="px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
              >
                <option value="all">All Classifications</option>
                <option value="A">Class A (High Value)</option>
                <option value="B">Class B (Medium Value)</option>
                <option value="C">Class C (Low Value)</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="out-of-stock">Out of Stock</option>
                <option value="critical">Critical Stock (1% - 10%)</option>
                <option value="low">Low Stock (11% - 30%)</option>
                <option value="medium">Medium Stock (31% - 70%)</option>
                <option value="healthy">Healthy Stock (71% - 100%)</option>
                <option value="overstock">Overstock</option>
              </select>
            </>
          )}
          {viewType === "expiring" && (
            <>
              <select
                value={expiryDateFilter}
                onChange={(e) => setExpiryDateFilter(e.target.value)}
                className="px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
              >
                <option value="all">All Expiry Dates</option>
                <option value="expired">Expired</option>
                <option value="today">Expires Today</option>
                <option value="tomorrow">Expires Tomorrow</option>
                <option value="next3">Within 3 Days</option>
                <option value="next7">Within 7 Days</option>
              </select>
              <select
                value={expiryPeriodFilter}
                onChange={(e) => setExpiryPeriodFilter(e.target.value)}
                className="px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
              >
                <option value="all">All Expiry Periods</option>
                {expiryPeriodOptions.map((period) => (
                  <option key={period} value={period}>{period}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Content Based on View Type */}
      {viewType === "control" && (
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-foreground">SKU</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Product Name</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Category</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-foreground">Current Stock</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-foreground">Reorder Point</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-foreground">Unit Cost</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-foreground">Total Value</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-foreground">Turnover</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-foreground">ABC</th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-foreground min-w-[150px]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stockDataLoading ? (
                  <tr><td colSpan={10}><InlineDataLoading label="Loading stock overview…" /></td></tr>
                ) : filteredControlItems.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-10 text-center text-muted-foreground">No stock items found.</td></tr>
                ) : filteredControlItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-medium text-primary">{item.id}</span>
                    </td>
                    <td className="px-6 py-4 text-foreground font-medium">{item.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{item.category}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-foreground">{formatQuantity(item.currentStock, item.unit)}</span>
                        <span className="text-xs text-muted-foreground">Min: {formatQuantity(item.minStock, item.unit)} | Max: {formatQuantity(item.maxStock, item.unit)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-foreground">{formatQuantity(item.reorderPoint, item.unit)}</td>
                    <td className="px-6 py-4 text-right text-foreground">₱{item.unitCost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-medium text-foreground">₱{item.totalValue.toFixed(2)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1 text-sm">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        {item.turnoverRate === null ? "N/A" : `${item.turnoverRate}x`}
                      </span>
                      <p className="text-[10px] text-muted-foreground">Outflow: {formatQuantity(item.movementQuantity, item.unit)}</p>
                    </td>
                    <td className="px-6 py-4 text-center">{getClassificationBadge(item.classification)}</td>
                    <td className="px-6 py-4 text-center min-w-[150px]">{getStatusBadge(item.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewType === "low-stock" && (
        <div className="space-y-4">
          {stockDataLoading ? (
            <div className="bg-card rounded-2xl border border-border"><InlineDataLoading label="Loading low-stock alerts…" /></div>
          ) : filteredLowStockItems.length === 0 ? (
            <div className="bg-card rounded-2xl p-12 text-center shadow-sm border border-border">
              <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No Low Stock Items</h3>
              <p className="text-muted-foreground">All items are well-stocked!</p>
            </div>
          ) : (
            filteredLowStockItems.map((item) => {
              const borderColor = item.status === "out-of-stock" ? "#000000" : item.status === "critical" ? "#FCA5A5" : "#FED7AA";
              const stockColor = item.status === "out-of-stock" ? "#000000" : item.status === "critical" ? "#DC2626" : "#F59E0B";
              const iconColor = item.status === "out-of-stock" ? "#000000" : item.status === "critical" ? "#DC2626" : "#F59E0B";

              return (
                <div
                  key={item.id}
                  className="bg-card rounded-2xl p-6 shadow-sm border-2"
                  style={{ borderColor }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-foreground">{item.name}</h3>
                        {getStatusBadge(item.status)}
                        {getClassificationBadge(item.classification)}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">SKU</p>
                          <p className="text-sm font-medium text-foreground">{item.id}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Category</p>
                          <p className="text-sm font-medium text-foreground">{item.category}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Current Stock</p>
                          <p className="text-sm font-bold" style={{ color: stockColor }}>{formatQuantity(item.currentStock, item.unit)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Min Stock</p>
                          <p className="text-sm font-medium text-foreground">{formatQuantity(item.minStock, item.unit)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Reorder Point</p>
                          <p className="text-sm font-medium text-foreground">{formatQuantity(item.reorderPoint, item.unit)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Location</p>
                          <p className="text-sm font-medium text-foreground">{item.location}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Unit Cost</p>
                          <p className="text-sm font-medium text-foreground">₱{item.unitCost.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Total Value</p>
                          <p className="text-sm font-bold text-foreground">₱{item.totalValue.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                    <AlertCircle className="w-8 h-8" style={{ color: iconColor }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {viewType === "expiring" && (
        <div className="space-y-4">
          {stockDataLoading ? (
            <div className="bg-card rounded-2xl border border-border"><InlineDataLoading label="Loading expiring items…" /></div>
          ) : filteredExpiryItems.length === 0 ? (
            <div className="bg-card rounded-2xl p-12 text-center shadow-sm border border-border">
              <Calendar className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No Expiring Items</h3>
              <p className="text-muted-foreground">All items are fresh!</p>
            </div>
          ) : (
            filteredExpiryItems.map((item) => {
              const expiryStatus = getExpiryStatus(item.daysUntilExpiry);
              return (
                <div
                  key={item.id}
                  className="bg-card rounded-2xl p-6 shadow-sm border-2 border-border hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-foreground">{item.name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${expiryStatus.color} ${expiryStatus.textColor}`}>
                          {expiryStatus.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">SKU</p>
                          <p className="text-sm font-medium text-foreground">{item.sku}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Category</p>
                          <p className="text-sm font-medium text-foreground">{item.category}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Stock Remaining</p>
                          <p className="text-sm font-bold text-foreground">{formatQuantity(item.stock, item.unit)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Location</p>
                          <p className="text-sm font-medium text-foreground">{item.location}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Expiry Date</p>
                          <p className="text-sm font-medium text-foreground">{item.expiry}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Expiry Period</p>
                          <p className="text-sm font-medium text-foreground">{item.expiryPeriod || "Not specified"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Days Until Expiry</p>
                          <p
                            className="text-sm font-bold"
                            style={{
                              color: item.daysUntilExpiry <= 1 ? "#DC2626" : item.daysUntilExpiry <= 3 ? "#F59E0B" : "#323B42"
                            }}
                          >
                            {item.daysUntilExpiry === 0 ? "EXPIRED" : `${item.daysUntilExpiry} days`}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Clock
                      className="w-8 h-8"
                      style={{
                        color: item.daysUntilExpiry === 0 ? "#000000" : item.daysUntilExpiry === 1 ? "#DC2626" : item.daysUntilExpiry <= 3 ? "#F59E0B" : "#FBBF24"
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
