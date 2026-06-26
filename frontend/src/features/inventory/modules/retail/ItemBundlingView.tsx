import React, { useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Search, ChevronRight, ChevronDown, Folder, FolderOpen, AlertTriangle, Package, PackagePlus, ShoppingCart, PackageCheck, Layers, X, Eye, TrendingUp, TrendingDown, RefreshCw, CheckCircle, Users, Archive, RotateCcw } from 'lucide-react';
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
import {
  useActivateRetailBundleMutation,
  useApproveRetailBundleMutation,
  useArchiveRetailBundleMutation,
  useCreateRetailBundleMutation,
  useDeactivateRetailBundleMutation,
  useDeleteRetailBundleMutation,
  useRejectRetailBundleMutation,
  useRestoreRetailBundleMutation,
  useRetailBundlesQuery,
  useRetailInventoryRecordsQuery,
  useUpdateRetailBundleMutation,
} from '../lib/retail';

export function ItemBundlingView({
  currentUser
}: {
  currentUser: { email: string; role: string } | null;
}) {
  const [viewArchived, setViewArchived] = useState(false);
  const bundlesQuery = useRetailBundlesQuery({ archived: viewArchived });
  const inventoryQuery = useRetailInventoryRecordsQuery();
  const createBundleMutation = useCreateRetailBundleMutation();
  const updateBundleMutation = useUpdateRetailBundleMutation();
  const approveBundleMutation = useApproveRetailBundleMutation();
  const rejectBundleMutation = useRejectRetailBundleMutation();
  const activateBundleMutation = useActivateRetailBundleMutation();
  const deactivateBundleMutation = useDeactivateRetailBundleMutation();
  const archiveBundleMutation = useArchiveRetailBundleMutation();
  const restoreBundleMutation = useRestoreRetailBundleMutation();
  const deleteBundleMutation = useDeleteRetailBundleMutation();
  const bundles = bundlesQuery.data ?? [];
  const inventory = inventoryQuery.data ?? [];
  const loading = bundlesQuery.isLoading || inventoryQuery.isLoading;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showItemSelector, setShowItemSelector] = useState(false);

  const [selectedBundle, setSelectedBundle] = useState<any | null>(null);
  const [bundleForm, setBundleForm] = useState({
    name: '',
    items: [] as { inventoryItemId: string; quantity: number }[],
    discount: 0
  });
  const [rejectionReason, setRejectionReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  const isAdmin = currentUser?.role === 'Admin';

  // ─── Derived state ───────────────────────────────────────────────────────────

  const availableItems = inventory.filter((item: any) => item.quantity > 0 && item.condition !== 'Damaged');
  const availableCategories = Array.from(new Set(availableItems.map((item: any) => item.category as string))).sort();
  const filteredAvailableItems = availableItems.filter((item: any) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(itemSearchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(itemSearchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredBundles = bundles.filter((bundle: any) => {
    const matchesSearch = bundle.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || bundle.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: bundles.length,
    pending: bundles.filter((b: any) => b.status === 'PENDING').length,
    active: bundles.filter((b: any) => b.status === 'ACTIVE').length,
    totalValue: bundles.filter((b: any) => b.status === 'ACTIVE').reduce((sum: number, b: any) => sum + b.price, 0),
  };

  // Stat cards toggle the status filter that drives the bundle list; clicking the
  // active card (or Total Bundles) clears it back to "all".
  const toggleFilterStatus = (status: string) => {
    setFilterStatus((current) => (current === status ? 'all' : status));
  };
  const statCardClass = (active: boolean) =>
    `group text-left w-full bg-card rounded-2xl p-6 shadow-sm border cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-secondary/25 hover:border-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 active:translate-y-0 active:shadow-lg active:shadow-secondary/30 ${
      active ? 'border-secondary bg-secondary/5 shadow-md shadow-secondary/20' : 'border-border'
    }`;

  // ─── Bundle price calculation (uses local form state + fetched inventory) ────

  const calculateFormPrice = (items: { inventoryItemId: string; quantity: number }[], discount: number) => {
    const total = items.reduce((sum, fi) => {
      const inv = inventory.find((i: any) => i.id === fi.inventoryItemId);
      return sum + (inv ? inv.price * fi.quantity : 0);
    }, 0);
    return total * (1 - discount / 100);
  };

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setBundleForm({ name: '', items: [], discount: 0 });
    setSelectedBundle(null);
    setRejectionReason('');
  };

  const handleAddItemToBundle = (inventoryItemId: string) => {
    const existing = bundleForm.items.find(i => i.inventoryItemId === inventoryItemId);
    if (existing) {
      setBundleForm(prev => ({
        ...prev,
        items: prev.items.map(i => i.inventoryItemId === inventoryItemId ? { ...i, quantity: i.quantity + 1 } : i)
      }));
    } else {
      setBundleForm(prev => ({ ...prev, items: [...prev.items, { inventoryItemId, quantity: 1 }] }));
    }
  };

  const handleRemoveItemFromBundle = (inventoryItemId: string) => {
    setBundleForm(prev => ({ ...prev, items: prev.items.filter(i => i.inventoryItemId !== inventoryItemId) }));
  };

  const handleUpdateItemQuantity = (inventoryItemId: string, quantity: number) => {
    if (quantity <= 0) { handleRemoveItemFromBundle(inventoryItemId); return; }
    setBundleForm(prev => ({
      ...prev,
      items: prev.items.map(i => i.inventoryItemId === inventoryItemId ? { ...i, quantity } : i)
    }));
  };

  const handleCreateBundle = async () => {
    if (!bundleForm.name || bundleForm.items.length === 0) {
      setError('Please provide a bundle name and add at least one item');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await createBundleMutation.mutateAsync({ name: bundleForm.name, discount: bundleForm.discount, items: bundleForm.items });
      resetForm();
      setShowCreateModal(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditBundle = async () => {
    if (!selectedBundle || !bundleForm.name) return;
    try {
      setSaving(true);
      setError(null);
      await updateBundleMutation.mutateAsync({
        id: selectedBundle.id,
        data: { name: bundleForm.name, discount: bundleForm.discount },
      });
      resetForm();
      setShowEditModal(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApproveBundle = async (id: string) => {
    try {
      setSaving(true);
      setError(null);
      await approveBundleMutation.mutateAsync(id);
      setShowApprovalModal(false);
      setSelectedBundle(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRejectBundle = async (id: string) => {
    if (!rejectionReason.trim()) { setError('Please provide a rejection reason'); return; }
    try {
      setSaving(true);
      setError(null);
      await rejectBundleMutation.mutateAsync({ id, reason: rejectionReason });
      setShowApprovalModal(false);
      setSelectedBundle(null);
      setRejectionReason('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleActivateBundle = async (id: string) => {
    try { setSaving(true); await activateBundleMutation.mutateAsync(id); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDeactivateBundle = async (id: string) => {
    try { setSaving(true); await deactivateBundleMutation.mutateAsync(id); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleArchiveBundle = async (id: string) => {
    try { setSaving(true); setError(null); await archiveBundleMutation.mutateAsync(id); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleRestoreBundle = async (id: string) => {
    try { setSaving(true); setError(null); await restoreBundleMutation.mutateAsync(id); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDeleteBundle = async (id: string) => {
    if (!confirm('Permanently delete this bundle? This cannot be undone.')) return;
    try { setSaving(true); await deleteBundleMutation.mutateAsync(id); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const openEditModal = (bundle: any) => {
    setSelectedBundle(bundle);
    setBundleForm({
      name: bundle.name,
      discount: bundle.discount,
      items: (bundle.items ?? []).map((bi: any) => ({ inventoryItemId: bi.inventoryItemId, quantity: bi.quantity })),
    });
    setShowEditModal(true);
  };

  // ─── Status display helpers ───────────────────────────────────────────────────

  const STATUS_LABEL: Record<string, string> = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
  };

  const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    PENDING:  { bg: 'bg-warning/10', text: 'text-warning' },
    APPROVED: { bg: 'bg-accent/10', text: 'text-accent' },
    REJECTED: { bg: 'bg-destructive/10', text: 'text-destructive' },
    ACTIVE:   { bg: 'bg-secondary/10', text: 'text-success' },
    INACTIVE: { bg: 'bg-muted', text: 'text-muted-foreground' },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[30px] font-bold text-foreground">Item Bundling</h2>
          <p className="text-foreground text-[14px] mt-1">
            {viewArchived ? 'Archived bundles — restore or remove permanently' : 'Create combo deals and package offers'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => { setViewArchived((v) => !v); setFilterStatus('all'); }}
              aria-pressed={viewArchived}
              className={`px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center gap-2 border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 ${
                viewArchived
                  ? 'bg-secondary/10 text-secondary border-secondary/60'
                  : 'bg-white text-foreground border-border hover:border-secondary/60'
              }`}
            >
              <Archive className="size-4" />
              {viewArchived ? 'Back to Active' : 'Archived'}
            </button>
          )}
          {!viewArchived && (
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={loading}
              className="bg-secondary text-white px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-secondary/90 hover:-translate-y-0.5 hover:shadow-md hover:shadow-secondary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 active:translate-y-0 active:shadow-sm transition-all duration-200 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
            >
              <Plus className="size-4" />
              Create Bundle
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-[8px] text-[14px] text-destructive">
          {error}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-[14px] p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[24px] font-bold text-foreground">
                {showCreateModal ? 'Create New Bundle' : 'Edit Bundle'}
              </h3>
              <button onClick={() => { resetForm(); setShowCreateModal(false); setShowEditModal(false); }} className="p-2 hover:bg-muted rounded">
                <X className="size-5 text-foreground" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[14px] font-medium text-foreground mb-2">Bundle Name *</label>
                <input
                  type="text"
                  value={bundleForm.name}
                  onChange={(e) => setBundleForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                  placeholder="e.g., Summer Outfit Bundle"
                />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-foreground mb-2">Discount (%) *</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={bundleForm.discount}
                  onChange={(e) => setBundleForm(prev => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))}
                  onFocus={(e) => { if (e.target.value === '0') e.target.select(); }}
                  className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                  placeholder="e.g., 15"
                />
              </div>
            </div>

            <div className="border-t border-border pt-4 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[16px] font-semibold text-foreground">Bundle Items ({bundleForm.items.length})</h4>
                <button
                  onClick={() => setShowItemSelector(true)}
                  className="px-3 py-1.5 bg-secondary text-white rounded-[6px] text-[13px] font-medium flex items-center gap-2 hover:bg-secondary transition-colors"
                >
                  <Plus className="size-3" />
                  Add Item
                </button>
              </div>

              {bundleForm.items.length === 0 ? (
                <p className="text-[14px] text-foreground text-center py-8">No items added yet</p>
              ) : (
                <div className="space-y-2">
                  {bundleForm.items.map((fi) => {
                    const inv = inventory.find((i: any) => i.id === fi.inventoryItemId);
                    return inv ? (
                      <div key={fi.inventoryItemId} className="flex items-center justify-between bg-muted rounded-[8px] px-4 py-3">
                        <div className="flex-1">
                          <p className="text-[14px] font-medium text-foreground">{inv.name}</p>
                          <p className="text-[12px] text-muted-foreground">{inv.category} • ₱{inv.price}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleUpdateItemQuantity(fi.inventoryItemId, fi.quantity - 1)} className="w-6 h-6 flex items-center justify-center bg-card border border-border rounded text-foreground hover:bg-muted">-</button>
                            <span className="text-[14px] font-medium text-foreground w-8 text-center">{fi.quantity}</span>
                            <button onClick={() => handleUpdateItemQuantity(fi.inventoryItemId, fi.quantity + 1)} disabled={fi.quantity >= inv.quantity} className="w-6 h-6 flex items-center justify-center bg-card border border-border rounded text-foreground hover:bg-muted disabled:opacity-50">+</button>
                          </div>
                          <span className="text-[14px] font-semibold text-foreground w-20 text-right">₱{(inv.price * fi.quantity).toLocaleString()}</span>
                          <button onClick={() => handleRemoveItemFromBundle(fi.inventoryItemId)} className="text-destructive hover:bg-destructive/10 p-1 rounded">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            {bundleForm.items.length > 0 && (
              <div className="bg-muted rounded-[12px] p-4 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[14px] text-foreground">Original Total:</span>
                  <span className="text-[16px] font-medium text-foreground line-through">₱{calculateFormPrice(bundleForm.items, 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[14px] text-foreground">Discount ({bundleForm.discount}%):</span>
                  <span className="text-[16px] font-medium text-destructive">-₱{(calculateFormPrice(bundleForm.items, 0) - calculateFormPrice(bundleForm.items, bundleForm.discount)).toLocaleString()}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between items-center">
                  <span className="text-[16px] font-semibold text-foreground">Bundle Price:</span>
                  <span className="text-[24px] font-bold text-secondary">₱{calculateFormPrice(bundleForm.items, bundleForm.discount).toLocaleString()}</span>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { resetForm(); setShowCreateModal(false); setShowEditModal(false); }} className="flex-1 px-4 py-2 border border-border rounded-[8px] text-[14px] font-medium text-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={showCreateModal ? handleCreateBundle : handleEditBundle}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-secondary text-white rounded-[8px] text-[14px] font-medium hover:bg-secondary transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : (showCreateModal ? 'Create Bundle' : 'Save Changes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && selectedBundle && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-[14px] p-6 max-w-lg w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[20px] font-bold text-foreground">Review Bundle</h3>
              <button onClick={() => { setShowApprovalModal(false); setSelectedBundle(null); setRejectionReason(''); }} className="p-2 hover:bg-muted rounded">
                <X className="size-5 text-foreground" />
              </button>
            </div>
            <div className="mb-4 p-4 bg-muted rounded-[8px]">
              <h4 className="text-[16px] font-semibold text-foreground mb-2">{selectedBundle.name}</h4>
              <p className="text-[13px] text-muted-foreground">Created by: {selectedBundle.createdBy?.name ?? 'N/A'}</p>
              <p className="text-[13px] text-muted-foreground">Date: {new Date(selectedBundle.createdAt).toLocaleDateString()}</p>
              <p className="text-[13px] text-muted-foreground">Items: {(selectedBundle.items ?? []).length}</p>
              <p className="text-[13px] text-muted-foreground">Discount: {selectedBundle.discount}%</p>
              <p className="text-[16px] font-bold text-secondary mt-2">Price: ₱{selectedBundle.price.toLocaleString()}</p>
            </div>
            <div className="mb-4">
              <label className="block text-[14px] font-medium text-foreground mb-2">Rejection Reason (required if rejecting)</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary resize-none"
                rows={3}
                placeholder="Provide a reason if rejecting this bundle..."
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleRejectBundle(selectedBundle.id)} disabled={saving} className="flex-1 px-4 py-2 bg-destructive text-white rounded-[8px] text-[14px] font-medium hover:bg-destructive transition-colors disabled:opacity-50">
                Reject
              </button>
              <button onClick={() => handleApproveBundle(selectedBundle.id)} disabled={saving} className="flex-1 px-4 py-2 bg-success text-white rounded-[8px] text-[14px] font-medium hover:bg-success transition-colors disabled:opacity-50">
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Selector Modal */}
      {showItemSelector && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-[14px] p-6 max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[20px] font-bold text-foreground">Select Items for Bundle</h3>
              <button onClick={() => { setShowItemSelector(false); setSelectedCategory('all'); setItemSearchTerm(''); }} className="p-2 hover:bg-muted rounded">
                <X className="size-5 text-foreground" />
              </button>
            </div>
            <div className="mb-4 pb-4 border-b border-border">
              <p className="text-[12px] font-medium text-foreground mb-3">Filter by Category:</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setSelectedCategory('all')} className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all ${selectedCategory === 'all' ? 'bg-secondary text-white shadow-md' : 'bg-muted text-foreground hover:bg-muted'}`}>
                  All Items ({availableItems.length})
                </button>
                {availableCategories.map((category: any) => (
                  <button key={category} onClick={() => setSelectedCategory(category)} className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all ${selectedCategory === category ? 'bg-secondary text-white shadow-md' : 'bg-muted text-foreground hover:bg-muted'}`}>
                    {category} ({availableItems.filter((i: any) => i.category === category).length})
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                <input type="text" value={itemSearchTerm} onChange={(e) => setItemSearchTerm(e.target.value)} placeholder="Search items by name..." className="w-full pl-10 pr-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredAvailableItems.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No items found</p>
              ) : (
                filteredAvailableItems.map((item: any) => {
                  const isAdded = bundleForm.items.some(i => i.inventoryItemId === item.id);
                  return (
                    <div key={item.id} className="flex items-center justify-between p-3 border border-border rounded-[8px] hover:bg-muted transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[14px] font-medium text-foreground">{item.name}</p>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary/10 text-secondary">{item.category}</span>
                        </div>
                        <p className="text-[12px] text-muted-foreground mt-1">{item.subcategory} • {item.quantity} available • ₱{item.price}</p>
                      </div>
                      <button
                        onClick={() => { handleAddItemToBundle(item.id); setShowItemSelector(false); setSelectedCategory('all'); setItemSearchTerm(''); }}
                        disabled={isAdded}
                        className={`px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors ${isAdded ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-secondary text-white hover:bg-secondary'}`}
                      >
                        {isAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <button type="button" onClick={() => toggleFilterStatus('all')} aria-pressed={filterStatus === 'all'} aria-label="Show all bundles" className={statCardClass(filterStatus === 'all')}>
          <p className="text-muted-foreground text-sm mb-2">Total Bundles</p>
          <p className="text-2xl font-bold text-foreground">{loading ? '—' : stats.total}</p>
        </button>
        <button type="button" onClick={() => toggleFilterStatus('PENDING')} aria-pressed={filterStatus === 'PENDING'} aria-label="Filter by pending approval" className={statCardClass(filterStatus === 'PENDING')}>
          <p className="text-muted-foreground text-sm mb-2">Pending Approval</p>
          <p className="text-2xl font-bold text-warning">{loading ? '—' : stats.pending}</p>
        </button>
        <button type="button" onClick={() => toggleFilterStatus('ACTIVE')} aria-pressed={filterStatus === 'ACTIVE'} aria-label="Filter by active bundles" className={statCardClass(filterStatus === 'ACTIVE')}>
          <p className="text-muted-foreground text-sm mb-2">Active Bundles</p>
          <p className="text-2xl font-bold text-success">{loading ? '—' : stats.active}</p>
        </button>
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
          <p className="text-muted-foreground text-sm mb-2">Active Value</p>
          <p className="text-2xl font-bold text-secondary">₱{loading ? '—' : stats.totalValue.toLocaleString()}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-card border border-border rounded-2xl shadow-sm mb-8 p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 flex items-center gap-2">
            <Search className="size-5 text-muted-foreground" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search bundles..." className="flex-1 text-[14px] focus:outline-none text-foreground" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[14px] font-medium text-foreground">Status:</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-1.5 border border-border rounded-[6px] text-[14px] bg-card focus:outline-none focus:border-secondary">
              <option value="all">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bundles Grid */}
      {loading ? (
        <div className="bg-card border border-border rounded-2xl shadow-sm p-12 text-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : filteredBundles.length === 0 ? (
        <div className="bg-card rounded-2xl p-12 shadow-sm border border-dashed border-border flex flex-col items-center justify-center text-center">
          {viewArchived ? <Archive className="w-10 h-10 text-muted-foreground mb-3" /> : <Layers className="w-10 h-10 text-muted-foreground mb-3" />}
          <p className="text-foreground font-medium">{viewArchived ? 'No archived bundles' : 'No bundles found'}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {viewArchived ? 'Bundles you archive will appear here and can be restored anytime.' : 'Create your first bundle to get started'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBundles.map((bundle: any) => {
            const originalPrice = (bundle.items ?? []).reduce((sum: number, bi: any) => sum + (bi.inventoryItem?.price ?? 0) * bi.quantity, 0);
            const savings = originalPrice - bundle.price;
            const canEdit = isAdmin || bundle.status === 'PENDING' || bundle.status === 'REJECTED';
            const canApprove = isAdmin && bundle.status === 'PENDING';
            const canActivate = isAdmin && (bundle.status === 'APPROVED' || bundle.status === 'INACTIVE');
            const canDeactivate = isAdmin && bundle.status === 'ACTIVE';
            const statusStyle = STATUS_COLORS[bundle.status] ?? STATUS_COLORS.PENDING;

            return (
              <div key={bundle.id} className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-all duration-200 flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-14 h-14 overflow-hidden rounded-xl border border-border bg-muted flex items-center justify-center flex-shrink-0">
                      {bundle.imageUrl ? (
                        <img src={bundle.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Layers className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-foreground line-clamp-2">{bundle.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {(bundle.items ?? []).length} {(bundle.items ?? []).length === 1 ? 'item' : 'items'} • {bundle.discount}% OFF
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 ${statusStyle.bg} ${statusStyle.text}`}>
                    {STATUS_LABEL[bundle.status] ?? bundle.status}
                  </span>
                </div>

                <div className="space-y-1.5 mb-4 flex-1">
                  <div className="max-h-[120px] overflow-y-auto pr-1 space-y-1.5">
                    {(bundle.items ?? []).map((bi: any) => (
                      <div key={bi.id} className="flex items-center justify-between text-sm gap-2">
                        <span className="text-muted-foreground line-clamp-1 flex-1">{bi.inventoryItem?.name ?? 'Unknown'} × {bi.quantity}</span>
                        <span className="font-medium text-foreground shrink-0">₱{((bi.inventoryItem?.price ?? 0) * bi.quantity).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-border mb-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Original Price</p>
                      <p className="text-sm font-semibold text-muted-foreground line-through">₱{originalPrice.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Bundle Price</p>
                      <p className="text-lg font-bold text-secondary">₱{bundle.price.toLocaleString()}</p>
                    </div>
                    <div className="col-span-2 flex items-center justify-between border-t border-border/60 pt-2">
                      <span className="text-xs text-muted-foreground">You save</span>
                      <span className="text-sm font-semibold text-success">₱{savings.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-xs text-muted-foreground truncate">
                    Created {new Date(bundle.createdAt).toLocaleDateString()} by {bundle.createdBy?.name ?? 'N/A'}
                  </p>
                  {bundle.approvedBy && bundle.approvedAt && (
                    <p className="text-[11px] text-success truncate">
                      Approved by {bundle.approvedBy.name} on {new Date(bundle.approvedAt).toLocaleDateString()}
                    </p>
                  )}
                  {bundle.rejectionReason && (
                    <p className="text-[11px] text-destructive mt-1 line-clamp-2">Rejected: {bundle.rejectionReason}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {viewArchived ? (
                    <>
                      <button
                        onClick={() => handleRestoreBundle(bundle.id)}
                        disabled={!isAdmin || saving}
                        className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${isAdmin ? 'bg-green-50 text-green-600 hover:bg-green-100 cursor-pointer' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
                        title="Restore this bundle to the active list"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Restore
                      </button>
                      <button
                        onClick={() => isAdmin && handleDeleteBundle(bundle.id)}
                        disabled={!isAdmin || saving}
                        className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${isAdmin ? 'bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
                        title="Delete permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => canEdit && openEditModal(bundle)}
                        disabled={!canEdit || saving}
                        className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${canEdit ? 'bg-secondary/10 text-secondary hover:bg-secondary/20 cursor-pointer' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => isAdmin && handleArchiveBundle(bundle.id)}
                        disabled={!isAdmin || saving}
                        className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${isAdmin ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 cursor-pointer' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
                        title="Archive bundle (can be restored later)"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                      {isAdmin && canApprove && (
                        <button onClick={() => { setSelectedBundle(bundle); setShowApprovalModal(true); }} disabled={saving} className="w-full px-4 py-2 bg-accent/10 text-accent rounded-xl text-sm font-medium hover:bg-accent/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                          <CheckCircle className="w-4 h-4" />
                          Review Bundle
                        </button>
                      )}
                      {isAdmin && canActivate && (
                        <button onClick={() => handleActivateBundle(bundle.id)} disabled={saving} className="w-full px-4 py-2 bg-success/10 text-success rounded-xl text-sm font-medium hover:bg-success/20 transition-colors disabled:opacity-50">
                          Activate Bundle
                        </button>
                      )}
                      {isAdmin && canDeactivate && (
                        <button onClick={() => handleDeactivateBundle(bundle.id)} disabled={saving} className="w-full px-4 py-2 bg-muted text-muted-foreground rounded-xl text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50">
                          Deactivate Bundle
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// Transfers and Adjustments View

