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

export function InventoryView() {
  const {
    filteredInventory: inventory,
    searchTerm,
    setSearchTerm,
    handleEdit: onEdit,
    handleDelete: onDelete,
    expandedCategories,
    expandedSubcategories,
    toggleCategory,
    toggleSubcategory,
    showEditModal,
    editingId,
    formData,
    setFormData,
    handleSaveEdit: onSaveEdit,
    handleCancelEdit: onCancelEdit,
    locations,
  } = useRetailWorkspace({
    enabled: true,
    loadSharedData: true,
    loadUsers: false,
  });
  const [expandedTargetCustomers, setExpandedTargetCustomers] = useState<Set<string>>(new Set());
  const [expandedConditions, setExpandedConditions] = useState<Set<string>>(new Set());

  const toggleTargetCustomer = (key: string) => {
    const newExpanded = new Set(expandedTargetCustomers);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedTargetCustomers(newExpanded);
  };

  const toggleCondition = (key: string) => {
    const newExpanded = new Set(expandedConditions);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedConditions(newExpanded);
  };

  // Group items by category -> targetCustomer -> condition -> subcategory
  const groupedInventory = useMemo(() => {
    const grouped: {
      [category: string]: {
        [targetCustomer: string]: {
          [condition: string]: {
            [subcategory: string]: InventoryItem[]
          }
        }
      }
    } = {};

    inventory.forEach((item: InventoryItem) => {
      const targetCustomer = item.targetCustomer || 'Unisex';
      const condition = item.condition || 'Good';

      if (!grouped[item.category]) {
        grouped[item.category] = {};
      }
      if (!grouped[item.category][targetCustomer]) {
        grouped[item.category][targetCustomer] = {};
      }
      if (!grouped[item.category][targetCustomer][condition]) {
        grouped[item.category][targetCustomer][condition] = {};
      }
      if (!grouped[item.category][targetCustomer][condition][item.subcategory]) {
        grouped[item.category][targetCustomer][condition][item.subcategory] = [];
      }
      grouped[item.category][targetCustomer][condition][item.subcategory].push(item);
    });

    return grouped;
  }, [inventory]);

  const totalItems = inventory.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[30px] font-bold text-[#323B42]">Inventory</h2>
          <p className="text-[#323B42] text-[14px] mt-1">{totalItems} items total</p>
        </div>
        <div className="flex items-center gap-3">
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
        </div>
      </div>

      <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-6">
        {Object.keys(groupedInventory).length === 0 ? (
          <div className="py-12 text-center text-[#323B42]">No items found</div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedInventory).map(([category, targetCustomers]) => {
              const categoryItemCount = Object.values(targetCustomers)
                .flatMap(tc => Object.values(tc))
                .flatMap(c => Object.values(c))
                .flat().length;
              const isCategoryExpanded = expandedCategories.has(category);

              return (
                <div key={category}>
                  {/* Category Header - BIGGER */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[#F8FAFB] rounded-[10px] transition-colors group border border-[rgba(0,0,0,0.05)]"
                  >
                    {isCategoryExpanded ? (
                      <ChevronDown className="size-6 text-[#323B42]" />
                    ) : (
                      <ChevronRight className="size-6 text-[#323B42]" />
                    )}
                    {isCategoryExpanded ? (
                      <FolderOpen className="size-7 text-[#007A5E]" />
                    ) : (
                      <Folder className="size-7 text-[#007A5E]" />
                    )}
                    <span className="text-[18px] font-bold text-[#323B42]">{category}</span>
                    <span className="ml-auto text-[15px] text-[#323B42] bg-[#E0F5F1] group-hover:bg-[#007A5E] group-hover:text-white px-4 py-1.5 rounded-full font-medium transition-colors">
                      {categoryItemCount} items
                    </span>
                  </button>

                  {/* Target Customers (Male, Female, Unisex) */}
                  {isCategoryExpanded && (
                    <div className="ml-10 mt-3 space-y-2">
                      {Object.entries(targetCustomers).map(([targetCustomer, conditions]) => {
                        const targetCustomerKey = `${category}-${targetCustomer}`;
                        const isTargetCustomerExpanded = expandedTargetCustomers.has(targetCustomerKey);
                        const targetCustomerItemCount = Object.values(conditions)
                          .flatMap(c => Object.values(c))
                          .flat().length;

                        return (
                          <div key={targetCustomerKey}>
                            {/* Target Customer Header (Male, Female, Unisex) */}
                            <button
                              onClick={() => toggleTargetCustomer(targetCustomerKey)}
                              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#F8FAFB] rounded-[8px] transition-colors group"
                            >
                              {isTargetCustomerExpanded ? (
                                <ChevronDown className="size-5 text-[#323B42]" />
                              ) : (
                                <ChevronRight className="size-5 text-[#323B42]" />
                              )}
                              {isTargetCustomerExpanded ? (
                                <FolderOpen className="size-6 text-[#008967]" />
                              ) : (
                                <Folder className="size-6 text-[#008967]" />
                              )}
                              <span className="text-[16px] font-semibold text-[#323B42]">{targetCustomer}</span>
                              <span className="ml-auto text-[14px] text-[#323B42] bg-[#F8FAFB] group-hover:bg-white px-3 py-1 rounded-full font-medium">
                                {targetCustomerItemCount} items
                              </span>
                            </button>

                            {/* Conditions (Excellent, Good, Fair, Damaged) */}
                            {isTargetCustomerExpanded && (
                              <div className="ml-10 mt-2 space-y-2">
                                {Object.entries(conditions).map(([condition, subcategories]) => {
                                  const conditionKey = `${targetCustomerKey}-${condition}`;
                                  const isConditionExpanded = expandedConditions.has(conditionKey);
                                  const conditionItemCount = Object.values(subcategories)
                                    .flat().length;

                                  return (
                                    <div key={conditionKey}>
                                      {/* Condition Header */}
                                      <button
                                        onClick={() => toggleCondition(conditionKey)}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F8FAFB] rounded-[8px] transition-colors group"
                                      >
                                        {isConditionExpanded ? (
                                          <ChevronDown className="size-5 text-[#323B42]" />
                                        ) : (
                                          <ChevronRight className="size-5 text-[#323B42]" />
                                        )}
                                        {isConditionExpanded ? (
                                          <FolderOpen className="size-5 text-[#009BA5]" />
                                        ) : (
                                          <Folder className="size-5 text-[#009BA5]" />
                                        )}
                                        <span className="text-[15px] font-semibold text-[#323B42]">{condition}</span>
                                        <span className="ml-auto text-[13px] text-[#323B42] bg-[#F8FAFB] group-hover:bg-white px-3 py-1 rounded-full font-medium">
                                          {conditionItemCount} items
                                        </span>
                                      </button>

                                      {/* Subcategories */}
                                      {isConditionExpanded && (
                                        <div className="ml-10 mt-2 space-y-2">
                                          {Object.entries(subcategories).map(([subcategory, items]) => {
                                            const subcategoryKey = `${conditionKey}-${subcategory}`;
                                            const isSubcategoryExpanded = expandedSubcategories.has(subcategoryKey);

                                            return (
                                              <div key={subcategoryKey}>
                                                {/* Subcategory Header */}
                                                <button
                                                  onClick={() => toggleSubcategory(subcategoryKey)}
                                                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[#F8FAFB] rounded-[8px] transition-colors group"
                                                >
                                                  {isSubcategoryExpanded ? (
                                                    <ChevronDown className="size-4 text-[#323B42]" />
                                                  ) : (
                                                    <ChevronRight className="size-4 text-[#323B42]" />
                                                  )}
                                                  {isSubcategoryExpanded ? (
                                                    <FolderOpen className="size-5 text-[#00A7A5]" />
                                                  ) : (
                                                    <Folder className="size-5 text-[#00A7A5]" />
                                                  )}
                                                  <span className="text-[14px] font-medium text-[#323B42]">{subcategory}</span>
                                                  <span className="ml-auto text-[13px] text-[#323B42] bg-[#F8FAFB] group-hover:bg-white px-2 py-0.5 rounded-full">
                                                    {items.length}
                                                  </span>
                                                </button>

                                                {/* Items */}
                                                {isSubcategoryExpanded && (
                                                  <div className="ml-10 mt-2 space-y-1">
                                                    {items.map((item: InventoryItem) => (
                                                      <div
                                                        key={item.id}
                                                        className="flex items-center gap-4 px-4 py-3 hover:bg-[#F8FAFB] rounded-[8px] transition-colors border border-transparent hover:border-[rgba(0,0,0,0.05)]"
                                                      >
                                                        <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                                                          <div className="col-span-2">
                                                            <p className="text-[14px] font-medium text-[#323B42]">{item.name}</p>
                                                            <p className="text-[12px] text-[#6b7280]">{item.location}</p>
                                                          </div>
                                                          <div className="text-[13px] text-[#323B42]">
                                                            Size: <span className="font-medium">{item.size}</span>
                                                          </div>
                                                          <div>
                                                            <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${
                                                              item.condition === 'Excellent' ? 'bg-[#E0F5F1] text-[#008967]' :
                                                              item.condition === 'Good' ? 'bg-[#E0F2F2] text-[#007A5E]' :
                                                              item.condition === 'Fair' ? 'bg-[#fef3c6] text-[#92400e]' :
                                                              'bg-[#ffe2e2] text-[#991b1b]'
                                                            }`}>
                                                              {item.condition}
                                                            </span>
                                                          </div>
                                                          <div className="text-[13px]">
                                                            <span className="text-[#6b7280]">Qty: </span>
                                                            <span className="text-[#323B42] font-semibold">{item.quantity}</span>
                                                            <span className="text-[#6b7280] mx-2">â€¢</span>
                                                            <span className="text-[#323B42] font-semibold">â‚±{item.price}</span>
                                                          </div>
                                                          <div className="flex items-center gap-1 justify-end">
                                                            <button
                                                              onClick={() => onEdit(item)}
                                                              className="p-2 hover:bg-[#E0F2F2] rounded-[6px] text-[#007A5E] transition-colors"
                                                              title="Edit"
                                                            >
                                                              <Edit2 className="size-4" />
                                                            </button>
                                                            <button
                                                              onClick={() => onDelete(item.id)}
                                                              className="p-2 hover:bg-[#ffe2e2] rounded-[6px] text-[#991b1b] transition-colors"
                                                              title="Delete"
                                                            >
                                                              <Trash2 className="size-4" />
                                                            </button>
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Item Modal */}
      {showEditModal && editingId && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[14px] p-6 w-[600px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[24px] font-bold text-[#323B42]">Edit Item</h3>
              <button
                onClick={onCancelEdit}
                className="text-[#6b7280] hover:text-[#323B42] transition-colors"
              >
                <X className="size-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[14px] font-medium text-[#323B42] mb-2">
                  Item Name <span className="text-[#E7000B]">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                  placeholder="Enter item name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">
                    Category <span className="text-[#E7000B]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                    placeholder="e.g., Tops, Bottoms"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">
                    Subcategory <span className="text-[#E7000B]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.subcategory}
                    onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                    className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                    placeholder="e.g., T-Shirts, Jeans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#323B42] mb-2">
                  Target Customer <span className="text-[#E7000B]">*</span>
                </label>
                <select
                  value={formData.targetCustomer}
                  onChange={(e) => setFormData({ ...formData, targetCustomer: e.target.value as 'Male' | 'Female' | 'Unisex' })}
                  className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Unisex">Unisex</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">
                    Size <span className="text-[#E7000B]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                    placeholder="e.g., M, L, XL"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">
                    Condition <span className="text-[#E7000B]">*</span>
                  </label>
                  <select
                    value={formData.condition}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value as 'Excellent' | 'Good' | 'Fair' | 'Damaged' })}
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
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">
                    Quantity <span className="text-[#E7000B]">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">
                    Price (â‚±) <span className="text-[#E7000B]">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#323B42] mb-2">
                  Location <span className="text-[#E7000B]">*</span>
                </label>
                <select
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                >
                  {locations.map((loc: any) => (
                    <option key={loc.id} value={loc.name}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={onCancelEdit}
                className="flex-1 px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-[#323B42] hover:bg-[#F8FAFB] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onSaveEdit}
                className="flex-1 px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[14px] font-medium hover:bg-[#008967] transition-colors"
              >
                Save Changes
              </button>
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
    <div>
      <h2 className="text-[30px] font-bold text-[#323B42] mb-6">
        {editingId ? 'Edit Item' : 'Add New Item'}
      </h2>

      <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-8 max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-6">
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
              <label className="block text-[14px] font-medium text-[#323B42] mb-2">Price (â‚±)</label>
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
            {editingId && (
              <button
                type="button"
                onClick={onCancel}
                className="px-6 py-3 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-[#323B42] hover:bg-[#F8FAFB] transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// Reports View
