import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Archive, ArchiveRestore, Search, ChevronRight, ChevronDown, Folder, FolderOpen, AlertTriangle, Package, PackagePlus, ShoppingCart, PackageCheck, Layers, X, Eye, TrendingUp, TrendingDown, RefreshCw, CheckCircle, Users } from 'lucide-react';
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
import { useSession } from '../../app/hooks/useSession';
import { CostHistoryModal } from '../shared/costing/CostHistoryModal';
import { History, Sparkles } from 'lucide-react';
import { InlineDataLoading } from '../shared/InlineDataLoading';

export function InventoryView() {
  const {
    filteredInventory: inventory,
    searchTerm,
    setSearchTerm,
    showArchived,
    setShowArchived,
    handleArchive: onArchive,
    handleReactivate: onReactivate,
    expandedCategories,
    expandedSubcategories,
    toggleCategory,
    toggleSubcategory,
    formData,
    setFormData,
    handleAdd,
    locations,
    loading,
  } = useRetailWorkspace({
    enabled: true,
    loadSharedData: true,
    loadUsers: false,
  });
  const { currentUser } = useSession();
  const isAdmin = currentUser?.role === 'Admin';
  const [showInitialStockModal, setShowInitialStockModal] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [costHistoryItem, setCostHistoryItem] = useState<{ id: string; name: string } | null>(null);
  const [showRecentModal, setShowRecentModal] = useState(false);

  // Items added within the last week — surfaces a "New" indicator in the list.
  const recentlyAddedItems = useMemo(
    () =>
      inventory
        .filter((item: InventoryItem) => item.isRecent)
        .sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '')),
    [inventory],
  );
  const recentlyAddedCount = recentlyAddedItems.length;

  // Group items by category -> subcategory (matches the restaurant inventory layout)
  const groupedInventory = useMemo(() => {
    const grouped: {
      [category: string]: {
        [subcategory: string]: InventoryItem[]
      }
    } = {};

    inventory.forEach((item: InventoryItem) => {
      const subcategory = item.subcategory || 'General';

      if (!grouped[item.category]) {
        grouped[item.category] = {};
      }
      if (!grouped[item.category][subcategory]) {
        grouped[item.category][subcategory] = [];
      }
      grouped[item.category][subcategory].push(item);
    });

    return grouped;
  }, [inventory]);

  const totalItems = inventory.length;

  // Each category is a tab; the active tab reveals that category's subcategory folders.
  const categories = Object.keys(groupedInventory);
  // Fall back to the first available category so the view stays valid as search narrows results.
  const currentCategory =
    activeCategory && groupedInventory[activeCategory] ? activeCategory : categories[0];

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[30px] font-bold text-foreground">Inventory</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-foreground text-[14px]">{totalItems} items total</p>
            {recentlyAddedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowRecentModal(true)}
                title="View recently added items"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium bg-primary/10 text-primary hover:bg-[#c8ece3] transition-colors cursor-pointer"
              >
                <Sparkles className="size-3.5" />
                {recentlyAddedCount} recently added
              </button>
            )}
          </div>
          <p className="text-muted-foreground text-[12px] mt-0.5">Edit item details in Product Management • adjust stock in Stock Adjustments • move stock in Transfers.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground size-5" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] w-[300px] text-[14px] focus:outline-none focus:border-primary"
            />
          </div>
          <label className="flex items-center gap-2 px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] text-foreground cursor-pointer whitespace-nowrap hover:bg-muted hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-sm focus-within:ring-2 focus-within:ring-primary/40 active:translate-y-0 transition-all duration-200">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-[#007A5E]"
            />
            Show archived
          </label>
          {isAdmin && (
            <button
              onClick={() => setShowInitialStockModal(true)}
              className="px-4 py-2 bg-primary text-white rounded-[8px] text-[14px] font-medium hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-sm transition-all duration-200 flex items-center gap-2"
            >
              <PackagePlus className="size-5" />
              Initial Stock Setup
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-card border border-[rgba(0,0,0,0.1)] rounded-[14px] p-6">
          <InlineDataLoading label="Loading inventory items…" className="min-h-32" />
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-card border border-[rgba(0,0,0,0.1)] rounded-[14px] p-6">
          <div className="py-12 text-center text-foreground">No items found</div>
        </div>
      ) : (
        <div>
          {/* Category Tabs — one folder tab per category */}
          <div className="flex flex-wrap items-end gap-1">
            {categories.map((category) => {
              const categoryItemCount = Object.values(groupedInventory[category]).flat().length;
              const isActive = category === currentCategory;

              return (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`flex items-center gap-2 px-5 py-3 rounded-t-[12px] border border-b-0 transition-colors ${
                    isActive
                      ? 'bg-card border-[rgba(0,0,0,0.1)] text-primary -mb-px relative z-10'
                      : 'bg-primary/10 border-transparent text-foreground hover:bg-primary/15'
                  }`}
                >
                  {isActive ? (
                    <FolderOpen className="size-5 text-primary" />
                  ) : (
                    <Folder className="size-5 text-accent" />
                  )}
                  <span className="text-[15px] font-semibold">{category}</span>
                  <span
                    className={`text-[12px] px-2 py-0.5 rounded-full font-medium ${
                      isActive ? 'bg-primary/10 text-primary' : 'bg-card text-foreground'
                    }`}
                  >
                    {categoryItemCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active category panel — subcategory folders inside */}
          <div className="bg-card border border-[rgba(0,0,0,0.1)] rounded-b-[14px] rounded-tr-[14px] p-6">
            <div className="space-y-2">
              {Object.entries(groupedInventory[currentCategory]).map(([subcategory, items]) => {
                const subcategoryKey = `${currentCategory} > ${subcategory}`;
                const isSubcategoryExpanded = expandedSubcategories.has(subcategoryKey);

                return (
                  <div key={subcategoryKey} className="border border-[rgba(0,0,0,0.05)] rounded-[10px] overflow-hidden">
                    {/* Subcategory Folder */}
                    <button
                      onClick={() => toggleSubcategory(subcategoryKey)}
                      className="w-full flex items-center gap-3 px-5 py-3 bg-background hover:bg-primary/15 transition-colors group"
                    >
                      {isSubcategoryExpanded ? (
                        <ChevronDown className="size-5 text-foreground" />
                      ) : (
                        <ChevronRight className="size-5 text-foreground" />
                      )}
                      {isSubcategoryExpanded ? (
                        <FolderOpen className="size-6 text-accent" />
                      ) : (
                        <Folder className="size-6 text-accent" />
                      )}
                      <span className="text-[15px] font-semibold text-foreground">{subcategory}</span>
                      <span className="ml-auto text-[13px] text-foreground bg-card group-hover:bg-background px-3 py-1 rounded-full font-medium">
                        {items.length} items
                      </span>
                    </button>

                    {/* Items */}
                    {isSubcategoryExpanded && (
                      <div className="p-2 space-y-1">
                        {items.map((item: InventoryItem) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-4 px-4 py-3 hover:bg-background rounded-[8px] transition-colors border border-transparent hover:border-[rgba(0,0,0,0.05)]"
                          >
                            <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                              <div className="col-span-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-[14px] font-medium text-foreground">{item.name}</p>
                                  {item.isRecent && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                                      <Sparkles className="size-3" />
                                      New
                                    </span>
                                  )}
                                </div>
                                <p className="text-[12px] text-muted-foreground">{item.location}</p>
                              </div>
                              <div className="text-[13px] text-foreground">
                                Size: <span className="font-medium">{item.size}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${
                                  item.condition === 'Excellent' ? 'bg-primary/10 text-primary' :
                                  item.condition === 'Good' ? 'bg-primary/10 text-primary' :
                                  item.condition === 'Fair' ? 'bg-[#fef3c6] text-[#92400e]' :
                                  'bg-[#ffe2e2] text-[#991b1b]'
                                }`}>
                                  {item.condition}
                                </span>
                                {item.isActive === false && (
                                  <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                                    Archived
                                  </span>
                                )}
                              </div>
                              <div className="text-[13px]">
                                <span className="text-muted-foreground">Qty: </span>
                                <span className="text-foreground font-semibold">{item.quantity}</span>
                                <span className="text-muted-foreground mx-2">•</span>
                                <span className="text-foreground font-semibold">₱{item.price}</span>
                              </div>
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => setCostHistoryItem({ id: item.id, name: item.name })}
                                  className="p-2 hover:bg-primary/15 rounded-[6px] text-primary transition-colors"
                                  title="View cost history"
                                >
                                  <History className="size-4" />
                                </button>
                                {item.isActive === false ? (
                                  <button
                                    onClick={() => onReactivate(item.id)}
                                    className="p-2 hover:bg-primary/15 rounded-[6px] text-primary transition-colors"
                                    title="Reactivate"
                                  >
                                    <ArchiveRestore className="size-4" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => onArchive(item.id)}
                                    className="p-2 hover:bg-[#fef3c6] rounded-[6px] text-[#92400e] transition-colors"
                                    title="Archive (deactivate)"
                                  >
                                    <Archive className="size-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cost History Modal */}
      {costHistoryItem && (
        <CostHistoryModal
          itemId={costHistoryItem.id}
          itemName={costHistoryItem.name}
          onClose={() => setCostHistoryItem(null)}
        />
      )}

      {/* Recently Added Items Modal */}
      {showRecentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-[rgba(0,0,0,0.1)] px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Sparkles className="size-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-[18px] font-bold text-foreground">Recently Added Items</h2>
                  <p className="text-[13px] text-muted-foreground">Items added in the last 7 days</p>
                </div>
              </div>
              <button
                onClick={() => setShowRecentModal(false)}
                className="p-2 hover:bg-background rounded-xl transition-colors text-muted-foreground"
                aria-label="Close recently added"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-6">
              {recentlyAddedItems.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <Package className="size-10 text-muted-foreground" />
                  <p className="text-[14px] text-muted-foreground">No recently added items.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentlyAddedItems.map((item: InventoryItem) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 bg-background border border-[rgba(0,0,0,0.1)] rounded-xl"
                    >
                      <Package className="size-5 text-primary flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-[12px] text-muted-foreground truncate">
                          {item.category}
                          {item.subcategory ? ` • ${item.subcategory}` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[14px] font-semibold text-foreground">{item.quantity}</p>
                        <p className="text-[12px] text-muted-foreground">{item.dateAdded || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Initial Stock Setup Modal */}
      {showInitialStockModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-[rgba(0,0,0,0.1)] px-6 py-3 flex items-center justify-between z-10">
              <p className="text-[14px] font-medium text-muted-foreground">Admin — Initial Stock Setup</p>
              <button
                onClick={() => setShowInitialStockModal(false)}
                className="p-2 hover:bg-background rounded-[8px] transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6">
              <AddItemsView
                formData={formData}
                setFormData={setFormData}
                editingId={null}
                onCancel={() => setShowInitialStockModal(false)}
                onSubmit={async (e: React.FormEvent) => {
                  e.preventDefault();
                  const added = await handleAdd();
                  if (added) setShowInitialStockModal(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Add Items View
function AddItemsView({ formData, setFormData, onSubmit, editingId, onCancel }: any) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block text-[14px] font-medium text-foreground mb-2">Item Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary"
              placeholder="e.g., Vintage Denim Jacket"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-medium text-foreground mb-2">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value, subcategory: '' })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary"
                required
              >
                <option value="">Select category</option>
                <option value="Tops">Tops</option>
                <option value="Bottoms">Bottoms</option>
                <option value="Dresses">Dresses</option>
                <option value="Outerwear">Outerwear</option>
                <option value="Shoes">Shoes</option>
                <option value="Accessories">Accessories</option>
              </select>
            </div>

            <div>
              <label className="block text-[14px] font-medium text-foreground mb-2">Subcategory</label>
              <select
                value={formData.subcategory}
                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary"
                required
                disabled={!formData.category}
              >
                <option value="">Select subcategory</option>
                {formData.category && categorySubcategories[formData.category]?.map((sub: string) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[14px] font-medium text-foreground mb-2">Target Customer</label>
            <select
              value={formData.targetCustomer}
              onChange={(e) => setFormData({ ...formData, targetCustomer: e.target.value as any })}
              className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary"
              required
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Unisex">Unisex</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-medium text-foreground mb-2">Size</label>
              <input
                type="text"
                value={formData.size}
                onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary"
                placeholder="e.g., M, L, XL"
                required
              />
            </div>

            <div>
              <label className="block text-[14px] font-medium text-foreground mb-2">Condition</label>
              <select
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary"
              >
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Damaged">Damaged</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-medium text-foreground mb-2">Quantity</label>
              <input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div>
              <label className="block text-[14px] font-medium text-foreground mb-2">Price (₱)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-medium text-foreground mb-2">Location</label>
              <select
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary"
              >
                <option value="Main Store">Main Store</option>
                <option value="Warehouse">Warehouse</option>
                <option value="Branch 1">Branch 1</option>
                <option value="Branch 2">Branch 2</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-primary text-white px-6 py-3 rounded-[8px] text-[14px] font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="size-5" />
              {editingId ? 'Update Item' : 'Add Item'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-foreground hover:bg-background transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
  );
}

// Reports View
