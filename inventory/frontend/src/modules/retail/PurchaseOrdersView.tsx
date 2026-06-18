import { useState } from 'react';
import { Plus, X, Search, Package, ShoppingCart, CheckCircle, XCircle, Clock, Eye, Users, Trash2 } from 'lucide-react';
import {
  useApproveRetailPurchaseOrderMutation,
  useCancelRetailPurchaseOrderMutation,
  useCreateRetailPurchaseOrderMutation,
  useCreateRetailSupplierMutation,
  useRejectRetailPurchaseOrderMutation,
  useRetailInventoryRecordsQuery,
  useRetailPurchaseOrderRecordsQuery,
  useRetailSuppliersQuery,
  useSubmitRetailPurchaseOrderMutation,
} from '../lib/retail';
import { categorySubcategories } from '../../app/utils/constants';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'bg-[#f3f4f6] text-[#6b7280]',
  SUBMITTED: 'bg-[#fff4e6] text-[#FFA500]',
  APPROVED: 'bg-[#E0F2F2] text-[#007A5E]',
  RECEIVED: 'bg-[#E0F5F1] text-[#008967]',
  CANCELLED: 'bg-[#ffe2e2] text-[#E7000B]',
};

export default function PurchaseOrdersView({
  currentUser,
}: {
  currentUser: { email: string; role: string } | null;
}) {
  const ordersQuery = useRetailPurchaseOrderRecordsQuery();
  const suppliersQuery = useRetailSuppliersQuery();
  const inventoryQuery = useRetailInventoryRecordsQuery();
  const createPurchaseOrderMutation = useCreateRetailPurchaseOrderMutation();
  const submitPurchaseOrderMutation = useSubmitRetailPurchaseOrderMutation();
  const approvePurchaseOrderMutation = useApproveRetailPurchaseOrderMutation();
  const rejectPurchaseOrderMutation = useRejectRetailPurchaseOrderMutation();
  const cancelPurchaseOrderMutation = useCancelRetailPurchaseOrderMutation();
  const createSupplierMutation = useCreateRetailSupplierMutation();
  const orders = ordersQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];
  const inventory = inventoryQuery.data ?? [];
  const loading = ordersQuery.isLoading || suppliersQuery.isLoading || inventoryQuery.isLoading;
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showNewPOModal, setShowNewPOModal] = useState(false);
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [showSuppliersModal, setShowSuppliersModal] = useState(false);
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [showPendingApprovalsModal, setShowPendingApprovalsModal] = useState(false);
  const [selectedPOForAction, setSelectedPOForAction] = useState<string | null>(null);
  const [rejectionRemarks, setRejectionRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const [poForm, setPOForm] = useState({
    supplierId: '' as string | undefined,
    supplierName: '',
    paymentMethod: 'Bank Transfer',
    paymentTerms: '',
    notes: '',
    items: [] as { inventoryItemId?: string; name: string; quantity: number; unitPrice: number; baleType?: string; estimatedWeight?: number; isNew?: boolean }[]
  });

  const [newItemForm, setNewItemForm] = useState({
    inventoryItemId: '',
    name: '',
    category: '',
    subcategory: '',
    newCategory: '',
    newSubcategory: '',
    targetCustomer: 'Unisex' as 'Male' | 'Female' | 'Unisex',
    size: '',
    condition: 'Good' as string,
    baleType: '',
    estimatedWeight: 0,
    quantity: 1,
    unitPrice: 0
  });

  const [showBaleTypeDropdown, setShowBaleTypeDropdown] = useState(false);

  const [newSupplierForm, setNewSupplierForm] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    category: '',
  });

  const baleTypeSuggestions = [
    'Mixed Clothing', 'Ladies Tops', 'Ladies Bottoms', 'Ladies Dresses',
    "Men's Tops", "Men's Bottoms", "Men's Jeans", 'Kids Wear - Mixed',
    'Kids Tops', 'Kids Bottoms', 'Premium Denim', 'Vintage T-Shirts',
    'Designer Labels', 'Mixed Accessories', 'Shoes - Mixed', 'Shoes - Sneakers',
    'Shoes - Formal', 'Bags and Purses', 'Jackets and Coats', 'Winter Wear',
    'Summer Wear', 'Activewear/Sportswear', 'Formal Wear', 'Casual Wear',
    'Underwear and Intimates', 'Sleepwear', 'Mixed Grade A', 'Mixed Grade B', 'Vintage Collection'
  ];

  const filteredBaleTypes = baleTypeSuggestions.filter(t =>
    t.toLowerCase().includes(newItemForm.baleType.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(poForm.supplierName.toLowerCase())
  );

  const handleAddItemToPO = () => {
    if (!newItemForm.baleType || !newItemForm.quantity || !newItemForm.unitPrice) {
      alert('Please fill in Item Name, Quantity, and Unit Cost');
      return;
    }
    const finalCategory = newItemForm.newCategory || newItemForm.category || 'General';
    const finalSubcategory = newItemForm.newSubcategory || newItemForm.subcategory || 'Mixed';
    setPOForm({
      ...poForm,
      items: [...poForm.items, {
        inventoryItemId: newItemForm.inventoryItemId || undefined,
        name: newItemForm.baleType,
        quantity: newItemForm.quantity,
        unitPrice: newItemForm.unitPrice,
        baleType: newItemForm.baleType,
        estimatedWeight: newItemForm.estimatedWeight,
        isNew: !newItemForm.inventoryItemId,
      }]
    });
    setNewItemForm({ inventoryItemId: '', name: '', category: '', subcategory: '', newCategory: '', newSubcategory: '', targetCustomer: 'Unisex', size: '', condition: 'Good', baleType: '', estimatedWeight: 0, quantity: 1, unitPrice: 0 });
    setShowNewItemModal(false);
  };

  const handleCreatePO = async () => {
    if (poForm.items.length === 0) {
      alert('Add at least one item');
      return;
    }
    setSaving(true);
    try {
      await createPurchaseOrderMutation.mutateAsync({
        supplierId: poForm.supplierId || undefined,
        notes: poForm.notes || undefined,
        paymentMethod: poForm.paymentMethod,
        paymentTerms: poForm.paymentTerms || undefined,
        items: poForm.items.map(i => ({
          inventoryItemId: i.inventoryItemId,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      });
      setPOForm({ supplierId: undefined, supplierName: '', paymentMethod: 'Bank Transfer', paymentTerms: '', notes: '', items: [] });
      setShowNewPOModal(false);
    } catch (err: any) {
      alert(err.message ?? 'Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitPO = async (id: string) => {
    try {
      await submitPurchaseOrderMutation.mutateAsync(id);
    } catch (err: any) {
      alert(err.message ?? 'Failed to submit purchase order');
    }
  };

  const handleApprovePO = async (id: string) => {
    try {
      await approvePurchaseOrderMutation.mutateAsync(id);
      setSelectedPOForAction(null);
      setShowPendingApprovalsModal(false);
    } catch (err: any) {
      alert(err.message ?? 'Failed to approve purchase order');
    }
  };

  const handleRejectPO = async (id: string) => {
    if (!rejectionRemarks.trim()) {
      alert('Please provide remarks for rejection');
      return;
    }
    try {
      await rejectPurchaseOrderMutation.mutateAsync({ id, reason: rejectionRemarks });
      setRejectionRemarks('');
      setSelectedPOForAction(null);
    } catch (err: any) {
      alert(err.message ?? 'Failed to reject purchase order');
    }
  };

  const handleCancelPO = async (id: string) => {
    try {
      await cancelPurchaseOrderMutation.mutateAsync(id);
    } catch (err: any) {
      alert(err.message ?? 'Failed to cancel purchase order');
    }
  };

  const handleCreateSupplier = async () => {
    if (!newSupplierForm.name.trim()) {
      alert('Supplier name is required');
      return;
    }
    setSaving(true);
    try {
      await createSupplierMutation.mutateAsync(newSupplierForm);
      setNewSupplierForm({ name: '', contactPerson: '', email: '', phone: '', address: '', category: '' });
      setShowNewSupplierModal(false);
    } catch (err: any) {
      alert(err.message ?? 'Failed to create supplier');
    } finally {
      setSaving(false);
    }
  };

  const filteredOrders = orders.filter(o => filterStatus === 'all' || o.status === filterStatus);
  const submittedPOs = orders.filter(o => o.status === 'SUBMITTED');
  const isAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'Manager';

  const stats = {
    total: orders.length,
    pending: orders.filter(o => ['DRAFT', 'SUBMITTED'].includes(o.status)).length,
    approved: orders.filter(o => o.status === 'APPROVED').length,
    received: orders.filter(o => o.status === 'RECEIVED').length,
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[#6b7280]">Loading purchase orders…</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[30px] font-bold text-[#323B42]">Purchase Orders</h2>
          <p className="text-[#323B42] text-[14px] mt-1">Create POs and register new items</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowSuppliersModal(true)}
            className="bg-white border border-[rgba(0,0,0,0.1)] text-[#323B42] px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-[#F8FAFB] transition-colors"
          >
            <Users className="size-4" />
            View Suppliers
          </button>
          {isAdmin && submittedPOs.length > 0 && (
            <button
              onClick={() => setShowPendingApprovalsModal(true)}
              className="bg-[#FFA500] text-white px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-[#FF8C00] transition-colors relative"
            >
              <Clock className="size-4" />
              Pending Approvals
              <span className="absolute -top-2 -right-2 bg-[#E7000B] text-white size-6 rounded-full flex items-center justify-center text-[12px] font-bold">
                {submittedPOs.length}
              </span>
            </button>
          )}
          <button
            onClick={() => setShowNewPOModal(true)}
            className="bg-[#007A5E] text-white px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-[#008967] transition-colors"
          >
            <Plus className="size-4" />
            New Purchase Order
          </button>
        </div>
      </div>

      {/* New PO Modal */}
      {showNewPOModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#f8fafb] rounded-[12px] p-6 max-w-[512px] w-full max-h-[90vh] overflow-y-auto border border-[rgba(50,59,66,0.15)] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-[18px] font-semibold text-[#003534]">Create Purchase Order</h3>
                <p className="text-[14px] text-[#323b42] mt-1">Create a new purchase order for product deliveries</p>
              </div>
              <button onClick={() => setShowNewPOModal(false)} className="p-2 hover:bg-[rgba(0,0,0,0.05)] rounded-[6px] transition-colors opacity-70">
                <X className="size-4 text-[#323B42]" />
              </button>
            </div>

            <div className="space-y-4 mt-6">
              <div className="relative">
                <label className="block text-[12px] font-medium text-[#323b42] mb-2">Supplier (optional)</label>
                <input
                  type="text"
                  value={poForm.supplierName}
                  onChange={(e) => { setPOForm({ ...poForm, supplierName: e.target.value, supplierId: undefined }); setShowSupplierDropdown(true); }}
                  onFocus={() => setShowSupplierDropdown(true)}
                  onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 300)}
                  className="w-full px-[12.8px] py-[8.8px] bg-white border-[0.8px] border-transparent rounded-[10px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                  placeholder="Select supplier"
                />
                {showSupplierDropdown && filteredSuppliers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-[rgba(50,59,66,0.15)] rounded-[10px] shadow-lg max-h-[240px] overflow-y-auto">
                    {filteredSuppliers.map((s: any) => (
                      <div
                        key={s.id}
                        onMouseDown={(e) => { e.preventDefault(); setPOForm({ ...poForm, supplierId: s.id, supplierName: s.name }); setShowSupplierDropdown(false); }}
                        className="px-4 py-3 hover:bg-[#f8fafb] cursor-pointer border-b border-[rgba(50,59,66,0.1)] last:border-b-0"
                      >
                        <p className="text-[14px] font-medium text-[#323b42]">{s.name}</p>
                        <p className="text-[12px] text-[#6b7280] mt-0.5">{s.category} • {s.contactPerson}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#323b42] mb-2">Payment Method *</label>
                <select
                  value={poForm.paymentMethod}
                  onChange={(e) => setPOForm({ ...poForm, paymentMethod: e.target.value })}
                  className="w-full px-[12.8px] py-[8.8px] bg-white border-[0.8px] border-transparent rounded-[10px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Check">Check</option>
                  <option value="Credit Terms">Credit Terms</option>
                </select>
              </div>

              {poForm.paymentMethod === 'Credit Terms' && (
                <div>
                  <label className="block text-[12px] font-medium text-[#323b42] mb-2">Payment Terms</label>
                  <input
                    type="text"
                    value={poForm.paymentTerms}
                    onChange={(e) => setPOForm({ ...poForm, paymentTerms: e.target.value })}
                    className="w-full px-[12.8px] py-[8.8px] bg-white border-[0.8px] border-transparent rounded-[10px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                    placeholder="e.g., Net 30 days"
                  />
                </div>
              )}

              <div>
                <label className="block text-[12px] font-medium text-[#323b42] mb-2">Notes</label>
                <input
                  type="text"
                  value={poForm.notes}
                  onChange={(e) => setPOForm({ ...poForm, notes: e.target.value })}
                  className="w-full px-[12.8px] py-[8.8px] bg-white border-[0.8px] border-transparent rounded-[10px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                  placeholder="Additional notes or requirements"
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[16px] font-semibold text-[#323b42]">Order Items</label>
                <button onClick={() => setShowNewItemModal(true)} className="px-[10.8px] py-[0.8px] h-[32px] bg-[#f8fafb] border-[0.8px] border-[rgba(50,59,66,0.15)] text-[#323b42] rounded-[10px] text-[14px] font-medium flex items-center gap-[6px] hover:bg-[#e9ecef] transition-colors">
                  <Plus className="size-4" />
                  Add Item
                </button>
              </div>

              {poForm.items.length === 0 ? (
                <div className="bg-[#f9fafb] border-[0.8px] border-[rgba(50,59,66,0.15)] rounded-[12px] p-6 text-center">
                  <p className="text-[14px] text-[#323B42]">No items added yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {poForm.items.map((item, idx) => (
                    <div key={idx} className="bg-[#f9fafb] border-[0.8px] border-[rgba(50,59,66,0.15)] rounded-[12px] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1">
                          <p className="text-[14px] font-semibold text-[#364153]">{item.name}</p>
                          {item.estimatedWeight && item.estimatedWeight > 0 && (
                            <p className="text-[12px] text-[#6b7280] mt-1">Est. Weight: {item.estimatedWeight} kg</p>
                          )}
                        </div>
                        <button onClick={() => setPOForm({ ...poForm, items: poForm.items.filter((_, i) => i !== idx) })} className="text-[#E7000B] hover:bg-[#ffe2e2] p-1 rounded">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="border-t border-[rgba(50,59,66,0.15)] pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] text-[#6b7280]">{item.quantity} qty × ₱{item.unitPrice.toLocaleString()}</span>
                          <span className="text-[14px] font-semibold text-[#007a5e]">₱{(item.quantity * item.unitPrice).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 bg-[#f3f4f6] rounded-[12px] p-3 flex justify-between items-center">
              <span className="text-[16px] font-semibold text-[#323b42]">Total Order Cost:</span>
              <span className="text-[20px] font-bold text-[#007a5e]">
                ₱{poForm.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0).toLocaleString()}
              </span>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowNewPOModal(false)} className="px-[16.8px] py-[8.8px] h-[36px] bg-[#f8fafb] border-[0.8px] border-[rgba(50,59,66,0.15)] rounded-[10px] text-[14px] font-medium text-[#323b42] hover:bg-[#e9ecef] transition-colors">
                Cancel
              </button>
              <button onClick={handleCreatePO} disabled={saving} className="px-4 py-2 h-[36px] bg-[#007a5e] text-white rounded-[10px] text-[14px] font-medium hover:bg-[#008967] transition-colors disabled:opacity-60">
                {saving ? 'Creating…' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Item Modal */}
      {showNewItemModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[14px] p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-[24px] font-bold text-[#323B42] mb-6">Add Item to Purchase Order</h3>
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-[14px] font-medium text-[#323B42] mb-2">Item / Product Name *</label>
                <input
                  type="text"
                  value={newItemForm.baleType}
                  onChange={(e) => { setNewItemForm({ ...newItemForm, baleType: e.target.value }); setShowBaleTypeDropdown(true); }}
                  onFocus={() => setShowBaleTypeDropdown(true)}
                  onBlur={() => setTimeout(() => setShowBaleTypeDropdown(false), 300)}
                  className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                  placeholder="e.g., Mixed Clothing, Premium Denim, Ladies Tops"
                />
                {showBaleTypeDropdown && filteredBaleTypes.length > 0 && newItemForm.baleType && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-[rgba(0,0,0,0.1)] rounded-[8px] shadow-lg max-h-[240px] overflow-y-auto">
                    {filteredBaleTypes.map((type, index) => (
                      <div key={index} onMouseDown={(e) => { e.preventDefault(); setNewItemForm({ ...newItemForm, baleType: type }); setShowBaleTypeDropdown(false); }} className="px-4 py-2.5 hover:bg-[#F8FAFB] cursor-pointer border-b border-[rgba(0,0,0,0.05)] last:border-b-0">
                        <p className="text-[14px] text-[#323B42]">{type}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#323B42] mb-2">Link to Existing Inventory Item (optional)</label>
                <select
                  value={newItemForm.inventoryItemId}
                  onChange={(e) => setNewItemForm({ ...newItemForm, inventoryItemId: e.target.value })}
                  className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                >
                  <option value="">— No link (new item) —</option>
                  {inventory.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.name} (qty: {item.quantity})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">Estimated Weight (kg)</label>
                  <input type="number" min="0" step="0.1" value={newItemForm.estimatedWeight} onChange={(e) => setNewItemForm({ ...newItemForm, estimatedWeight: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]" placeholder="Weight in kg" />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">Condition</label>
                  <select value={newItemForm.condition} onChange={(e) => setNewItemForm({ ...newItemForm, condition: e.target.value })} className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]">
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">Quantity *</label>
                  <input type="number" min="1" value={newItemForm.quantity} onChange={(e) => setNewItemForm({ ...newItemForm, quantity: parseInt(e.target.value) || 1 })} className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]" />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">Unit Cost (₱) *</label>
                  <input type="number" min="0" step="0.01" value={newItemForm.unitPrice} onChange={(e) => setNewItemForm({ ...newItemForm, unitPrice: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNewItemModal(false)} className="flex-1 px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-[#323B42] hover:bg-[#F8FAFB] transition-colors">Cancel</button>
              <button onClick={handleAddItemToPO} className="flex-1 px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[14px] font-medium hover:bg-[#008967] transition-colors">Add to Order</button>
            </div>
          </div>
        </div>
      )}

      {/* Suppliers Modal */}
      {showSuppliersModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[14px] p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[24px] font-bold text-[#323B42]">Suppliers Directory</h3>
              <div className="flex gap-2">
                <button onClick={() => setShowNewSupplierModal(true)} className="px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-[#008967]">
                  <Plus className="size-4" /> Add Supplier
                </button>
                <button onClick={() => setShowSuppliersModal(false)} className="p-2 hover:bg-[#F8FAFB] rounded-[6px] transition-colors">
                  <X className="size-5 text-[#323B42]" />
                </button>
              </div>
            </div>
            {suppliers.length === 0 ? (
              <p className="text-center text-[#6b7280] py-8">No suppliers yet. Add one above.</p>
            ) : (
              <div className="space-y-3">
                {suppliers.map((s: any) => (
                  <div key={s.id} className="bg-[#F8FAFB] border border-[rgba(0,0,0,0.1)] rounded-[12px] p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="text-[18px] font-semibold text-[#323B42] mb-1">{s.name}</h4>
                        {s.category && <span className="text-[12px] bg-[#E0F5F1] text-[#008967] px-2 py-1 rounded font-medium">{s.category}</span>}
                      </div>
                      <button onClick={() => { setPOForm({ ...poForm, supplierId: s.id, supplierName: s.name }); setShowSuppliersModal(false); setShowNewPOModal(true); }} className="px-3 py-1.5 bg-[#007A5E] text-white rounded-[6px] text-[13px] font-medium hover:bg-[#008967]">
                        Create PO
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {s.contactPerson && <div><p className="text-[12px] text-[#323B42] mb-1">Contact Person</p><p className="text-[14px] font-medium text-[#323B42]">{s.contactPerson}</p></div>}
                      {s.phone && <div><p className="text-[12px] text-[#323B42] mb-1">Phone</p><p className="text-[14px] font-medium text-[#323B42]">{s.phone}</p></div>}
                      {s.email && <div><p className="text-[12px] text-[#323B42] mb-1">Email</p><p className="text-[14px] font-medium text-[#323B42]">{s.email}</p></div>}
                      {s.address && <div><p className="text-[12px] text-[#323B42] mb-1">Address</p><p className="text-[14px] font-medium text-[#323B42]">{s.address}</p></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6">
              <button onClick={() => setShowSuppliersModal(false)} className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-[#323B42] hover:bg-[#F8FAFB]">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* New Supplier Modal */}
      {showNewSupplierModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-white rounded-[14px] p-6 max-w-md w-full">
            <h3 className="text-[20px] font-bold text-[#323B42] mb-4">Add New Supplier</h3>
            <div className="space-y-3">
              {[
                { label: 'Name *', key: 'name', placeholder: 'Supplier name' },
                { label: 'Contact Person', key: 'contactPerson', placeholder: 'Contact name' },
                { label: 'Email', key: 'email', placeholder: 'email@example.com' },
                { label: 'Phone', key: 'phone', placeholder: '+63 9XX XXX XXXX' },
                { label: 'Address', key: 'address', placeholder: 'City, Province' },
                { label: 'Category', key: 'category', placeholder: 'e.g. Clothing, Footwear' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-[12px] font-medium text-[#323B42] mb-1">{label}</label>
                  <input type="text" value={(newSupplierForm as any)[key]} onChange={(e) => setNewSupplierForm({ ...newSupplierForm, [key]: e.target.value })} placeholder={placeholder} className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNewSupplierModal(false)} className="flex-1 px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] text-[#323B42] hover:bg-[#F8FAFB]">Cancel</button>
              <button onClick={handleCreateSupplier} disabled={saving} className="flex-1 px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[14px] font-medium hover:bg-[#008967] disabled:opacity-60">{saving ? 'Saving…' : 'Add Supplier'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4"><p className="text-[#323B42] text-[12px] mb-1">Total Orders</p><p className="text-[#323B42] text-[24px] font-bold">{stats.total}</p></div>
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4"><p className="text-[#323B42] text-[12px] mb-1">Pending</p><p className="text-[#FFA500] text-[24px] font-bold">{stats.pending}</p></div>
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4"><p className="text-[#323B42] text-[12px] mb-1">Approved</p><p className="text-[#007A5E] text-[24px] font-bold">{stats.approved}</p></div>
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4"><p className="text-[#323B42] text-[12px] mb-1">Received</p><p className="text-[#008967] text-[24px] font-bold">{stats.received}</p></div>
      </div>

      {/* Filter */}
      <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] mb-4 p-4">
        <div className="flex items-center gap-2">
          <label className="text-[14px] text-[#323B42] font-medium">Status:</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-[6px] text-[14px] bg-white focus:outline-none focus:border-[#007A5E]">
            <option value="all">All Orders</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.length === 0 && (
          <div className="text-center py-12 text-[#6b7280]">No purchase orders found.</div>
        )}
        {filteredOrders.map((order: any) => (
          <div key={order.id} className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-[18px] font-semibold text-[#323B42]">{order.orderNumber}</h3>
                  <span className={`px-2 py-1 rounded text-[12px] font-semibold ${STATUS_CLASS[order.status] ?? 'bg-[#f3f4f6] text-[#6b7280]'}`}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </div>
                <p className="text-[14px] text-[#323B42]">Supplier: <span className="font-medium">{order.supplier?.name ?? '—'}</span></p>
                <p className="text-[14px] text-[#323B42]">Date: {new Date(order.createdAt).toLocaleDateString()}</p>
                {order.paymentMethod && <p className="text-[14px] text-[#323B42]">Payment: {order.paymentMethod}</p>}
              </div>
              <div className="text-right">
                <p className="text-[24px] font-bold text-[#323B42]">₱{order.totalAmount.toLocaleString()}</p>
                <p className="text-[12px] text-[#323B42]">Total Amount</p>
              </div>
            </div>

            <div className="border-t border-[rgba(0,0,0,0.1)] pt-4 mb-4">
              <p className="text-[14px] font-medium text-[#323B42] mb-2">Items:</p>
              <div className="space-y-2">
                {order.items?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between text-[13px]">
                    <span className="text-[#323B42]">{item.name}</span>
                    <span className="text-[#323B42]">
                      {item.quantity} × ₱{item.unitPrice} = <span className="font-medium">₱{item.totalPrice.toLocaleString()}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 border-t border-[rgba(0,0,0,0.1)] pt-4">
              {order.status === 'DRAFT' && (
                <button onClick={() => handleSubmitPO(order.id)} className="px-4 py-1.5 bg-[#007A5E] text-white rounded-[6px] text-[13px] font-medium hover:bg-[#008967]">
                  Submit for Approval
                </button>
              )}
              {order.status === 'SUBMITTED' && isAdmin && (
                <>
                  <button onClick={() => handleApprovePO(order.id)} className="px-4 py-1.5 bg-[#00A63E] text-white rounded-[6px] text-[13px] font-medium hover:bg-[#008F35] flex items-center gap-1">
                    <CheckCircle className="size-3.5" /> Approve
                  </button>
                  <button onClick={() => setSelectedPOForAction(order.id)} className="px-4 py-1.5 border border-[#E7000B] text-[#E7000B] rounded-[6px] text-[13px] font-medium hover:bg-[#ffe2e2] flex items-center gap-1">
                    <XCircle className="size-3.5" /> Reject
                  </button>
                </>
              )}
              {['DRAFT', 'SUBMITTED', 'APPROVED'].includes(order.status) && (
                <button onClick={() => handleCancelPO(order.id)} className="px-4 py-1.5 bg-[#f3f4f6] text-[#6b7280] rounded-[6px] text-[13px] font-medium hover:bg-[#e5e7eb]">
                  Cancel
                </button>
              )}
            </div>

            {/* Rejection form inline */}
            {selectedPOForAction === order.id && (
              <div className="mt-4 border-t border-[rgba(0,0,0,0.1)] pt-4">
                <label className="block text-[14px] font-medium text-[#323B42] mb-2">Rejection Remarks <span className="text-[#E7000B]">*</span></label>
                <textarea value={rejectionRemarks} onChange={(e) => setRejectionRemarks(e.target.value)} placeholder="Provide reason for rejection..." className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] mb-3 resize-none" rows={2} />
                <div className="flex gap-2">
                  <button onClick={() => handleRejectPO(order.id)} className="flex-1 bg-[#E7000B] text-white px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-[#D10000]">Confirm Rejection</button>
                  <button onClick={() => { setSelectedPOForAction(null); setRejectionRemarks(''); }} className="flex-1 bg-[#F8FAFB] text-[#323B42] px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-[#E5E7EB]">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pending Approvals Modal */}
      {showPendingApprovalsModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[14px] p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[24px] font-bold text-[#323B42]">Pending Purchase Order Approvals</h3>
                <p className="text-[14px] text-[#6b7280] mt-1">Review and approve or reject submitted POs</p>
              </div>
              <button onClick={() => { setShowPendingApprovalsModal(false); setSelectedPOForAction(null); setRejectionRemarks(''); }} className="text-[#6b7280] hover:text-[#323B42]"><X className="size-6" /></button>
            </div>
            {submittedPOs.length === 0 ? (
              <div className="text-center py-12"><CheckCircle className="size-16 text-[#00A63E] mx-auto mb-4" /><p className="text-[#323B42] text-[16px] font-medium">No pending approvals</p></div>
            ) : (
              <div className="space-y-4">
                {submittedPOs.map((po: any) => (
                  <div key={po.id} className="border border-[rgba(0,0,0,0.1)] rounded-[12px] p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="text-[18px] font-semibold text-[#323B42]">{po.orderNumber}</h4>
                        <p className="text-[14px] text-[#6b7280]">Supplier: {po.supplier?.name ?? '—'}</p>
                        <p className="text-[14px] text-[#6b7280]">Date: {new Date(po.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[20px] font-bold text-[#007A5E]">₱{po.totalAmount.toLocaleString()}</p>
                        <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-[#fff4e6] text-[#FFA500]">Submitted</span>
                      </div>
                    </div>
                    <div className="mb-3">
                      <p className="text-[14px] font-medium text-[#323B42] mb-2">Items:</p>
                      <div className="space-y-1">
                        {po.items?.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between text-[13px] bg-[#F8FAFB] px-3 py-2 rounded-[6px]">
                            <span className="text-[#323B42]">{item.name}</span>
                            <span className="text-[#323B42]">{item.quantity} × ₱{item.unitPrice} = <span className="font-medium">₱{item.totalPrice.toLocaleString()}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {selectedPOForAction === po.id ? (
                      <div className="mt-4 border-t border-[rgba(0,0,0,0.1)] pt-4">
                        <label className="block text-[14px] font-medium text-[#323B42] mb-2">Rejection Remarks <span className="text-[#E7000B]">*</span></label>
                        <textarea value={rejectionRemarks} onChange={(e) => setRejectionRemarks(e.target.value)} placeholder="Provide reason for rejection..." className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] mb-3 resize-none" rows={3} />
                        <div className="flex gap-2">
                          <button onClick={() => handleRejectPO(po.id)} className="flex-1 bg-[#E7000B] text-white px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-[#D10000]">Confirm Rejection</button>
                          <button onClick={() => { setSelectedPOForAction(null); setRejectionRemarks(''); }} className="flex-1 bg-[#F8FAFB] text-[#323B42] px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-[#E5E7EB]">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => handleApprovePO(po.id)} className="flex-1 bg-[#00A63E] text-white px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center justify-center gap-2 hover:bg-[#008F35]">
                          <CheckCircle className="size-4" /> Approve
                        </button>
                        <button onClick={() => setSelectedPOForAction(po.id)} className="flex-1 bg-white border border-[#E7000B] text-[#E7000B] px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center justify-center gap-2 hover:bg-[#ffe2e2]">
                          <XCircle className="size-4" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Products Received View
