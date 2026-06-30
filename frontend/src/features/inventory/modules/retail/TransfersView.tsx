import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, X, Search, Package, ArrowRightLeft, CheckCircle, RefreshCw, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import {
  useCancelRetailTransferMutation,
  useCompleteRetailTransferMutation,
  useCreateRetailTransferMutation,
  useDispatchRetailTransferMutation,
  useRetailInventoryRecordsQuery,
  useRetailLocationsQuery,
  useRetailTransferRecordsQuery,
} from '../lib/retail';
import StockAdjustmentsView from './StockAdjustmentsView';
import { getManilaDateKey } from '../../../../shared/utils/date';

const TRANSFER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  IN_TRANSIT: 'In Transit',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const TRANSFER_STATUS_CLASS: Record<string, string> = {
  PENDING: 'bg-warning/10 text-warning',
  IN_TRANSIT: 'bg-secondary/10 text-secondary',
  COMPLETED: 'bg-secondary/10 text-secondary',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

export default function TransfersView({
  currentUser,
}: {
  currentUser: { email: string; role: string } | null;
}) {
  const transfersQuery = useRetailTransferRecordsQuery();
  const locationsQuery = useRetailLocationsQuery();
  const inventoryQuery = useRetailInventoryRecordsQuery();
  const createTransferMutation = useCreateRetailTransferMutation();
  const dispatchTransferMutation = useDispatchRetailTransferMutation();
  const completeTransferMutation = useCompleteRetailTransferMutation();
  const cancelTransferMutation = useCancelRetailTransferMutation();
  const transfers = transfersQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const inventory = inventoryQuery.data ?? [];
  const loading = transfersQuery.isLoading || locationsQuery.isLoading || inventoryQuery.isLoading;
  // Staff can request (create) and cancel a pending transfer; only an Admin can
  // dispatch/complete it (those steps move stock). Mirrors the backend guards.
  const isAdmin = currentUser?.role === 'Admin';
  const [activeTab, setActiveTab] = useState<'transfers' | 'adjustments'>('transfers');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showItemSelector, setShowItemSelector] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [highlightTransferId, setHighlightTransferId] = useState<string | null>(null);

  // Focus the right tab when arriving from a notification deep-link (handles both
  // navigating in fresh and the page already being mounted), and for a transfer
  // remember which row to scroll to + highlight.
  useEffect(() => {
    const applyDeeplink = () => {
      const hint = window.__INVENTORY_DEEPLINK__;
      if (!hint) return;
      if (hint.entityType === 'StockAdjustment') {
        setActiveTab('adjustments');
        // Leave the breadcrumb for the embedded StockAdjustmentsView to consume.
        return;
      }
      if (hint.entityType === 'TRANSFER') {
        setActiveTab('transfers');
        if (hint.entityId) {
          setFilterStatus('all');
          setHighlightTransferId(hint.entityId);
        }
      }
      window.__INVENTORY_DEEPLINK__ = null;
    };
    applyDeeplink();
    window.addEventListener('inventory:deeplink', applyDeeplink);
    return () => window.removeEventListener('inventory:deeplink', applyDeeplink);
  }, []);

  const [transferForm, setTransferForm] = useState({
    fromLocationId: '',
    toLocationId: '',
    notes: '',
    items: [] as { inventoryItemId: string; name: string; quantity: number; maxQuantity: number; locationId: string }[],
  });

  const availableItemsForTransfer = inventory.filter(
    (item: any) => item.locationId === transferForm.fromLocationId && item.quantity > 0
  );

  const toggleCategory = (cat: string) => {
    const n = new Set(expandedCategories);
    n.has(cat) ? n.delete(cat) : n.add(cat);
    setExpandedCategories(n);
  };

  const toggleSubcategory = (key: string) => {
    const n = new Set(expandedSubcategories);
    n.has(key) ? n.delete(key) : n.add(key);
    setExpandedSubcategories(n);
  };

  const groupedAvailableItems = useMemo(() => {
    const filtered = availableItemsForTransfer.filter((item: any) =>
      item.name.toLowerCase().includes(itemSearchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(itemSearchTerm.toLowerCase())
    );
    const grouped: Record<string, Record<string, any[]>> = {};
    filtered.forEach((item: any) => {
      const cat = item.category || 'Uncategorized';
      const sub = item.subcategory || 'Other';
      if (!grouped[cat]) grouped[cat] = {};
      if (!grouped[cat][sub]) grouped[cat][sub] = [];
      grouped[cat][sub].push(item);
    });
    return grouped;
  }, [availableItemsForTransfer, itemSearchTerm]);

  const handleAddItemToTransfer = (item: any) => {
    if (!transferForm.items.find(i => i.inventoryItemId === item.id)) {
      setTransferForm({ ...transferForm, items: [...transferForm.items, { inventoryItemId: item.id, name: item.name, quantity: 1, maxQuantity: item.quantity, locationId: item.locationId }] });
    }
    setShowItemSelector(false);
  };

  const handleCreateTransfer = async () => {
    if (!transferForm.fromLocationId || !transferForm.toLocationId || transferForm.items.length === 0) {
      toast.error('Fill in all required fields and add at least one item');
      return;
    }
    setSaving(true);
    try {
      await createTransferMutation.mutateAsync({
        fromLocationId: transferForm.fromLocationId,
        toLocationId: transferForm.toLocationId,
        notes: transferForm.notes || undefined,
        items: transferForm.items.map(i => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity })),
      });
      setTransferForm({ fromLocationId: '', toLocationId: '', notes: '', items: [] });
      setShowTransferModal(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create transfer');
    } finally {
      setSaving(false);
    }
  };

  const handleDispatch = async (id: string) => {
    try {
      await dispatchTransferMutation.mutateAsync(id);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to dispatch transfer');
    }
  };

  const handleComplete = async (id: string) => {
    if (!confirm('Complete this transfer? Stock will be moved.')) return;
    try {
      await completeTransferMutation.mutateAsync(id);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to complete transfer');
    }
  };

  const openCancel = (transfer: any) => {
    setCancelTarget(transfer);
    setCancelReason('');
    setShowCancelModal(true);
  };

  const closeCancel = () => {
    setShowCancelModal(false);
    setCancelTarget(null);
    setCancelReason('');
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const trimmed = cancelReason.trim();
    if (!trimmed) {
      toast.error('Please provide a reason for cancelling this request.');
      return;
    }
    try {
      await cancelTransferMutation.mutateAsync({ id: cancelTarget.id, reason: trimmed });
      toast.success('Transfer request cancelled');
      closeCancel();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to cancel transfer');
    }
  };

  const filteredTransfers = transfers.filter(t => filterStatus === 'all' || t.status === filterStatus);

  // Once the deep-linked transfer card is in the DOM, scroll to + briefly highlight it.
  useEffect(() => {
    if (!highlightTransferId) return;
    const el = document.getElementById(`tr-${highlightTransferId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setHighlightTransferId(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightTransferId, filteredTransfers]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading transfers…</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[30px] font-bold text-foreground">Transfers & Adjustments</h2>
          <p className="text-foreground text-[14px] mt-1">Manage inventory transfers and stock adjustments</p>
        </div>
        {activeTab === 'transfers' && (
          <div className="flex gap-3">
            <button onClick={() => setShowTransferModal(true)} className="bg-secondary text-white px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-secondary/90 hover:-translate-y-0.5 hover:shadow-md hover:shadow-secondary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 active:translate-y-0 active:shadow-sm transition-all duration-200">
              <ArrowRightLeft className="size-4" />
              New Transfer
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-card border border-border rounded-[14px] overflow-hidden mb-4">
        <div className="flex border-b border-border">
          <button onClick={() => setActiveTab('transfers')} className={`flex-1 px-6 py-3 text-[16px] font-medium transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary/50 relative ${activeTab === 'transfers' ? 'bg-secondary/10 text-secondary' : 'text-foreground hover:bg-muted'}`}>
            {activeTab === 'transfers' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-secondary" />}
            <div className="flex items-center justify-center gap-2">
              <ArrowRightLeft className="size-5" />
              Transfers
              <span className={`px-2 py-0.5 rounded text-[12px] font-semibold ${activeTab === 'transfers' ? 'bg-secondary text-white' : 'bg-muted text-foreground'}`}>{transfers.length}</span>
            </div>
          </button>
          <button onClick={() => setActiveTab('adjustments')} className={`flex-1 px-6 py-3 text-[16px] font-medium transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary/50 relative ${activeTab === 'adjustments' ? 'bg-secondary/10 text-secondary' : 'text-foreground hover:bg-muted'}`}>
            {activeTab === 'adjustments' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-secondary" />}
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="size-5" />
              Adjustments
            </div>
          </button>
        </div>
      </div>

      {/* Filter — only for transfers tab */}
      {activeTab === 'transfers' && (
        <div className="bg-card border border-border rounded-[14px] mb-4 p-4">
          <div className="flex items-center gap-2">
            <label className="text-[14px] text-foreground font-medium">Status:</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-1.5 border border-border rounded-[6px] text-[14px] bg-card focus:outline-none focus:border-secondary">
              <option value="all">All</option>
              <option value="PENDING">Pending</option>
              <option value="IN_TRANSIT">In Transit</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      {activeTab === 'transfers' ? (
        <div className="space-y-4">
          {filteredTransfers.length === 0 ? (
            <div className="bg-card border border-border rounded-[14px] p-12 text-center">
              <ArrowRightLeft className="size-16 text-muted mx-auto mb-4" />
              <p className="text-[16px] text-foreground font-medium">No transfers found</p>
              <p className="text-[14px] text-muted-foreground mt-1">Create a transfer to move items between locations</p>
            </div>
          ) : (
            filteredTransfers.map((transfer: any) => (
              <div key={transfer.id} id={`tr-${transfer.id}`} className={`bg-card border border-border rounded-[14px] p-6 ${transfer.id === highlightTransferId ? 'ring-2 ring-secondary ring-offset-2' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-[18px] font-semibold text-foreground">{transfer.transferNumber}</h3>
                      <span className={`px-3 py-1 rounded text-[12px] font-semibold ${TRANSFER_STATUS_CLASS[transfer.status] ?? ''}`}>
                        {TRANSFER_STATUS_LABEL[transfer.status] ?? transfer.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[14px] text-foreground mb-2">
                      <span className="font-medium">{transfer.fromLocation?.name}</span>
                      <ArrowRightLeft className="size-4 text-secondary" />
                      <span className="font-medium">{transfer.toLocation?.name}</span>
                    </div>
                    <p className="text-[13px] text-muted-foreground">Date: {getManilaDateKey(transfer.createdAt)}</p>
                    {transfer.createdBy && <p className="text-[13px] text-muted-foreground">Created by: {transfer.createdBy.name}</p>}
                    {transfer.notes && <p className="text-[13px] text-muted-foreground mt-1">Notes: {transfer.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[20px] font-bold text-foreground">{transfer.items?.length}</p>
                    <p className="text-[12px] text-muted-foreground">items</p>
                  </div>
                </div>

                <div className="border-t border-border pt-4 mb-4">
                  <p className="text-[14px] font-medium text-foreground mb-2">Items:</p>
                  <div className="space-y-2">
                    {transfer.items?.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between text-[13px] bg-muted rounded px-3 py-2">
                        <span className="text-foreground font-medium">{item.inventoryItem?.name ?? item.inventoryItemId}</span>
                        <span className="text-foreground">Qty: <span className="font-semibold text-secondary">{item.quantity}</span></span>
                      </div>
                    ))}
                  </div>
                </div>

                {transfer.status === 'PENDING' && (
                  <div className="flex gap-2">
                    {isAdmin && (
                      <button onClick={() => handleDispatch(transfer.id)} className="flex-1 px-4 py-2 bg-secondary text-white rounded-[8px] text-[14px] font-medium hover:bg-secondary">
                        Start Transit
                      </button>
                    )}
                    <button onClick={() => openCancel(transfer)} className="flex-1 px-4 py-2 border border-destructive text-destructive rounded-[8px] text-[14px] font-medium hover:bg-destructive/10">
                      Cancel
                    </button>
                  </div>
                )}

                {transfer.status === 'IN_TRANSIT' && (
                  isAdmin ? (
                    <div className="flex gap-2">
                      <button onClick={() => handleComplete(transfer.id)} className="flex-1 px-4 py-2 bg-secondary text-white rounded-[8px] text-[14px] font-medium hover:bg-secondary">
                        Complete Transfer
                      </button>
                      <button onClick={() => openCancel(transfer)} className="flex-1 px-4 py-2 border border-destructive text-destructive rounded-[8px] text-[14px] font-medium hover:bg-destructive/10">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted-foreground text-center py-2">In transit — awaiting an Admin to complete.</p>
                  )
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <StockAdjustmentsView currentUser={currentUser} embedded />
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-[14px] p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[24px] font-bold text-foreground">Create Transfer</h3>
              <button onClick={() => { setShowTransferModal(false); setTransferForm({ fromLocationId: '', toLocationId: '', notes: '', items: [] }); }} className="p-2 hover:bg-muted rounded">
                <X className="size-5 text-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">From Location *</label>
                  <select value={transferForm.fromLocationId} onChange={(e) => setTransferForm({ ...transferForm, fromLocationId: e.target.value, items: [] })} className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary">
                    <option value="">Select location</option>
                    {locations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">To Location *</label>
                  <select value={transferForm.toLocationId} onChange={(e) => setTransferForm({ ...transferForm, toLocationId: e.target.value })} className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary">
                    <option value="">Select location</option>
                    {locations.filter((loc: any) => loc.id !== transferForm.fromLocationId).map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[14px] font-medium text-foreground mb-2">Notes</label>
                <textarea value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary" rows={2} placeholder="Optional notes" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[16px] font-semibold text-foreground">Items ({transferForm.items.length})</h4>
                  <button onClick={() => setShowItemSelector(true)} disabled={!transferForm.fromLocationId} className="px-3 py-1.5 bg-secondary text-white rounded-[6px] text-[13px] font-medium flex items-center gap-2 hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed">
                    <Plus className="size-3" /> Add Item
                  </button>
                </div>
                {transferForm.items.length === 0 ? (
                  <p className="text-[14px] text-muted-foreground text-center py-8">{!transferForm.fromLocationId ? 'Select a source location first' : 'No items added yet'}</p>
                ) : (
                  <div className="space-y-2">
                    {transferForm.items.map((item) => (
                      <div key={item.inventoryItemId} className="flex items-center justify-between bg-muted rounded-[8px] px-4 py-3">
                        <div className="flex-1">
                          <p className="text-[14px] font-medium text-foreground">{item.name}</p>
                          <p className="text-[12px] text-muted-foreground">Available: {item.maxQuantity}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setTransferForm({ ...transferForm, items: transferForm.items.map(i => i.inventoryItemId === item.inventoryItemId ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i) })} className="w-6 h-6 flex items-center justify-center bg-card border border-border rounded text-foreground hover:bg-muted">-</button>
                            <span className="text-[14px] font-medium text-foreground w-8 text-center">{item.quantity}</span>
                            <button onClick={() => setTransferForm({ ...transferForm, items: transferForm.items.map(i => i.inventoryItemId === item.inventoryItemId ? { ...i, quantity: Math.min(i.maxQuantity, i.quantity + 1) } : i) })} disabled={item.quantity >= item.maxQuantity} className="w-6 h-6 flex items-center justify-center bg-card border border-border rounded text-foreground hover:bg-muted">+</button>
                          </div>
                          <button onClick={() => setTransferForm({ ...transferForm, items: transferForm.items.filter(i => i.inventoryItemId !== item.inventoryItemId) })} className="text-destructive hover:bg-destructive/10 p-1 rounded"><Trash2 className="size-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowTransferModal(false); setTransferForm({ fromLocationId: '', toLocationId: '', notes: '', items: [] }); }} className="flex-1 px-4 py-2 border border-border rounded-[8px] text-[14px] font-medium text-foreground hover:bg-muted">Cancel</button>
              <button onClick={handleCreateTransfer} disabled={saving} className="flex-1 px-4 py-2 bg-secondary text-white rounded-[8px] text-[14px] font-medium hover:bg-secondary disabled:opacity-60">{saving ? 'Creating…' : 'Create Transfer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Item Selector Modal */}
      {showItemSelector && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-[14px] p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[20px] font-bold text-foreground">Select Items</h3>
                <p className="text-[14px] text-muted-foreground mt-1">{`Items from ${locations.find((l: any) => l.id === transferForm.fromLocationId)?.name ?? 'selected location'}`}</p>
              </div>
              <button onClick={() => { setShowItemSelector(false); setItemSearchTerm(''); setExpandedCategories(new Set()); setExpandedSubcategories(new Set()); }} className="p-2 hover:bg-muted rounded"><X className="size-5 text-foreground" /></button>
            </div>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input type="text" value={itemSearchTerm} onChange={(e) => setItemSearchTerm(e.target.value)} placeholder="Search items…" className="w-full pl-10 pr-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary" />
              </div>
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {Object.keys(groupedAvailableItems).length === 0 ? (
                <div className="text-center py-12">
                  <Package className="size-16 text-muted mx-auto mb-3" />
                  <p className="text-[16px] text-foreground font-medium">No items found</p>
                  <p className="text-[14px] text-muted-foreground mt-1">{itemSearchTerm ? 'Try adjusting your search' : 'No items in the selected location'}</p>
                </div>
              ) : (
                Object.entries(groupedAvailableItems).map(([category, subcategories]) => {
                  const isExpanded = expandedCategories.has(category);
                  const count = Object.values(subcategories).flat().length;
                  return (
                    <div key={category} className="border border-border rounded-[10px] overflow-hidden">
                      <button onClick={() => toggleCategory(category)} className="w-full flex items-center gap-3 px-4 py-3 bg-muted hover:bg-muted">
                        {isExpanded ? <ChevronDown className="size-5 text-foreground" /> : <ChevronRight className="size-5 text-foreground" />}
                        <Package className="size-5 text-secondary" />
                        <span className="text-[16px] font-semibold text-foreground">{category}</span>
                        <span className="ml-auto text-[13px] text-foreground bg-card px-3 py-1 rounded-full font-medium">{count} items</span>
                      </button>
                      {isExpanded && (
                        <div className="bg-card">
                          {Object.entries(subcategories).map(([sub, items]) => {
                            const key = `${category}-${sub}`;
                            const isSubExpanded = expandedSubcategories.has(key);
                            return (
                              <div key={key} className="border-t border-border">
                                <button onClick={() => toggleSubcategory(key)} className="w-full flex items-center gap-3 px-6 py-2.5 hover:bg-muted">
                                  {isSubExpanded ? <ChevronDown className="size-4 text-foreground" /> : <ChevronRight className="size-4 text-foreground" />}
                                  <span className="text-[14px] font-medium text-foreground">{sub}</span>
                                  <span className="ml-auto text-[12px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{items.length}</span>
                                </button>
                                {isSubExpanded && (
                                  <div className="bg-muted px-6 py-2 space-y-2">
                                    {items.map((item: any) => {
                                      const isAdded = transferForm.items.some(i => i.inventoryItemId === item.id);
                                      return (
                                        <div key={item.id} className="flex items-center justify-between p-3 bg-card border border-border rounded-[8px] hover:border-secondary">
                                          <div className="flex-1">
                                            <p className="text-[14px] font-medium text-foreground">{item.name}</p>
                                            <div className="flex items-center gap-3 mt-1">
                                              <span className="text-[12px] text-muted-foreground"><span className="font-medium">Location:</span> {item.location?.name}</span>
                                              <span className="text-[12px] text-muted-foreground">•</span>
                                              <span className="text-[12px] text-muted-foreground"><span className="font-medium">Qty:</span> {item.quantity}</span>
                                            </div>
                                          </div>
                                          <button onClick={() => handleAddItemToTransfer(item)} disabled={isAdded} className={`px-4 py-2 rounded-[6px] text-[13px] font-medium ml-4 ${isAdded ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-secondary text-white hover:bg-secondary'}`}>
                                            {isAdded ? 'Added' : 'Add Item'}
                                          </button>
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
                })
              )}
            </div>
            <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
              <p className="text-[14px] text-muted-foreground">{transferForm.items.length} item(s) selected</p>
              <button onClick={() => { setShowItemSelector(false); setItemSearchTerm(''); setExpandedCategories(new Set()); setExpandedSubcategories(new Set()); }} className="px-4 py-2 bg-secondary text-white rounded-[8px] text-[14px] font-medium hover:bg-secondary">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel / Reject Transfer Modal */}
      {showCancelModal && cancelTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] w-full max-w-md max-h-[90vh] overflow-y-auto border border-border">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="text-[20px] font-bold text-foreground">Cancel Transfer Request</h3>
              <button onClick={closeCancel} className="p-2 hover:bg-muted rounded">
                <X className="size-5 text-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between rounded-[8px] border border-border bg-muted px-3 py-2.5">
                <span className="text-[12px] text-muted-foreground">Transfer</span>
                <span className="text-[14px] font-semibold text-secondary">{cancelTarget.transferNumber}</span>
              </div>
              <div className="flex items-center gap-2 text-[14px] text-foreground">
                <span className="font-medium">{cancelTarget.fromLocation?.name}</span>
                <ArrowRightLeft className="size-4 text-secondary" />
                <span className="font-medium">{cancelTarget.toLocation?.name}</span>
              </div>
              <div>
                <label className="mb-1 block text-[14px] font-medium text-foreground">
                  Reason for cancellation <span className="font-normal text-muted-foreground">(required)</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Insufficient stock at source, duplicate request, wrong destination…"
                  rows={3}
                  className="w-full rounded-[8px] border border-border px-3 py-2 text-[14px] focus:outline-none focus:border-secondary focus:ring-2 focus:ring-destructive/30"
                />
              </div>
              <div className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-[12px] text-destructive">
                  Cancelling rejects this request{cancelTarget.status === 'IN_TRANSIT' ? ' and returns the in-transit stock to the source' : ''}. The reason is recorded on the transfer and audit trail.
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-border">
              <button
                onClick={closeCancel}
                className="flex-1 px-4 py-2 border border-border rounded-[8px] text-[14px] font-medium text-foreground hover:bg-muted"
              >
                Keep Request
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelTransferMutation.isPending || cancelReason.trim().length === 0}
                title={cancelReason.trim().length === 0 ? 'Enter a reason to cancel' : undefined}
                className="flex-1 px-4 py-2 bg-destructive text-white rounded-[8px] text-[14px] font-medium hover:bg-destructive/90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {cancelTransferMutation.isPending ? 'Cancelling…' : 'Cancel Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
