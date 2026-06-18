import { useState } from "react";
import { Search, Edit, Trash2, AlertCircle, X, Save, ArrowRight, ChevronRight, ChevronDown, Folder, FolderOpen, Package, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../../app/hooks/useSession";
import { formatQuantity } from "../lib/inventoryLogic";
import {
  useDeleteRestaurantInventoryMutation,
  useRestaurantCategoryHierarchyQuery,
  useRestaurantInventoryQuery,
  useRestaurantLocationsQuery,
  useRestaurantStorageTemperatureOptionsQuery,
  useUpdateRestaurantInventoryMutation,
} from "../lib/restaurant";
import { AddProduct } from "./AddProduct";

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
  location?: string;
  unit: string;
  storageTemperature?: string;
};

export function Inventory() {
  const { currentUser } = useSession();
  const userRole = currentUser?.role === "Admin" ? "admin" : "staff";
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedMainCategories, setExpandedMainCategories] = useState<Set<string>>(new Set());
  const [expandedSubCategories, setExpandedSubCategories] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showInitialStockModal, setShowInitialStockModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [transferProduct, setTransferProduct] = useState<Product | null>(null);
  const [editMainCategory, setEditMainCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");

  // Hierarchical category structure — read from persisted backend settings so
  // categories added via Initial Stock Setup appear here immediately.
  const { data: categoryHierarchy = {} } = useRestaurantCategoryHierarchyQuery();
  const { data: storageTemperatureOptions = [] } = useRestaurantStorageTemperatureOptionsQuery();

  const { data: products = [] } = useRestaurantInventoryQuery<Product[]>();
  const { data: locations = [] } = useRestaurantLocationsQuery();
  const updateProduct = useUpdateRestaurantInventoryMutation();
  const deleteProduct = useDeleteRestaurantInventoryMutation();

  const mainCategories = Object.keys(categoryHierarchy);

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
      return matchesCategory && matchesSearch;
    });
  };

  const getProductCountInSubCategory = (mainCategory: string, subCategory: string) => {
    return getProductsInCategory(mainCategory, subCategory).length;
  };

  const getProductCountInMainCategory = (mainCategory: string) => {
    if (searchQuery === "") {
      return products.filter(p => p.category.startsWith(mainCategory + " > ")).length;
    }
    return categoryHierarchy[mainCategory]?.reduce((count, sub) =>
      count + getProductsInCategory(mainCategory, sub).length, 0) ?? 0;
  };

  const handleEdit = (product: Product) => {
    const [main, sub] = product.category.split(" > ");
    setEditMainCategory(main);
    setEditSubCategory(sub);
    setEditingProduct({ ...product });
    setShowEditModal(true);
  };

  const handleEditMainCategoryChange = (newMainCategory: string) => {
    setEditMainCategory(newMainCategory);
    setEditSubCategory("");
  };

  const handleSaveEdit = async () => {
    if (editingProduct && editMainCategory && editSubCategory) {
      const updatedProduct = {
        ...editingProduct,
        category: `${editMainCategory} > ${editSubCategory}`
      };
      try {
        await updateProduct.mutateAsync({
          id: editingProduct.backendId ?? String(editingProduct.id),
          data: {
            name: updatedProduct.name,
            sku: updatedProduct.sku,
            category: updatedProduct.category,
            quantity: updatedProduct.stock,
            maxStock: updatedProduct.maxStock,
            minStock: updatedProduct.minStock,
            reorderPoint: updatedProduct.reorderPoint,
            price: updatedProduct.price,
            expiryDate: updatedProduct.expiry
              ? new Date(`${updatedProduct.expiry}T00:00:00`).toISOString()
              : undefined,
            storageTemperature: updatedProduct.storageTemperature || undefined,
            unit: updatedProduct.unit,
            locationId: updatedProduct.locationId,
          },
        });
        setShowEditModal(false);
        setEditingProduct(null);
        setEditMainCategory("");
        setEditSubCategory("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update inventory item");
      }
    }
  };

  const handleTransfer = (product: Product) => {
    const [main, sub] = product.category.split(" > ");
    setEditMainCategory(main);
    setEditSubCategory(sub);
    setTransferProduct({ ...product });
    setShowTransferModal(true);
  };

  const handleSaveTransfer = async () => {
    if (transferProduct && editMainCategory && editSubCategory) {
      const updatedProduct = {
        ...transferProduct,
        category: `${editMainCategory} > ${editSubCategory}`
      };
      const location = locations.find((item: any) => item.name === updatedProduct.location);
      if (!location) {
        toast.error("Select a valid backend location");
        return;
      }
      try {
        await updateProduct.mutateAsync({
          id: transferProduct.backendId ?? String(transferProduct.id),
          data: { category: updatedProduct.category, locationId: location.id },
        });
        setShowTransferModal(false);
        setTransferProduct(null);
        setEditMainCategory("");
        setEditSubCategory("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to move inventory item");
      }
    }
  };

  const handleDelete = (id: number) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    if (pendingDeleteId === null) return;
    const product = products.find((item) => item.id === pendingDeleteId);
    setPendingDeleteId(null);
    if (!product) return;
    try {
      await deleteProduct.mutateAsync(product.backendId ?? String(product.id));
      toast.success("Item deleted successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete inventory item");
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
        <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
        {userRole === "admin" && (
          <button
            onClick={() => setShowInitialStockModal(true)}
            className="px-4 py-2 bg-muted text-foreground border border-border rounded-xl hover:bg-muted/80 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Initial Stock Setup
          </button>
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
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-6 gap-4 mt-4 pt-4 border-t border-border">
          <div className="text-center">
            <p className="text-xl font-bold text-foreground">{products.length}</p>
            <p className="text-muted-foreground text-sm">Total</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-black">{products.filter(p => getStockStatus(p.stock, p.maxStock, p.minStock, p.reorderPoint).label === "Out of Stock").length}</p>
            <p className="text-muted-foreground text-sm">Out</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-red-600">{products.filter(p => getStockStatus(p.stock, p.maxStock, p.minStock, p.reorderPoint).label === "Critical Stock").length}</p>
            <p className="text-muted-foreground text-sm">Critical</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-orange-600">{products.filter(p => getStockStatus(p.stock, p.maxStock, p.minStock, p.reorderPoint).label === "Low Stock").length}</p>
            <p className="text-muted-foreground text-sm">Low</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-yellow-700">{products.filter(p => getStockStatus(p.stock, p.maxStock, p.minStock, p.reorderPoint).label === "Medium Stock").length}</p>
            <p className="text-muted-foreground text-sm">Medium</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-green-600">{products.filter(p => getStockStatus(p.stock, p.maxStock, p.minStock, p.reorderPoint).label === "Healthy Stock").length}</p>
            <p className="text-muted-foreground text-sm">Healthy</p>
          </div>
        </div>
      </div>

      {/* Folder Tree View */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden p-4">
        <div className="space-y-4">
          {mainCategories.map((mainCategory) => {
            const hasMatchingProducts = searchQuery !== "" &&
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
                      const isSubExpanded = expandedSubCategories.has(subKey) || (searchQuery !== "" && subCount > 0);

                      if (searchQuery && subCount === 0) return null;

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
                                  className="flex items-center gap-2 p-2 bg-card border border-border rounded-lg hover:shadow-md transition-all"
                                >
                                  <Package className="w-5 h-5 text-primary flex-shrink-0" />

                                  <div className="flex-1 grid grid-cols-6 gap-2 items-center">
                                    <div className="col-span-2">
                                      <p className="font-medium text-foreground text-sm truncate">{product.name}</p>
                                      <p className="text-xs text-muted-foreground truncate">{product.sku}</p>
                                    </div>

                                    <div>
                                      <p className="text-xs text-muted-foreground truncate">{product.location}</p>
                                    </div>

                                    <div>
                                      <p className={`text-sm font-bold ${getStockStatus(product.stock, product.maxStock, product.minStock, product.reorderPoint).textColor}`}>
                                        {formatQuantity(product.stock, product.unit)} / {formatQuantity(product.maxStock, product.unit)}
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-sm font-medium text-foreground">₱{product.price}</p>
                                    </div>

                                    <div>
                                      <p className="text-xs text-foreground truncate">{product.expiry}</p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStockStatus(product.stock, product.maxStock, product.minStock, product.reorderPoint).color}`}>
                                      {getStockStatus(product.stock, product.maxStock, product.minStock, product.reorderPoint).label}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => handleTransfer(product)}
                                      className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                                      title="Transfer"
                                    >
                                      <ArrowRight className="w-5 h-5" />
                                    </button>
                                    <button
                                      onClick={() => handleEdit(product)}
                                      className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                                      title="Edit"
                                    >
                                      <Edit className="w-5 h-5" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(product.id)}
                                      className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-5 h-5" />
                                    </button>
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

      {/* Edit Modal */}
      {showEditModal && editingProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2">
          <div className="bg-card rounded-2xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-lg font-bold text-foreground">Edit Food Item</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm mb-2 text-foreground">Name</label>
                <input
                  type="text"
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-foreground">SKU</label>
                <input
                  type="text"
                  value={editingProduct.sku}
                  onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm mb-2 text-foreground">Main Category</label>
                  <select
                    value={editMainCategory}
                    onChange={(e) => handleEditMainCategoryChange(e.target.value)}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  >
                    <option value="">Select Category</option>
                    {mainCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground">Sub Category</label>
                  <select
                    value={editSubCategory}
                    onChange={(e) => setEditSubCategory(e.target.value)}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    disabled={!editMainCategory}
                  >
                    <option value="">Select Subcategory</option>
                    {editMainCategory && categoryHierarchy[editMainCategory]?.map((subCat) => (
                      <option key={subCat} value={subCat}>{subCat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm mb-2 text-foreground">Current Stock</label>
                  <input
                    type="number"
                    value={editingProduct.stock}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stock: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground">Min Stock</label>
                  <input
                    type="number"
                    value={editingProduct.minStock ?? ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, minStock: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="Critical threshold"
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground">Reorder Point</label>
                  <input
                    type="number"
                    value={editingProduct.reorderPoint ?? ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, reorderPoint: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="Low stock threshold"
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground">Max Stock</label>
                  <input
                    type="number"
                    value={editingProduct.maxStock}
                    onChange={(e) => setEditingProduct({ ...editingProduct, maxStock: parseFloat(e.target.value) })}
                    placeholder="Maximum capacity"
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>
              </div>

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
                  <label className="block text-sm mb-2 text-foreground">Location</label>
                  <select
                    value={editingProduct.location}
                    onChange={(e) => setEditingProduct({ ...editingProduct, location: e.target.value })}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  >
                    {locations.map((loc: any) => (
                      <option key={loc.id} value={loc.name}>{loc.name}</option>
                    ))}
                  </select>
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

      {/* Transfer Modal */}
      {showTransferModal && transferProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">Transfer Item</h2>
              <button
                onClick={() => setShowTransferModal(false)}
                className="p-6 hover:bg-muted rounded-2xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-muted/50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground mb-6">Transferring</p>
                <p className="font-semibold text-foreground">{transferProduct.name}</p>
                <p className="text-sm text-muted-foreground mt-2">Current Location: {transferProduct.location}</p>
              </div>

              <div>
                <label className="block text-sm mb-2 text-foreground">New Location</label>
                <select
                  value={transferProduct.location}
                  onChange={(e) => setTransferProduct({ ...transferProduct, location: e.target.value })}
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                >
                  {locations.map((loc: any) => (
                    <option key={loc.id} value={loc.name}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-2 text-foreground">Main Category</label>
                  <select
                    value={editMainCategory}
                    onChange={(e) => handleEditMainCategoryChange(e.target.value)}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  >
                    {mainCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground">Sub Category</label>
                  <select
                    value={editSubCategory}
                    onChange={(e) => setEditSubCategory(e.target.value)}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    disabled={!editMainCategory}
                  >
                    <option value="">Select Subcategory</option>
                    {editMainCategory && categoryHierarchy[editMainCategory]?.map((subCat) => (
                      <option key={subCat} value={subCat}>{subCat}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border flex gap-3 justify-end">
              <button
                onClick={() => setShowTransferModal(false)}
                className="px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTransfer}
                className="px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all flex items-center gap-2"
              >
                <ArrowRight className="w-5 h-5" />
                Transfer Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Initial Stock Setup Modal */}
      {showInitialStockModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-auto">
          <div className="min-h-full bg-background">
            <div className="sticky top-0 bg-card border-b border-border px-8 py-3 flex items-center justify-between z-10">
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

      {/* Delete Confirmation Modal */}
      {pendingDeleteId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm">
            <div className="p-6 border-b border-border flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
              <h2 className="text-lg font-bold text-foreground">Delete Item</h2>
            </div>
            <div className="p-6">
              <p className="text-foreground mb-1">Are you sure you want to delete this item?</p>
              <p className="text-sm text-muted-foreground mb-6">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <button
                  onClick={() => setPendingDeleteId(null)}
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
