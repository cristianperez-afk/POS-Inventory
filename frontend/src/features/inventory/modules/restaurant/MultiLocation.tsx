import { useState } from "react";
import { MapPin, Search, Package, TrendingDown, AlertCircle, Building2, BarChart3, Eye, ArrowLeftRight } from "lucide-react";
import { useRestaurantInventoryQuery, useRestaurantStorageTemperatureOptionsQuery } from "../lib/restaurant";
import { formatQuantity, getStockStatus, splitCategory, StockStatus } from "../lib/inventoryLogic";

type LocationStock = {
  location: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  status: StockStatus;
};

type Product = {
  id: string;
  name: string;
  category: string;
  totalStock: number;
  unit: string;
  storageTemperature?: string;
  locations: LocationStock[];
};

type Location = {
  id: string;
  name: string;
  type: "warehouse" | "store" | "kitchen";
  address: string;
  manager: string;
  totalProducts: number;
  lowStockItems: number;
  criticalItems: number;
  totalValue: number;
};

export function MultiLocation() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedStorageTemperature, setSelectedStorageTemperature] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"products" | "locations">("products");

  const sampleLocations: Location[] = [
    { id: "LOC-001", name: "Main Warehouse", type: "warehouse", address: "123 Industrial Ave", manager: "John Smith", totalProducts: 156, lowStockItems: 12, criticalItems: 3, totalValue: 45600 },
    { id: "LOC-002", name: "Downtown Store", type: "store", address: "456 Main St", manager: "Sarah Lee", totalProducts: 98, lowStockItems: 8, criticalItems: 2, totalValue: 28900 },
    { id: "LOC-003", name: "Central Kitchen", type: "kitchen", address: "789 Food Plaza", manager: "Mike Chen", totalProducts: 124, lowStockItems: 15, criticalItems: 5, totalValue: 38200 },
    { id: "LOC-004", name: "Airport Branch", type: "store", address: "Airport Terminal 2", manager: "Emma Davis", totalProducts: 76, lowStockItems: 6, criticalItems: 1, totalValue: 19400 },
    { id: "LOC-005", name: "Mall Branch", type: "store", address: "Shopping Mall L3", manager: "Alex Wong", totalProducts: 82, lowStockItems: 9, criticalItems: 2, totalValue: 22100 },
  ];

  const sampleProducts: Product[] = [
    {
      id: "SKU-001",
      name: "Fresh Salmon Fillet",
      category: "Seafood",
      totalStock: 142,
      unit: "kg",
      locations: [
        { location: "Main Warehouse", currentStock: 45, minStock: 20, maxStock: 100, status: "healthy" },
        { location: "Downtown Store", currentStock: 28, minStock: 15, maxStock: 50, status: "healthy" },
        { location: "Central Kitchen", currentStock: 35, minStock: 20, maxStock: 60, status: "healthy" },
        { location: "Airport Branch", currentStock: 18, minStock: 10, maxStock: 40, status: "healthy" },
        { location: "Mall Branch", currentStock: 16, minStock: 10, maxStock: 40, status: "healthy" },
      ],
    },
    {
      id: "SKU-002",
      name: "Organic Chicken Breast",
      category: "Meat",
      totalStock: 95,
      unit: "kg",
      locations: [
        { location: "Main Warehouse", currentStock: 15, minStock: 25, maxStock: 80, status: "low" },
        { location: "Downtown Store", currentStock: 22, minStock: 15, maxStock: 50, status: "healthy" },
        { location: "Central Kitchen", currentStock: 18, minStock: 20, maxStock: 60, status: "low" },
        { location: "Airport Branch", currentStock: 25, minStock: 10, maxStock: 40, status: "healthy" },
        { location: "Mall Branch", currentStock: 15, minStock: 10, maxStock: 40, status: "healthy" },
      ],
    },
    {
      id: "SKU-003",
      name: "Greek Yogurt 32oz",
      category: "Dairy",
      totalStock: 58,
      unit: "pcs",
      locations: [
        { location: "Main Warehouse", currentStock: 8, minStock: 15, maxStock: 60, status: "critical" },
        { location: "Downtown Store", currentStock: 12, minStock: 10, maxStock: 30, status: "healthy" },
        { location: "Central Kitchen", currentStock: 6, minStock: 15, maxStock: 40, status: "critical" },
        { location: "Airport Branch", currentStock: 18, minStock: 8, maxStock: 25, status: "healthy" },
        { location: "Mall Branch", currentStock: 14, minStock: 8, maxStock: 25, status: "healthy" },
      ],
    },
    {
      id: "SKU-004",
      name: "Strawberries 1lb",
      category: "Fruits",
      totalStock: 215,
      unit: "pcs",
      locations: [
        { location: "Main Warehouse", currentStock: 95, minStock: 20, maxStock: 70, status: "overstock" },
        { location: "Downtown Store", currentStock: 42, minStock: 15, maxStock: 40, status: "overstock" },
        { location: "Central Kitchen", currentStock: 28, minStock: 20, maxStock: 50, status: "healthy" },
        { location: "Airport Branch", currentStock: 25, minStock: 10, maxStock: 30, status: "healthy" },
        { location: "Mall Branch", currentStock: 25, minStock: 10, maxStock: 30, status: "healthy" },
      ],
    },
    {
      id: "SKU-005",
      name: "Aged Cheddar Cheese",
      category: "Dairy",
      totalStock: 128,
      unit: "kg",
      locations: [
        { location: "Main Warehouse", currentStock: 42, minStock: 15, maxStock: 50, status: "healthy" },
        { location: "Downtown Store", currentStock: 24, minStock: 12, maxStock: 35, status: "healthy" },
        { location: "Central Kitchen", currentStock: 32, minStock: 15, maxStock: 45, status: "healthy" },
        { location: "Airport Branch", currentStock: 15, minStock: 8, maxStock: 25, status: "healthy" },
        { location: "Mall Branch", currentStock: 15, minStock: 8, maxStock: 25, status: "healthy" },
      ],
    },
  ];

  const { data: inventoryProducts = [] } = useRestaurantInventoryQuery();
  const { data: storageTemperatureOptions = [] } = useRestaurantStorageTemperatureOptionsQuery();
  const products: Product[] = inventoryProducts.map((item) => {
    const locationName = item.location || "Unassigned";
    const { main } = splitCategory(item.category);

    return {
      id: item.sku,
      name: item.name,
      category: main,
      totalStock: item.stock,
      unit: item.unit || "pcs",
      storageTemperature: item.storageTemperature,
      locations: [
        {
          location: locationName,
          currentStock: item.stock,
          minStock: Math.ceil(item.maxStock * 0.25),
          maxStock: item.maxStock,
          status: getStockStatus(item.stock, item.maxStock),
        },
      ],
    };
  });

  const locations: Location[] = Array.from(new Set(inventoryProducts.map(item => item.location || "Unassigned"))).map((name, index) => {
    const productsAtLocation = inventoryProducts.filter(item => (item.location || "Unassigned") === name);
    const stockStatuses = productsAtLocation.map(item => getStockStatus(item.stock, item.maxStock));

    return {
      id: `LOC-${String(index + 1).padStart(3, "0")}`,
      name,
      type: "warehouse",
      address: "Local storage",
      manager: "Unassigned",
      totalProducts: productsAtLocation.length,
      lowStockItems: stockStatuses.filter(status => status === "low").length,
      criticalItems: stockStatuses.filter(status => status === "out-of-stock" || status === "critical").length,
      totalValue: productsAtLocation.reduce((sum, item) => sum + item.stock * item.price, 0),
    };
  });

  const filteredProducts = products.filter(product => {
    const matchesSearch = (product.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (product.id || '').toLowerCase().includes(searchQuery.toLowerCase());

    let matchesLocation = true;
    if (selectedLocation !== "all") {
      matchesLocation = product.locations.some(loc => loc.location === selectedLocation);
    }

    let matchesStatus = true;
    if (statusFilter !== "all") {
      if (selectedLocation !== "all") {
        const locationStock = product.locations.find(loc => loc.location === selectedLocation);
        matchesStatus = locationStock ? locationStock.status === statusFilter : false;
      } else {
        matchesStatus = product.locations.some(loc => loc.status === statusFilter);
      }
    }

    const matchesStorageTemperature = selectedStorageTemperature === "all" || product.storageTemperature === selectedStorageTemperature;

    return matchesSearch && matchesLocation && matchesStatus && matchesStorageTemperature;
  });

  const getStatusBadge = (status: string) => {
    const styles = {
      "out-of-stock": "bg-black text-white border-black",
      healthy: "bg-green-100 text-green-700 border-green-200",
      medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
      low: "bg-orange-100 text-orange-700 border-orange-200",
      critical: "bg-red-100 text-red-700 border-red-200",
      overstock: "bg-blue-100 text-blue-700 border-blue-200",
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
        <span className="px-2 py-1 rounded-full text-xs font-medium border bg-gray-100 text-gray-700 border-gray-200">
          {status}
        </span>
      );
    }

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${style}`}>
        {label}
      </span>
    );
  };

  const getLocationTypeBadge = (type: string) => {
    const styles = {
      warehouse: "bg-purple-100 text-purple-700 border-purple-200",
      store: "bg-blue-100 text-blue-700 border-blue-200",
      kitchen: "bg-orange-100 text-orange-700 border-orange-200",
    };
    const style = styles[type as keyof typeof styles];

    if (!style) {
      return (
        <span className="px-2 py-1 rounded text-xs font-medium border bg-gray-100 text-gray-700 border-gray-200">
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </span>
      );
    }

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium border ${style}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const stats = [
    { label: "Total Locations", value: locations.length, icon: Building2, color: "from-blue-500 to-cyan-500" },
    { label: "Total Products", value: products.length, icon: Package, color: "from-purple-500 to-indigo-500" },
    { label: "Critical/Out Alerts", value: locations.reduce((sum, loc) => sum + loc.criticalItems, 0), icon: AlertCircle, color: "from-red-500 to-zinc-800" },
    { label: "Low Stock Items", value: locations.reduce((sum, loc) => sum + loc.lowStockItems, 0), icon: TrendingDown, color: "from-orange-500 to-amber-500" },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">Multi-Location Tracking</h1>
          <p className="text-muted-foreground">Monitor inventory across all warehouses and stores</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-card rounded-2xl p-6 shadow-sm border border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-muted-foreground text-sm mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2 bg-muted rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setViewMode("products")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            viewMode === "products"
              ? "bg-primary text-white shadow-md"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="w-4 h-4 inline-block mr-2" />
          Products View
        </button>
        <button
          onClick={() => setViewMode("locations")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            viewMode === "locations"
              ? "bg-primary text-white shadow-md"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MapPin className="w-4 h-4 inline-block mr-2" />
          Locations View
        </button>
      </div>

      {/* Filters */}
      {viewMode === "products" && (
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by product name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
              />
            </div>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer text-sm"
            >
              <option value="all">All Locations</option>
              {locations.map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer text-sm"
            >
              <option value="all">All Status</option>
              <option value="out-of-stock">Out of Stock</option>
              <option value="critical">Critical Stock (1% - 10%)</option>
              <option value="low">Low Stock (11% - 30%)</option>
              <option value="medium">Medium Stock (31% - 70%)</option>
              <option value="healthy">Healthy Stock (71% - 100%)</option>
              <option value="overstock">Overstock</option>
            </select>
            <select
              value={selectedStorageTemperature}
              onChange={(e) => setSelectedStorageTemperature(e.target.value)}
              className="px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer text-sm"
            >
              <option value="all">All Storage Temps</option>
              {storageTemperatureOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      {viewMode === "products" ? (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-foreground">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-foreground">Product Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-foreground">Category</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Total Stock</th>
                  {selectedLocation === "all" ? (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-foreground">Location Stock Levels</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Current Stock</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Min / Max</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-primary text-sm">{product.id}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground text-sm font-medium">{product.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">{product.category}</td>
                    <td className="px-4 py-3 text-center text-foreground text-sm font-bold">
                      {formatQuantity(product.totalStock, product.unit)}
                    </td>
                    {selectedLocation === "all" ? (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {product.locations.map((loc, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded-lg">
                              <MapPin className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-foreground">{loc.location.split(' ')[0]}: {formatQuantity(loc.currentStock, product.unit)}</span>
                              {getStatusBadge(loc.status)}
                            </div>
                          ))}
                        </div>
                      </td>
                    ) : (
                      (() => {
                        const locationStock = product.locations.find(loc => loc.location === selectedLocation);
                        return locationStock ? (
                          <>
                            <td className="px-4 py-3 text-center text-foreground text-sm font-bold">
                              {formatQuantity(locationStock.currentStock, product.unit)}
                            </td>
                            <td className="px-4 py-3 text-center text-muted-foreground text-sm">
                              {formatQuantity(locationStock.minStock, product.unit)} / {formatQuantity(locationStock.maxStock, product.unit)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {getStatusBadge(locationStock.status)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-center text-muted-foreground text-sm">N/A</td>
                            <td className="px-4 py-3 text-center text-muted-foreground text-sm">N/A</td>
                            <td className="px-4 py-3 text-center text-muted-foreground text-sm">N/A</td>
                          </>
                        );
                      })()
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((location) => (
            <div key={location.id} className="bg-card rounded-xl p-4 shadow-sm border border-border hover:shadow-lg transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{location.name}</h3>
                    {getLocationTypeBadge(location.type)}
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3" />
                  {location.address}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Eye className="w-3 h-3" />
                  Manager: {location.manager}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Total Products</p>
                  <p className="text-sm font-bold text-foreground">{location.totalProducts}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Total Value</p>
                  <p className="text-sm font-bold text-foreground">₱{location.totalValue.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 bg-orange-50 border border-orange-200 rounded-lg p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingDown className="w-3 h-3 text-orange-600" />
                    <p className="text-xs text-orange-700 font-medium">Low Stock</p>
                  </div>
                  <p className="text-lg font-bold text-orange-700">{location.lowStockItems}</p>
                </div>
                <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <AlertCircle className="w-3 h-3 text-red-600" />
                    <p className="text-xs text-red-700 font-medium">Critical/Out</p>
                  </div>
                  <p className="text-lg font-bold text-red-700">{location.criticalItems}</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedLocation(location.name);
                  setViewMode("products");
                }}
                className="w-full mt-3 px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all text-xs font-medium flex items-center justify-center gap-2"
              >
                <BarChart3 className="w-3 h-3" />
                View Inventory
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
