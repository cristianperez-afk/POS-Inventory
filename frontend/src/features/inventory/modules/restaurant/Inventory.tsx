import { useState } from "react";
import { Search, Edit, Archive, ArchiveRestore, AlertCircle, X, Save, ChevronRight, ChevronDown, Folder, FolderOpen, Package, PlusCircle, History, Sparkles, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../../app/hooks/useSession";
import { formatQuantity } from "../lib/inventoryLogic";
import { CostHistoryModal } from "../shared/costing/CostHistoryModal";
import {
  useRestaurantCategoryHierarchyQuery,
  useRestaurantInventoryQuery,
  useRestaurantLocationsQuery,
  useRestaurantStorageTemperatureOptionsQuery,
  useUpdateRestaurantInventoryMutation,
  useUpsertRestaurantCategoryHierarchyMutation,
} from "../lib/restaurant";
import { AddProduct } from "./AddProduct";
import { getManilaDateKey } from "../../../../shared/utils/date";

type Product = {
  id: number;
  backendId?: string;
  locationId?: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  maxStock: number;
  minStock?: number;
  reorderPoint?: number;
  price: number;
  expiry: string;
  expiryPeriod?: string;
  location?: string;
  unit: string;
  purchaseUnit?: string;
  baseUnit?: string;
  conversionFactor?: number;
  storageTemperature?: string;
  isActive?: boolean;
  isRecent?: boolean;
  addedDate?: string;
};

const EXPIRY_PERIOD_OPTIONS = [
  "Early Morning",
  "Morning",
  "Afternoon",
  "Evening",
  "Midnight",
];

export function Inventory() {
  const { currentUser } = useSession();
  const userRole = currentUser?.role === "Admin" ? "admin" : "staff";
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedMainCategories, setExpandedMainCategories] = useState<Set<string>>(new Set());
  const [expandedSubCategories, setExpandedSubCategories] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showInitialStockModal, setShowInitialStockModal] = useState(false);
  const [pendingDeactivateId, setPendingDeactivateId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [expiryPeriodFilter, setExpiryPeriodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [costHistoryItem, setCostHistoryItem] = useState<{ id: string; name: string } | null>(null);
  const [showRecentModal, setShowRecentModal] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [categoryDraftName, setCategoryDraftName] = useState("");
  const [editingSubCategory, setEditingSubCategory] = useState<{ category: string; subCategory: string } | null>(null);
  const [subCategoryDraftName, setSubCategoryDraftName] = useState("");

  // Hierarchical category structure — read from persisted backend settings so
  // categories added via Initial Stock Setup appear here immediately.
  const { data: categoryHierarchy = {} } = useRestaurantCategoryHierarchyQuery();
  const { data: storageTemperatureOptions = [] } = useRestaurantStorageTemperatureOptionsQuery();

  const { data: products = [] } = useRestaurantInventoryQuery<Product[]>();
  const { data: locations = [] } = useRestaurantLocationsQuery();
  const updateProduct = useUpdateRestaurantInventoryMutation();
  const saveCategoryHierarchy = useUpsertRestaurantCategoryHierarchyMutation();

  // Inventory lists raw ingredients/supplies only. "Menu Items" is a menu/recipe
  // grouping (present in the default hierarchy) and must not appear as an
  // inventory category folder.
  const mainCategories = Object.keys(categoryHierarchy).filter(
    (category) => category !== "Menu Items",
  );

  const toggleMainCategory = (category: string) => {
    const newExpanded = new Set(expandedMainCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
      // Also collapse all subcategories under this main category
      const newSubExpanded = new Set(expandedSubCategories);
      categoryHierarchy[category]?.forEach(sub => {
        newSubExpanded.delete(`${category} > ${sub}`);
      });
      setExpandedSubCategories(newSubExpanded);
    } else {
      newExpanded.add(category);
    }
    setExpandedMainCategories(newExpanded);
  };

  const toggleSubCategory = (mainCategory: string, subCategory: string) => {
    const key = `${mainCategory} > ${subCategory}`;
    const newExpanded = new Set(expandedSubCategories);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSubCategories(newExpanded);
  };

  const getProductsInCategory = (mainCategory: string, subCategory: string) => {
    return products.filter(p => {
      const categoryKey = `${mainCategory} > ${subCategory}`;
      const matchesCategory = p.category === categoryKey;
      const matchesSearch = searchQuery === "" ||
        (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesExpiryPeriod = expiryPeriodFilter === "all" || (p.expiryPeriod || "") === expiryPeriodFilter;
      const matchesStatus = statusFilter === "all" ||
        getStockStatus(p.stock, p.maxStock, p.minStock, p.reorderPoint).label === statusFilter;
      // Archived (deactivated) items are hidden unless the user opts to see them.
      const matchesArchived = showArchived || p.isActive !== false;
      return matchesCategory && matchesSearch && matchesExpiryPeriod && matchesStatus && matchesArchived;
    });
  };

  // Both search and the status tiles narrow the tree; either should auto-expand
  // folders so matching products are visible without manual drilling.
  const isTreeFiltered = searchQuery !== "" || statusFilter !== "all";

  // Clicking a status tile filters the tree by that status; clicking the active
  // tile again (or the Total tile) clears the filter.
  const toggleStatusFilter = (status: string) => {
    setStatusFilter((current) => (current === status ? "all" : status));
  };

  const getProductCountInSubCategory = (mainCategory: string, subCategory: string) => {
    return getProductsInCategory(mainCategory, subCategory).length;
  };

  const getProductCountInMainCategory = (mainCategory: string) => {
    if (searchQuery === "" && statusFilter === "all") {
      return products.filter(p => p.category.startsWith(mainCategory + " > ")).length;
    }
    return categoryHierarchy[mainCategory]?.reduce((count, sub) =>
      count + getProductsInCategory(mainCategory, sub).length, 0) ?? 0;
  };

  const handleEdit = (product: Product) => {
    setEditingProduct({ ...product });
    setShowEditModal(true);
  };

  // Food Inventory only edits the per-row operational fields that genuinely belong to
  // a specific batch/location — expiry date and storage temperature. Shared master data
  // (name, category, price, stock thresholds) is edited in Product Management, so it
  // isn't duplicated (or silently overwritten) here.
  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    try {
      await updateProduct.mutateAsync({
        id: editingProduct.backendId ?? String(editingProduct.id),
        data: {
          expiryDate: editingProduct.expiry
            ? new Date(`${editingProduct.expiry}T00:00:00`).toISOString()
            : undefined,
          expiryPeriod: editingProduct.expiryPeriod || undefined,
          storageTemperature: editingProduct.storageTemperature || undefined,
        },
      });
      setShowEditModal(false);
      setEditingProduct(null);
      toast.success("Storage details updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update inventory item");
    }
  };

  // Soft delete: deactivating archives the item (isActive=false) instead of removing
  // the row, so recipes/sales/PO references that point at it stay intact. Reactivating
  // simply flips it back.
  const handleDeactivate = (id: number) => {
    setPendingDeactivateId(id);
  };

  const confirmDeactivate = async () => {
    if (pendingDeactivateId === null) return;
    const product = products.find((item) => item.id === pendingDeactivateId);
    setPendingDeactivateId(null);
    if (!product) return;
    try {
      await updateProduct.mutateAsync({
        id: product.backendId ?? String(product.id),
        data: { isActive: false },
      });
      toast.success(`"${product.name}" archived`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive inventory item");
    }
  };

  const handleReactivate = async (product: Product) => {
    try {
      await updateProduct.mutateAsync({
        id: product.backendId ?? String(product.id),
        data: { isActive: true },
      });
      toast.success(`"${product.name}" reactivated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reactivate inventory item");
    }
  };

  const startCategoryRename = (category: string) => {
    setEditingCategoryName(category);
    setCategoryDraftName(category);
  };

  const startSubCategoryRename = (category: string, subCategory: string) => {
    setEditingSubCategory({ category, subCategory });
    setSubCategoryDraftName(subCategory);
  };

  const handleRenameCategory = async () => {
    const oldName = editingCategoryName;
    const nextName = categoryDraftName.trim();
    if (!oldName || !nextName || oldName === nextName) {
      setEditingCategoryName("");
      setCategoryDraftName("");
      return;
    }
    if (categoryHierarchy[nextName]) {
      toast.error(`Category "${nextName}" already exists`);
      return;
    }

    const nextHierarchy = Object.fromEntries(
      Object.entries(categoryHierarchy).map(([category, subCategories]) => [
        category === oldName ? nextName : category,
        subCategories,
      ]),
    );

    const affectedProducts = products.filter((product) =>
      product.category.startsWith(`${oldName} > `),
    );

    try {
      await saveCategoryHierarchy.mutateAsync(nextHierarchy);
      await Promise.all(
        affectedProducts.map((product) =>
          updateProduct.mutateAsync({
            id: product.backendId ?? String(product.id),
            data: {
              category: product.category.replace(`${oldName} > `, `${nextName} > `),
            },
          }),
        ),
      );
      setExpandedMainCategories((current) => {
        const next = new Set(current);
        if (next.delete(oldName)) next.add(nextName);
        return next;
      });
      setExpandedSubCategories((current) => {
        const next = new Set<string>();
        current.forEach((key) => {
          next.add(key.startsWith(`${oldName} > `) ? key.replace(`${oldName} > `, `${nextName} > `) : key);
        });
        return next;
      });
      setEditingCategoryName("");
      setCategoryDraftName("");
      toast.success(`Category renamed to "${nextName}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename category");
    }
  };

  const handleRenameSubCategory = async () => {
    if (!editingSubCategory) return;
    const { category, subCategory } = editingSubCategory;
    const nextName = subCategoryDraftName.trim();
    if (!nextName || subCategory === nextName) {
      setEditingSubCategory(null);
      setSubCategoryDraftName("");
      return;
    }
    const siblings = categoryHierarchy[category] || [];
    if (siblings.some((item) => item.toLowerCase() === nextName.toLowerCase() && item !== subCategory)) {
      toast.error(`Subcategory "${nextName}" already exists in ${category}`);
      return;
    }

    const oldCategoryKey = `${category} > ${subCategory}`;
    const nextCategoryKey = `${category} > ${nextName}`;
    const nextHierarchy = {
      ...categoryHierarchy,
      [category]: siblings.map((item) => (item === subCategory ? nextName : item)),
    };
    const affectedProducts = products.filter((product) => product.category === oldCategoryKey);

    try {
      await saveCategoryHierarchy.mutateAsync(nextHierarchy);
      await Promise.all(
        affectedProducts.map((product) =>
          updateProduct.mutateAsync({
            id: product.backendId ?? String(product.id),
            data: { category: nextCategoryKey },
          }),
        ),
      );
      setExpandedSubCategories((current) => {
        const next = new Set(current);
        if (next.delete(oldCategoryKey)) next.add(nextCategoryKey);
        return next;
      });
      setEditingSubCategory(null);
      setSubCategoryDraftName("");
      toast.success(`Subcategory renamed to "${nextName}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename subcategory");
    }
  };

  const getStockStatus = (stock: number, maxStock: number, minStock?: number, reorderPoint?: number) => {
    if (stock <= 0) {
      return { color: "bg-black text-white border-black", label: "Out of Stock", textColor: "text-black" };
    }
    const criticalThreshold = (minStock !== undefined && minStock > 0) ? minStock : (maxStock * 0.1);
    if (stock <= criticalThreshold) {
      return { color: "bg-red-100 text-red-700 border-red-200", label: "Critical Stock", textColor: "text-red-600" };
    }
    const lowThreshold = (reorderPoint !== undefined && reorderPoint > 0) ? reorderPoint : (maxStock * 0.3);
    if (stock <= lowThreshold) {
      return { color: "bg-orange-100 text-orange-700 border-orange-200", label: "Low Stock", textColor: "text-orange-600" };
    }
    const percentage = maxStock > 0 ? (stock / maxStock) * 100 : 100;
    if (percentage <= 70) {
      return { color: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Medium Stock", textColor: "text-yellow-700" };
    }
    if (percentage <= 100) {
      return { color: "bg-green-100 text-green-700 border-green-200", label: "Healthy Stock", textColor: "text-green-600" };
    }
    return { color: "bg-teal-100 text-teal-700 border-teal-200", label: "Overstock", textColor: "text-teal-600" };
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
          {products.filter((p) => p.isRecent).length > 0 && (
            <button
              type="button"
              onClick={() => setShowRecentModal(true)}
              title="View recently added items"
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {products.filter((p) => p.isRecent).length} recently added
            </button>
          )}
        </div>
        {userRole === "admin" && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCategoryManager(true)}
              className="px-4 py-2 bg-muted text-foreground border border-border rounded-xl hover:bg-muted/80 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-sm transition-all duration-200 text-sm font-medium flex items-center gap-2"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Customize Categories
            </button>
            <button
              onClick={() => setShowInitialStockModal(true)}
              className="px-4 py-2 bg-muted text-foreground border border-border rounded-xl hover:bg-muted/80 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-sm transition-all duration-200 text-sm font-medium flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Initial Stock Setup
            </button>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-border mb-8">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
          <label className="flex items-center gap-2 px-4 py-3 text-sm text-foreground bg-input-background border border-input rounded-xl cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-primary"
            />
            Show archived
          </label>
          <select
            value={expiryPeriodFilter}
            onChange={(e) => setExpiryPeriodFilter(e.target.value)}
            className="px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all whitespace-nowrap"
          >
            <option value="all">All expiry periods</option>
            {EXPIRY_PERIOD_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        {/* Stats Row — click a tile to filter the tree by stock status */}
        <div className="grid grid-cols-6 gap-4 mt-4 pt-4 border-t border-border">
          {[
            { status: "all", label: "Total", valueClass: "text-foreground", count: products.length },
            { status: "Out of Stock", label: "Out", valueClass: "text-black", count: products.filter(p => getStockStatus(p.stock, p.maxStock, p.minStock, p.reorderPoint).label === "Out of Stock").length },
            { status: "Critical Stock", label: "Critical", valueClass: "text-red-600", count: products.filter(p => getStockStatus(p.stock, p.maxStock, p.minStock, p.reorderPoint).label === "Critical Stock").length },
            { status: "Low Stock", label: "Low", valueClass: "text-orange-600", count: products.filter(p => getStockStatus(p.stock, p.maxStock, p.minStock, p.reorderPoint).label === "Low Stock").length },
            { status: "Medium Stock", label: "Medium", valueClass: "text-yellow-700", count: products.filter(p => getStockStatus(p.stock, p.maxStock, p.minStock, p.reorderPoint).label === "Medium Stock").length },
            { status: "Healthy Stock", label: "Healthy", valueClass: "text-green-600", count: products.filter(p => getStockStatus(p.stock, p.maxStock, p.minStock, p.reorderPoint).label === "Healthy Stock").length },
          ].map((tile) => {
            const isActive = statusFilter === tile.status;
            return (
              <button
                type="button"
                key={tile.label}
                onClick={() => toggleStatusFilter(tile.status)}
                aria-pressed={isActive}
                aria-label={`Filter by ${tile.label}`}
                className={`group text-center rounded-xl py-3 px-2 border transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/25 hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-md ${
                  isActive ? "border-primary bg-primary/5 shadow-md shadow-primary/20" : "border-transparent"
                }`}
              >
                <p className={`text-xl font-bold ${tile.valueClass}`}>{tile.count}</p>
                <p className="text-muted-foreground text-sm">{tile.label}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Folder Tree View */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden p-4">
        <div className="space-y-4">
          {mainCategories.map((mainCategory) => {
            const hasMatchingProducts = isTreeFiltered &&
              (categoryHierarchy[mainCategory]?.some(sub => getProductsInCategory(mainCategory, sub).length > 0) ?? false);
            const isMainExpanded = expandedMainCategories.has(mainCategory) || hasMatchingProducts;
            const mainCategoryCount = getProductCountInMainCategory(mainCategory);

            return (
              <div key={mainCategory} className="border border-border rounded-2xl overflow-hidden">
                {/* Main Category Folder */}
                <div
                  className="flex items-center gap-3 p-4 bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => toggleMainCategory(mainCategory)}
                >
                  {isMainExpanded ? (
                    <ChevronDown className="w-6 h-6 text-primary flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-6 h-6 text-muted-foreground flex-shrink-0" />
                  )}
                  {isMainExpanded ? (
                    <FolderOpen className="w-7 h-7 text-primary flex-shrink-0" />
                  ) : (
                    <Folder className="w-7 h-7 text-orange-500 flex-shrink-0" />
                  )}
                  <span className="font-semibold text-foreground flex-1 text-base">{mainCategory}</span>
                  {userRole === "admin" && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        startCategoryRename(mainCategory);
                        setShowCategoryManager(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      aria-label={`Rename ${mainCategory}`}
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Rename
                    </button>
                  )}
                  <span className="text-sm text-muted-foreground bg-background px-3 py-1 rounded-full">
                    {mainCategoryCount}
                  </span>
                </div>

                {/* Subcategories */}
                {isMainExpanded && (
                  <div className="bg-background">
                    {categoryHierarchy[mainCategory].map((subCategory) => {
                      const subKey = `${mainCategory} > ${subCategory}`;
                      const subCategoryProducts = getProductsInCategory(mainCategory, subCategory);
                      const subCount = subCategoryProducts.length;
                      const isSubExpanded = expandedSubCategories.has(subKey) || (isTreeFiltered && subCount > 0);

                      if (isTreeFiltered && subCount === 0) return null;

                      return (
                        <div key={subKey} className="border-l border-primary/20 ml-4">
                          {/* Subcategory Folder */}
                          <div
                            className="flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                            onClick={() => toggleSubCategory(mainCategory, subCategory)}
                          >
                            {isSubExpanded ? (
                              <ChevronDown className="w-5 h-5 text-primary flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                            )}
                            {isSubExpanded ? (
                              <FolderOpen className="w-6 h-6 text-primary flex-shrink-0" />
                            ) : (
                              <Folder className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                            )}
                            <span className="font-medium text-foreground flex-1">{subCategory}</span>
                            {userRole === "admin" && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startSubCategoryRename(mainCategory, subCategory);
                                  setShowCategoryManager(true);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                aria-label={`Rename ${subCategory}`}
                              >
                                <Edit className="w-3.5 h-3.5" />
                                Rename
                              </button>
                            )}
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                              {subCount}
                            </span>
                          </div>

                          {/* Products in Subcategory */}
                          {isSubExpanded && (
                            <div className="ml-3 space-y-4 py-1">
                              {subCategoryProducts.map((product) => (
                                <div
                                  key={product.id}
                                  className="flex items-center gap-2 overflow-hidden p-2 bg-card border border-border rounded-lg hover:shadow-md transition-all"
                                >
                                  <Package className="w-5 h-5 text-primary flex-shrink-0" />

                                  <div className="min-w-0 flex-1 grid grid-cols-[minmax(150px,2fr)_minmax(105px,1fr)_minmax(115px,1fr)_minmax(95px,0.85fr)_minmax(145px,1fr)] gap-3 items-center [&>div]:min-w-0 [&>div>p]:truncate">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="font-medium text-foreground text-sm truncate">{product.name}</p>
                                        {product.isRecent && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary flex-shrink-0">
                                            <Sparkles className="w-3 h-3" />
                                            New
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground truncate">{product.sku}</p>
                                    </div>

                                    <div className="min-w-0">
                                      <p className="text-xs text-muted-foreground truncate">{product.location}</p>
                                    </div>

                                    <div className="min-w-0">
                                      <p className={`text-[13px] font-bold ${getStockStatus(product.stock, product.maxStock, product.minStock, product.reorderPoint).textColor}`}>
                                        {formatQuantity(product.stock, product.unit)} / {formatQuantity(product.maxStock, product.unit)}
                                      </p>
                                      {product.purchaseUnit && product.conversionFactor && product.conversionFactor > 1 && (
                                        <p className="text-[10px] leading-tight text-muted-foreground truncate">
                                          {formatQuantity(product.stock / product.conversionFactor, product.purchaseUnit)} packages
                                        </p>
                                      )}
                                    </div>

                                    <div className="min-w-0">
                                      <p className="text-[13px] font-medium text-foreground truncate">₱{product.price}</p>
                                    </div>

                                    <div className="min-w-0">
                                      <p className="text-[11px] leading-tight text-foreground truncate">{product.expiry || "No expiry"}</p>
                                      <p className="text-[10px] leading-tight text-muted-foreground truncate">{product.expiryPeriod || "No period"}</p>
                                    </div>
                                  </div>

                                  <div className="flex w-[90px] min-w-[90px] items-center justify-end gap-0.5">
                                    <button
                                      onClick={() => setCostHistoryItem({ id: product.backendId ?? String(product.id), name: product.name })}
                                      className="p-1 hover:bg-emerald-50 text-emerald-600 rounded-md transition-colors"
                                      title="View cost history"
                                    >
                                      <History className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleEdit(product)}
                                      className="p-1 hover:bg-green-50 text-green-600 rounded-md transition-colors"
                                      title="Edit storage & expiry"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
                                    {product.isActive === false ? (
                                      <button
                                        onClick={() => handleReactivate(product)}
                                        className="p-1 hover:bg-green-50 text-green-600 rounded-md transition-colors"
                                        title="Reactivate"
                                      >
                                        <ArchiveRestore className="w-4 h-4" />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleDeactivate(product.id)}
                                        className="p-1 hover:bg-amber-50 text-amber-600 rounded-md transition-colors"
                                        title="Archive (deactivate)"
                                      >
                                        <Archive className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>

                                  <div className="flex w-[112px] min-w-[112px] items-center justify-center gap-1">
                                    {product.isActive === false && (
                                      <span className="px-2 py-0.5 rounded text-xs font-medium border bg-muted text-muted-foreground border-border">
                                        Archived
                                      </span>
                                    )}
                                    <span className={`max-w-full truncate px-1.5 py-0.5 rounded text-[11px] font-medium border ${getStockStatus(product.stock, product.maxStock, product.minStock, product.reorderPoint).color}`}>
                                      {getStockStatus(product.stock, product.maxStock, product.minStock, product.reorderPoint).label}
                                    </span>
                                  </div>

                                </div>
                              ))}
                              {subCategoryProducts.length === 0 && (
                                <div className="p-6 text-center text-muted-foreground text-sm">
                                  No items found
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {mainCategories.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No categories available
          </div>
        )}
      </div>

      {/* Cost History Modal */}
      {costHistoryItem && (
        <CostHistoryModal
          itemId={costHistoryItem.id}
          itemName={costHistoryItem.name}
          onClose={() => setCostHistoryItem(null)}
        />
      )}

      {/* Category Manager Modal */}
      {showCategoryManager && userRole === "admin" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-foreground">Customize Categories</h2>
                <p className="text-sm text-muted-foreground">Rename main categories and subcategories used by Food Inventory.</p>
              </div>
              <button
                onClick={() => {
                  setShowCategoryManager(false);
                  setEditingCategoryName("");
                  setCategoryDraftName("");
                  setEditingSubCategory(null);
                  setSubCategoryDraftName("");
                }}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
                aria-label="Close category manager"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {mainCategories.map((category) => (
                <div key={category} className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-3">
                    <Folder className="w-5 h-5 text-orange-500 flex-shrink-0" />
                    {editingCategoryName === category ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          value={categoryDraftName}
                          onChange={(event) => setCategoryDraftName(event.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleRenameCategory}
                          disabled={!categoryDraftName.trim()}
                          className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryName("");
                            setCategoryDraftName("");
                          }}
                          className="px-3 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 font-semibold text-foreground">{category}</span>
                        <button
                          type="button"
                          onClick={() => startCategoryRename(category)}
                          className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted inline-flex items-center gap-1.5"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          Rename
                        </button>
                      </>
                    )}
                  </div>

                  <div className="mt-3 space-y-2 pl-8">
                    {(categoryHierarchy[category] || []).map((subCategory) => {
                      const isEditing = editingSubCategory?.category === category && editingSubCategory.subCategory === subCategory;
                      return (
                        <div key={`${category} > ${subCategory}`} className="flex items-center gap-2 rounded-lg bg-background border border-border px-3 py-2">
                          <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
                          {isEditing ? (
                            <>
                              <input
                                value={subCategoryDraftName}
                                onChange={(event) => setSubCategoryDraftName(event.target.value)}
                                className="min-w-0 flex-1 rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={handleRenameSubCategory}
                                disabled={!subCategoryDraftName.trim()}
                                className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSubCategory(null);
                                  setSubCategoryDraftName("");
                                }}
                                className="px-3 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm font-medium text-foreground">{subCategory}</span>
                              <button
                                type="button"
                                onClick={() => startSubCategoryRename(category, subCategory)}
                                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted inline-flex items-center gap-1.5"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                Rename
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recently Added Items Modal */}
      {showRecentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Recently Added Items</h2>
                  <p className="text-sm text-muted-foreground">Items added in the last 7 days</p>
                </div>
              </div>
              <button
                onClick={() => setShowRecentModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground"
                aria-label="Close recently added"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {(() => {
                const recentProducts = products
                  .filter((p) => p.isRecent)
                  .sort((a, b) => (b.addedDate || "").localeCompare(a.addedDate || ""));
                if (recentProducts.length === 0) {
                  return (
                    <div className="py-12 flex flex-col items-center gap-3 text-center">
                      <Package className="w-10 h-10 text-muted-foreground/40" />
                      <p className="text-muted-foreground text-sm">No recently added items.</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-2">
                    {recentProducts.map((p) => (
                      <div
                        key={p.backendId ?? p.id}
                        className="flex items-center gap-3 p-3 bg-muted/30 border border-border rounded-xl"
                      >
                        <Package className="w-5 h-5 text-primary flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground text-sm truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.category}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-foreground">
                            {formatQuantity(p.stock)} {p.unit}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {p.addedDate ? getManilaDateKey(p.addedDate) : "—"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2">
          <div className="bg-card rounded-2xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-lg font-bold text-foreground">Edit Storage &amp; Expiry</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Read-only context — which row is being edited. Master data is managed
                  in Product Management; stock via Stock Adjustments; location via Transfers. */}
              <div className="bg-muted/50 rounded-xl p-4 space-y-1">
                <p className="font-semibold text-foreground">{editingProduct.name}</p>
                <p className="text-sm text-muted-foreground">{editingProduct.category}</p>
                <p className="text-sm text-muted-foreground">
                  {editingProduct.location} • {formatQuantity(editingProduct.stock, editingProduct.unit)} on hand
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Name, category, price and stock thresholds are edited in <span className="font-medium">Product Management</span>;
                stock via <span className="font-medium">Stock Adjustments</span>; location via <span className="font-medium">Transfers</span>.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-2 text-foreground">Expiry Date</label>
                  <input
                    type="date"
                    value={editingProduct.expiry}
                    onChange={(e) => setEditingProduct({ ...editingProduct, expiry: e.target.value })}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground">Storage Temperature</label>
                  <select
                    value={editingProduct.storageTemperature || ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, storageTemperature: e.target.value })}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  >
                    <option value="">Select storage temperature</option>
                    {storageTemperatureOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground">Expiry Period</label>
                  <select
                    value={editingProduct.expiryPeriod || ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, expiryPeriod: e.target.value })}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  >
                    <option value="">Select expiry period</option>
                    {EXPIRY_PERIOD_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border flex gap-3 justify-end">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Initial Stock Setup Modal */}
      {showInitialStockModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-3 flex items-center justify-between z-10">
              <p className="text-sm font-medium text-muted-foreground">Admin — Initial Stock Setup</p>
              <button
                onClick={() => setShowInitialStockModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <AddProduct onClose={() => setShowInitialStockModal(false)} />
          </div>
        </div>
      )}

      {/* Archive (deactivate) Confirmation Modal */}
      {pendingDeactivateId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm">
            <div className="p-6 border-b border-border flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
              <h2 className="text-lg font-bold text-foreground">Archive Item</h2>
            </div>
            <div className="p-6">
              <p className="text-foreground mb-1">Archive this item?</p>
              <p className="text-sm text-muted-foreground mb-6">It will be hidden from the inventory list but kept for history (recipes, sales and PO records stay intact). You can reactivate it anytime from “Show archived”.</p>
              <div className="flex gap-3">
                <button
                  onClick={confirmDeactivate}
                  className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>
                <button
                  onClick={() => setPendingDeactivateId(null)}
                  className="px-4 py-2 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
