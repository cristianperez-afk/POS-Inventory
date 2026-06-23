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

  // Items added within the last week — surfaces a "New" indicator in the list.
  const recentlyAddedCount = useMemo(
    () => inventory.filter((item: InventoryItem) => item.isRecent).length,
    [inventory],
  );

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
          <h2 className="text-[30px] font-bold text-[#323B42]">Inventory</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-[#323B42] text-[14px]">{totalItems} items total</p>
            {recentlyAddedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium bg-[#E0F5F1] text-[#007A5E]">
                <Sparkles className="size-3.5" />
                {recentlyAddedCount} recently added
              </span>
            )}
          </div>
          <p className="text-[#6b7280] text-[12px] mt-0.5">Edit item details in Product Management • adjust stock in Stock Adjustments • move stock in Transfers.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#323B42] size-5" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] w-[300px] text-[14px] focus:outline-none focus:border-[#007A5E]"
            />
          </div>
          <label className="flex items-center gap-2 px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] text-[#323B42] cursor-pointer whitespace-nowrap">
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
              className="px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[14px] font-medium hover:bg-[#008967] transition-colors flex items-center gap-2"
            >
              <PackagePlus className="size-5" />
              Initial Stock Setup
            </button>
          )}
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-6">
          <div className="py-12 text-center text-[#323B42]">No items found</div>
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
                      ? 'bg-white border-[rgba(0,0,0,0.1)] text-[#007A5E] -mb-px relative z-10'
                      : 'bg-[#EEF4F3] border-transparent text-[#323B42] hover:bg-[#E0F5F1]'
                  }`}
                >
                  {isActive ? (
                    <FolderOpen className="size-5 text-[#007A5E]" />
                  ) : (
                    <Folder className="size-5 text-[#00A7A5]" />
                  )}
                  <span className="text-[15px] font-semibold">{category}</span>
                  <span
                    className={`text-[12px] px-2 py-0.5 rounded-full font-medium ${
                      isActive ? 'bg-[#E0F5F1] text-[#007A5E]' : 'bg-white text-[#323B42]'
                    }`}
                  >
                    {categoryItemCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active category panel — subcategory folders inside */}
          <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-b-[14px] rounded-tr-[14px] p-6">
            <div className="space-y-2">
              {Object.entries(groupedInventory[currentCategory]).map(([subcategory, items]) => {
                const subcategoryKey = `${currentCategory} > ${subcategory}`;
                const isSubcategoryExpanded = expandedSubcategories.has(subcategoryKey);

                return (
                  <div key={subcategoryKey} className="border border-[rgba(0,0,0,0.05)] rounded-[10px] overflow-hidden">
                    {/* Subcategory Folder */}
                    <button
                      onClick={() => toggleSubcategory(subcategoryKey)}
                      className="w-full flex items-center gap-3 px-5 py-3 bg-[#F8FAFB] hover:bg-[#EEF4F3] transition-colors group"
                    >
                      {isSubcategoryExpanded ? (
                        <ChevronDown className="size-5 text-[#323B42]" />
                      ) : (
                        <ChevronRight className="size-5 text-[#323B42]" />
                      )}
                      {isSubcategoryExpanded ? (
                        <FolderOpen className="size-6 text-[#00A7A5]" />
                      ) : (
                        <Folder className="size-6 text-[#00A7A5]" />
                      )}
                      <span className="text-[15px] font-semibold text-[#323B42]">{subcategory}</span>
                      <span className="ml-auto text-[13px] text-[#323B42] bg-white group-hover:bg-[#F8FAFB] px-3 py-1 rounded-full font-medium">
                        {items.length} items
                      </span>
                    </button>

                    {/* Items */}
                    {isSubcategoryExpanded && (
                      <div className="p-2 space-y-1">
                        {items.map((item: InventoryItem) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-4 px-4 py-3 hover:bg-[#F8FAFB] rounded-[8px] transition-colors border border-transparent hover:border-[rgba(0,0,0,0.05)]"
                          >
                            <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                              <div className="col-span-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-[14px] font-medium text-[#323B42]">{item.name}</p>
                                  {item.isRecent && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E0F5F1] text-[#007A5E]">
                                      <Sparkles className="size-3" />
                                      New
                                    </span>
                                  )}
                                </div>
                                <p className="text-[12px] text-[#6b7280]">{item.location}</p>
                              </div>
                              <div className="text-[13px] text-[#323B42]">
                                Size: <span className="font-medium">{item.size}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${
                                  item.condition === 'Excellent' ? 'bg-[#E0F5F1] text-[#008967]' :
                                  item.condition === 'Good' ? 'bg-[#E0F2F2] text-[#007A5E]' :
                                  item.condition === 'Fair' ? 'bg-[#fef3c6] text-[#92400e]' :
                                  'bg-[#ffe2e2] text-[#991b1b]'
                                }`}>
                                  {item.condition}
                                </span>
                                {item.isActive === false && (
                                  <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-[#f3f4f6] text-[#6b7280]">
                                    Archived
                                  </span>
                                )}
                              </div>
                              <div className="text-[13px]">
                                <span className="text-[#6b7280]">Qty: </span>
                                <span className="text-[#323B42] font-semibold">{item.quantity}</span>
                                <span className="text-[#6b7280] mx-2">•</span>
                                <span className="text-[#323B42] font-semibold">₱{item.price}</span>
                              </div>
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => setCostHistoryItem({ id: item.id, name: item.name })}
                                  className="p-2 hover:bg-[#E0F5F1] rounded-[6px] text-[#007A5E] transition-colors"
                                  title="View cost history"
                                >
                                  <History className="size-4" />
                                </button>
                                {item.isActive === false ? (
                                  <button
                                    onClick={() => onReactivate(item.id)}
                                    className="p-2 hover:bg-[#E0F5F1] rounded-[6px] text-[#008967] transition-colors"
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

      {/* Initial Stock Setup Modal */}
      {showInitialStockModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[14px] shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[rgba(0,0,0,0.1)] px-6 py-3 flex items-center justify-between z-10">
              <p className="text-[14px] font-medium text-[#6b7280]">Admin — Initial Stock Setup</p>
              <button
                onClick={() => setShowInitialStockModal(false)}
                className="p-2 hover:bg-[#F8FAFB] rounded-[8px] transition-colors text-[#6b7280] hover:text-[#323B42]"
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
            <label className="block text-[14px] font-medium text-[#323B42] mb-2">Item Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
              placeholder="e.g., Vintage Denim Jacket"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-medium text-[#323B42] mb-2">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value, subcategory: '' })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
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
              <label className="block text-[14px] font-medium text-[#323B42] mb-2">Subcategory</label>
              <select
                value={formData.subcategory}
                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
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
            <label className="block text-[14px] font-medium text-[#323B42] mb-2">Target Customer</label>
            <select
              value={formData.targetCustomer}
              onChange={(e) => setFormData({ ...formData, targetCustomer: e.target.value as any })}
              className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
              required
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Unisex">Unisex</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-medium text-[#323B42] mb-2">Size</label>
              <input
                type="text"
                value={formData.size}
                onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                placeholder="e.g., M, L, XL"
                required
              />
            </div>

            <div>
              <label className="block text-[14px] font-medium text-[#323B42] mb-2">Condition</label>
              <select
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
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
              <label className="block text-[14px] font-medium text-[#323B42] mb-2">Quantity</label>
              <input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                required
              />
            </div>

            <div>
              <label className="block text-[14px] font-medium text-[#323B42] mb-2">Price (₱)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-medium text-[#323B42] mb-2">Location</label>
              <select
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
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
              className="flex-1 bg-[#007A5E] text-white px-6 py-3 rounded-[8px] text-[14px] font-medium hover:bg-[#008967] transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="size-5" />
              {editingId ? 'Update Item' : 'Add Item'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-[#323B42] hover:bg-[#F8FAFB] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
  );
}

// Reports View
