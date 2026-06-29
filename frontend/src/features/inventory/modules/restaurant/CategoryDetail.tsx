import { useSearchParams, useNavigate } from "react-router";
import { ArrowLeft, Package, AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { splitCategory } from "../lib/inventoryLogic";
import { useRestaurantInventoryQuery } from "../lib/restaurant";
import { InlineDataLoading } from "../shared/InlineDataLoading";

type CategoryItem = {
  id: number;
  name: string;
  sku: string;
  subCategory: string;
  stock: number;
  maxStock: number;
  price: number;
  expiry: string;
  location: string;
  unit?: string;
};

export function CategoryDetail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const category = searchParams.get("category") || "";
  const subCategory = searchParams.get("sub") || "";

  // Sample data - in real app this would come from API/state
  const categoryItems: CategoryItem[] = [
    // Meat items
    { id: 1, name: "Organic Chicken Breast", sku: "MET-CHK-001", subCategory: "Poultry", stock: 45, maxStock: 100, price: 12.99, expiry: "2024-05-30", location: "Cold Storage B" },
    { id: 2, name: "Chicken Wings", sku: "MET-CHK-002", subCategory: "Poultry", stock: 28, maxStock: 80, price: 8.99, expiry: "2024-05-29", location: "Cold Storage B" },
    { id: 3, name: "Chicken Thighs", sku: "MET-CHK-003", subCategory: "Poultry", stock: 8, maxStock: 60, price: 9.99, expiry: "2024-05-28", location: "Cold Storage B" },
    { id: 4, name: "Whole Chicken", sku: "MET-CHK-004", subCategory: "Poultry", stock: 0, maxStock: 40, price: 15.99, expiry: "2024-05-27", location: "Cold Storage B" },

    { id: 5, name: "Grass-Fed Ground Beef", sku: "MET-BEF-001", subCategory: "Beef", stock: 35, maxStock: 80, price: 9.99, expiry: "2024-05-29", location: "Cold Storage A" },
    { id: 6, name: "Ribeye Steak", sku: "MET-BEF-002", subCategory: "Beef", stock: 18, maxStock: 50, price: 24.99, expiry: "2024-05-30", location: "Cold Storage A" },
    { id: 7, name: "Sirloin Steak", sku: "MET-BEF-003", subCategory: "Beef", stock: 5, maxStock: 50, price: 19.99, expiry: "2024-05-28", location: "Cold Storage A" },
    { id: 8, name: "Beef Tenderloin", sku: "MET-BEF-004", subCategory: "Beef", stock: 0, maxStock: 30, price: 32.99, expiry: "2024-05-27", location: "Cold Storage A" },

    { id: 9, name: "Pork Chops", sku: "MET-PRK-001", subCategory: "Pork", stock: 42, maxStock: 70, price: 11.99, expiry: "2024-05-30", location: "Cold Storage B" },
    { id: 10, name: "Pork Tenderloin", sku: "MET-PRK-002", subCategory: "Pork", stock: 22, maxStock: 60, price: 14.99, expiry: "2024-05-29", location: "Cold Storage B" },
    { id: 11, name: "Ground Pork", sku: "MET-PRK-003", subCategory: "Pork", stock: 6, maxStock: 50, price: 8.99, expiry: "2024-05-28", location: "Cold Storage B" },
    { id: 12, name: "Bacon Strips", sku: "MET-PRK-004", subCategory: "Pork", stock: 55, maxStock: 100, price: 7.99, expiry: "2024-06-05", location: "Refrigerator 1" },

    // Seafood items
    { id: 13, name: "Fresh Salmon Fillet", sku: "SEA-FSH-001", subCategory: "Fish", stock: 32, maxStock: 80, price: 24.99, expiry: "2024-05-28", location: "Cold Storage A" },
    { id: 14, name: "Wild-Caught Tuna", sku: "SEA-FSH-002", subCategory: "Fish", stock: 18, maxStock: 60, price: 19.99, expiry: "2024-05-29", location: "Cold Storage A" },
    { id: 15, name: "Cod Fillet", sku: "SEA-FSH-003", subCategory: "Fish", stock: 7, maxStock: 50, price: 16.99, expiry: "2024-05-27", location: "Cold Storage A" },
    { id: 16, name: "Tilapia", sku: "SEA-FSH-004", subCategory: "Fish", stock: 0, maxStock: 70, price: 12.99, expiry: "2024-05-26", location: "Cold Storage A" },

    { id: 17, name: "Jumbo Shrimp", sku: "SEA-SHL-001", subCategory: "Shellfish", stock: 28, maxStock: 60, price: 18.99, expiry: "2024-05-28", location: "Cold Storage A" },
    { id: 18, name: "Lobster Tail", sku: "SEA-SHL-002", subCategory: "Shellfish", stock: 12, maxStock: 40, price: 34.99, expiry: "2024-05-27", location: "Cold Storage A" },
    { id: 19, name: "Crab Legs", sku: "SEA-SHL-003", subCategory: "Shellfish", stock: 4, maxStock: 30, price: 28.99, expiry: "2024-05-27", location: "Cold Storage A" },

    // Fruits
    { id: 20, name: "Strawberries 1lb", sku: "FRT-BRY-001", subCategory: "Berries", stock: 65, maxStock: 100, price: 4.99, expiry: "2024-05-29", location: "Produce Section" },
    { id: 21, name: "Blueberries 1lb", sku: "FRT-BRY-002", subCategory: "Berries", stock: 48, maxStock: 80, price: 6.99, expiry: "2024-05-30", location: "Produce Section" },
    { id: 22, name: "Raspberries", sku: "FRT-BRY-003", subCategory: "Berries", stock: 9, maxStock: 60, price: 5.99, expiry: "2024-05-28", location: "Produce Section" },
    { id: 23, name: "Blackberries", sku: "FRT-BRY-004", subCategory: "Berries", stock: 0, maxStock: 50, price: 5.49, expiry: "2024-05-27", location: "Produce Section" },

    // Dairy
    { id: 24, name: "Aged Cheddar Cheese", sku: "DRY-CHE-001", subCategory: "Cheese", stock: 42, maxStock: 80, price: 8.99, expiry: "2024-07-10", location: "Refrigerator 2" },
    { id: 25, name: "Mozzarella", sku: "DRY-CHE-002", subCategory: "Cheese", stock: 35, maxStock: 70, price: 7.99, expiry: "2024-06-15", location: "Refrigerator 2" },
    { id: 26, name: "Swiss Cheese", sku: "DRY-CHE-003", subCategory: "Cheese", stock: 8, maxStock: 50, price: 9.99, expiry: "2024-06-20", location: "Refrigerator 2" },
    { id: 27, name: "Blue Cheese", sku: "DRY-CHE-004", subCategory: "Cheese", stock: 0, maxStock: 40, price: 12.99, expiry: "2024-06-10", location: "Refrigerator 2" },
  ];

  const { data: inventoryProducts = [], isLoading: inventoryLoading } = useRestaurantInventoryQuery();
  const liveCategoryItems = inventoryProducts
    .filter((item) => {
      const { main } = splitCategory(item.category);
      return !category || main === category;
    })
    .map((item) => {
      const { sub } = splitCategory(item.category);
      return {
        id: item.id,
        name: item.name,
        sku: item.sku,
        subCategory: sub,
        stock: item.stock,
        maxStock: item.maxStock,
        price: item.price,
        expiry: item.expiry,
        location: item.location || "Unassigned",
        unit: item.unit || "pcs",
      };
    });

  const filteredItems = liveCategoryItems.filter(item => {
    if (subCategory && subCategory !== "all") {
      return item.subCategory === subCategory;
    }
    return true;
  });

  const getStockStatus = (stock: number, maxStock: number) => {
    const percentage = (stock / maxStock) * 100;

    if (stock === 0) {
      return {
        color: "bg-black text-white border-black",
        label: "Out of Stock",
        percentage: 0,
        barColor: "bg-black"
      };
    } else if (percentage <= 10) {
      return {
        color: "bg-red-100 text-red-700 border-red-200",
        label: "Critical Stock",
        percentage: Math.round(percentage),
        barColor: "bg-red-500"
      };
    } else if (percentage <= 30) {
      return {
        color: "bg-orange-100 text-orange-700 border-orange-200",
        label: "Low Stock",
        percentage: Math.round(percentage),
        barColor: "bg-orange-500"
      };
    } else if (percentage <= 70) {
      return {
        color: "bg-yellow-100 text-yellow-800 border-yellow-200",
        label: "Medium Stock",
        percentage: Math.round(percentage),
        barColor: "bg-yellow-500"
      };
    } else {
      return {
        color: "bg-green-100 text-green-700 border-green-200",
        label: "Healthy Stock",
        percentage: Math.round(percentage),
        barColor: "bg-green-500"
      };
    }
  };

  const stats = {
    total: filteredItems.length,
    outOfStock: filteredItems.filter(i => i.stock === 0).length,
    critical: filteredItems.filter(i => {
      const pct = (i.stock / i.maxStock) * 100;
      return i.stock > 0 && pct <= 10;
    }).length,
    low: filteredItems.filter(i => {
      const pct = (i.stock / i.maxStock) * 100;
      return pct > 10 && pct <= 30;
    }).length,
    medium: filteredItems.filter(i => {
      const pct = (i.stock / i.maxStock) * 100;
      return pct > 30 && pct <= 70;
    }).length,
    healthy: filteredItems.filter(i => {
      const pct = (i.stock / i.maxStock) * 100;
      return pct > 70 && pct <= 100;
    }).length,
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        <h1 className="text-xl font-bold text-foreground mb-2">
          {category} {subCategory && subCategory !== "all" ? `> ${subCategory}` : ""}
        </h1>
        <p className="text-muted-foreground">Detailed stock information and status</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-1.5 mb-8">
        <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-primary" />
            <p className="text-sm text-muted-foreground">Total Items</p>
          </div>
          <p className="text-sm font-bold text-foreground">{stats.total}</p>
        </div>

        <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-black"></div>
            <p className="text-sm text-muted-foreground">Out of Stock</p>
          </div>
          <p className="text-sm font-bold text-foreground">{stats.outOfStock}</p>
        </div>

        <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-red-500"></div>
            <p className="text-sm text-muted-foreground">Critical (1-10%)</p>
          </div>
          <p className="text-sm font-bold text-foreground">{stats.critical}</p>
        </div>

        <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-orange-500"></div>
            <p className="text-sm text-muted-foreground">Low (11-30%)</p>
          </div>
          <p className="text-sm font-bold text-foreground">{stats.low}</p>
        </div>

        <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-yellow-500"></div>
            <p className="text-sm text-muted-foreground">Medium (31-70%)</p>
          </div>
          <p className="text-sm font-bold text-foreground">{stats.medium}</p>
        </div>

        <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-green-500"></div>
            <p className="text-sm text-muted-foreground">Healthy (71-100%)</p>
          </div>
          <p className="text-sm font-bold text-foreground">{stats.healthy}</p>
        </div>
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((item) => {
          const status = getStockStatus(item.stock, item.maxStock);

          return (
            <div
              key={item.id}
              className="bg-card rounded-2xl p-2 shadow-sm border border-border hover:shadow-md transition-all duration-200"
            >
              {/* Item Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-6">{item.name}</h3>
                  <p className="text-sm text-muted-foreground">{item.sku}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${status.color} whitespace-nowrap`}>
                  {status.label}
                </span>
              </div>

              {/* Stock Progress Bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Stock Level</span>
                  <span className="text-sm font-medium text-foreground">{status.percentage}%</span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${status.barColor} transition-all duration-300`}
                    style={{ width: `${status.percentage}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">{item.stock} {item.unit}</span>
                  <span className="text-xs text-muted-foreground">Max: {item.maxStock} {item.unit}</span>
                </div>
              </div>

              {/* Item Details */}
              <div className="space-y-2 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Category</span>
                  <span className="text-foreground font-medium">{item.subCategory}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Price</span>
                  <span className="text-foreground font-medium">₱{item.price}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Location</span>
                  <span className="text-foreground font-medium">{item.location}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Expiry</span>
                  <span className="text-foreground font-medium">{item.expiry}</span>
                </div>
              </div>

              {/* Action Indicators */}
              {item.stock === 0 && (
                <div className="mt-4 p-3 bg-black rounded-2xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-white" />
                  <span className="text-sm text-white">Out of stock</span>
                </div>
              )}
              {item.stock > 0 && status.percentage <= 10 && (
                <div className="mt-4 p-3 bg-red-50 rounded-2xl flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-red-700">Critical stock</span>
                </div>
              )}
              {status.percentage >= 71 && status.percentage <= 100 && (
                <div className="mt-4 p-3 bg-green-50 rounded-2xl flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700">Stock healthy</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

        {inventoryLoading ? (
          <InlineDataLoading label="Loading category items…" className="col-span-full" />
        ) : filteredItems.length === 0 && (
        <div className="py-12 text-center">
          <Package className="w-16 h-16 text-muted-foreground mx-auto mb-6" />
          <p className="text-muted-foreground">No items found in this category</p>
        </div>
      )}
    </div>
  );
}
