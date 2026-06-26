import { useState } from "react";
import { MapPin, Search, Package, TrendingDown, AlertCircle, Building2, BarChart3, Eye, ArrowLeftRight, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useRestaurantInventoryQuery, useRestaurantStorageTemperatureOptionsQuery } from "../lib/restaurant";
import { formatQuantity, getStockStatus, splitCategory, StockStatus } from "../lib/inventoryLogic";
import { useLocationsQuery, useDomainMutation, domainQueryKeys } from "../lib/domainQueries";
import { createLocation } from "../../app/api/client";
import { useSession } from "../../app/hooks/useSession";

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

  const { currentUser } = useSession();
  const isAdmin = currentUser?.role === "Admin";
  const { data: apiLocations = [] } = useLocationsQuery();
  const createLocationMutation = useDomainMutation(createLocation, [domainQueryKeys.locations]);

  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newManager, setNewManager] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("Location name is required.");
      return;
    }
    try {
      await createLocationMutation.mutateAsync({
        name: newName.trim(),
        address: newAddress.trim(),
        manager: newManager.trim(),
        phone: newPhone.trim(),
      });
      toast.success(`Location "${newName.trim()}" added.`);
      setShowAddLocation(false);
      setNewName("");
      setNewAddress("");
      setNewManager("");
      setNewPhone("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add location.");
    }
  };

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

  // Merge real locations from the API (so newly added / empty locations appear,
  // not just those derived from products that reference a location).
  const derivedLocationNames = new Set(locations.map(loc => loc.name.toLowerCase()));
  const mergedLocations: Location[] = [
    ...locations,
    ...apiLocations
      .filter(loc => !derivedLocationNames.has((loc.name ?? "").toLowerCase()))
      .map(loc => ({
        id: loc.id,
        name: loc.name,
        type: "warehouse" as const,
        address: loc.address || "—",
        manager: loc.manager || "Unassigned",
        totalProducts: loc.itemCount ?? 0,
        lowStockItems: 0,
        criticalItems: 0,
        totalValue: 0,
      })),
  ];

  const filteredProducts = products.filter(product => {
    const matchesSearch = (product.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (product.id || '').toLowerCase().includes(searchQuery.toLowerCase());

    let matchesLocation = true;
    if (selectedLocation !== "all") {
      matchesLocation = product.locations.some(loc => loc.location === selectedLocation);
    }

    // "critical-out" is a combined alert filter (matches critical OR out-of-stock).
    const statusMatches = (status: string) =>
      statusFilter === "critical-out"
        ? status === "critical" || status === "out-of-stock"
        : status === statusFilter;

    let matchesStatus = true;
    if (statusFilter !== "all") {
      if (selectedLocation !== "all") {
        const locationStock = product.locations.find(loc => loc.location === selectedLocation);
        matchesStatus = locationStock ? statusMatches(locationStock.status) : false;
      } else {
        matchesStatus = product.locations.some(loc => statusMatches(loc.status));
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
        <span className="px-2 py-1 rounded-full text-xs font-medium border bg-muted text-muted-foreground border-border">
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
        <span className="px-2 py-1 rounded text-xs font-medium border bg-muted text-muted-foreground border-border">
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

  // Cards drive the view + status filter below. Total Locations opens the
  // Locations view; the others open the Products view filtered by stock status
  // (clicking the active card clears the status filter back to "all").
  const focusLocations = () => setViewMode("locations");
  const focusProducts = (status: string) => {
    setViewMode("products");
    setStatusFilter((current) => (current === status ? "all" : status));
  };

  const stats: Array<{
    label: string;
    value: number;
    icon: typeof Building2;
    color: string;
    view: "locations" | "products";
    filter?: string;
  }> = [
    { label: "Total Locations", value: mergedLocations.length, icon: Building2, color: "from-blue-500 to-cyan-500", view: "locations" },
    { label: "Total Products", value: products.length, icon: Package, color: "from-purple-500 to-indigo-500", view: "products", filter: "all" },
    { label: "Critical/Out Alerts", value: locations.reduce((sum, loc) => sum + loc.criticalItems, 0), icon: AlertCircle, color: "from-red-500 to-zinc-800", view: "products", filter: "critical-out" },
    { label: "Low Stock Items", value: locations.reduce((sum, loc) => sum + loc.lowStockItems, 0), icon: TrendingDown, color: "from-orange-500 to-amber-500", view: "products", filter: "low" },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">Multi-Location Tracking</h1>
          <p className="text-muted-foreground">Monitor inventory across all warehouses and stores</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddLocation(true)}
            className="mt-4 md:mt-0 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-sm transition-all duration-200 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Location
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const isActive =
            stat.view === "locations"
              ? viewMode === "locations"
              : viewMode === "products" && statusFilter === stat.filter;
          return (
            <button
              key={index}
              type="button"
              onClick={() => (stat.view === "locations" ? focusLocations() : focusProducts(stat.filter!))}
              aria-pressed={isActive}
              aria-label={`Filter by ${stat.label}`}
              className={`group text-left w-full bg-card rounded-2xl p-6 shadow-sm border cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/25 hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-lg active:shadow-primary/30 ${
                isActive ? "border-primary bg-primary/5 shadow-md shadow-primary/20" : "border-border"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-muted-foreground text-sm mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </button>
          );
        })}
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2 bg-muted rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setViewMode("products")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
            viewMode === "products"
              ? "bg-primary text-white shadow-md"
              : "text-muted-foreground hover:text-foreground hover:bg-background/70 hover:shadow-sm"
          }`}
        >
          <Package className="w-4 h-4 inline-block mr-2" />
          Products View
        </button>
        <button
          onClick={() => setViewMode("locations")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
            viewMode === "locations"
              ? "bg-primary text-white shadow-md"
              : "text-muted-foreground hover:text-foreground hover:bg-background/70 hover:shadow-sm"
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
              <option value="critical-out">Critical / Out of Stock</option>
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
          {mergedLocations.map((location) => (
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

      {isAdmin && showAddLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddLocation(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Add Location</h2>
              <button onClick={() => setShowAddLocation(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddLocation} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Name<span className="text-red-500"> *</span></label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="e.g. Main Warehouse" className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Address</label>
                <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="e.g. 123 Main St" className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Manager</label>
                <input value={newManager} onChange={(e) => setNewManager(e.target.value)} placeholder="e.g. Jane Doe" className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Phone</label>
                <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="e.g. 0917..." className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddLocation(false)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
                <button type="submit" disabled={createLocationMutation.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60">
                  {createLocationMutation.isPending ? "Adding..." : "Add Location"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
