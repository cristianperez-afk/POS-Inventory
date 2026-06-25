import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, X, Search, Package, ShoppingCart, CheckCircle, XCircle, Clock, Eye, Users, Trash2 } from 'lucide-react';
import {
  useApproveRetailPurchaseOrderMutation,
  useCancelRetailPurchaseOrderMutation,
  useCreateRetailPurchaseOrderMutation,
  useCreateRetailSupplierMutation,
  useRejectRetailPurchaseOrderMutation,
  useRetailInventoryRecordsQuery,
  useRetailLocationsQuery,
  useRetailPurchaseOrderRecordsQuery,
  useRetailSuppliersQuery,
  useSaveRetailInventoryMutation,
  useSubmitRetailPurchaseOrderMutation,
} from '../lib/retail';
import { categorySubcategories, generalMerchandiseSubcategories } from '../../app/utils/constants';
import { SuppliersManager, type NormalizedSupplier } from '../shared/suppliers/SuppliersManager';
import {
  EXPECTED_DELIVERY_TIME_WINDOW_LABEL,
  formatExpectedDelivery,
  getExpectedDeliveryTimeWindowError,
  getDeliveryDelayLabel,
  isPurchaseOrderDelayed,
} from '../lib/purchaseOrderDelivery';

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

// A retail store buys two very different kinds of stock:
//  • GENERAL — brand-new merchandise ordered per unit (pcs/box/case…), with a
//    SKU, a cost price and a marked-up retail price.
//  • THRIFT — sealed ukay-ukay/thrift bales bought by bale type and weight,
//    condition-graded, and later sorted into individual pieces for sale.
type POProductType = 'GENERAL' | 'THRIFT';

type POItemDraft = {
  inventoryItemId?: string;
  productType: POProductType;
  name: string;
  quantity: number;
  unitPrice: number;       // cost per unit / per bale
  sellingPrice?: number;   // intended retail price per unit
  unit?: string;
  sku?: string;
  reorderPoint?: number;
  baleType?: string;
  estimatedWeight?: number;
  isNew?: boolean;
  category?: string;
  subcategory?: string;
  targetCustomer?: string;
  size?: string;
  condition?: string;
};

// Units a general-merchandise buyer orders in (a mall buys cases/boxes, not bales).
const GENERAL_UNITS = ['pcs', 'box', 'case', 'pack', 'dozen', 'set', 'roll', 'kg'];
// Thrift suppliers sell sealed bales or sacks.
const THRIFT_UNITS = ['bale', 'sack', 'bundle'];

function blankNewItemForm() {
  return {
    productType: 'GENERAL' as POProductType,
    inventoryItemId: '',
    name: '',
    sku: '',
    category: '',
    subcategory: '',
    newCategory: '',
    newSubcategory: '',
    targetCustomer: 'Unisex' as 'Male' | 'Female' | 'Unisex',
    size: '',
    condition: 'Good' as string,
    unit: 'pcs',
    baleType: '',
    estimatedWeight: 0,
    expectedPieces: 0,
    quantity: 0,
    unitPrice: 0,
    sellingPrice: 0,
    reorderPoint: 0,
  };
}

export default function PurchaseOrdersView({
  currentUser,
}: {
  currentUser: { email: string; role: string } | null;
}) {
  const ordersQuery = useRetailPurchaseOrderRecordsQuery();
  const suppliersQuery = useRetailSuppliersQuery();
  const inventoryQuery = useRetailInventoryRecordsQuery();
  const locationsQuery = useRetailLocationsQuery();
  const createPurchaseOrderMutation = useCreateRetailPurchaseOrderMutation();
  const submitPurchaseOrderMutation = useSubmitRetailPurchaseOrderMutation();
  const approvePurchaseOrderMutation = useApproveRetailPurchaseOrderMutation();
  const rejectPurchaseOrderMutation = useRejectRetailPurchaseOrderMutation();
  const cancelPurchaseOrderMutation = useCancelRetailPurchaseOrderMutation();
  const createSupplierMutation = useCreateRetailSupplierMutation();
  const saveInventoryMutation = useSaveRetailInventoryMutation();
  const orders = ordersQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];
  const inventory = inventoryQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const loading = ordersQuery.isLoading || suppliersQuery.isLoading || inventoryQuery.isLoading;
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showNewPOModal, setShowNewPOModal] = useState(false);
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [showSuppliersModal, setShowSuppliersModal] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [showPendingApprovalsModal, setShowPendingApprovalsModal] = useState(false);
  const [selectedPOForAction, setSelectedPOForAction] = useState<string | null>(null);
  const [rejectionRemarks, setRejectionRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [poForm, setPOForm] = useState({
    supplierId: '' as string | undefined,
    supplierName: '',
    paymentMethod: 'Bank Transfer',
    paymentTerms: '',
    expectedDelivery: '',
    notes: '',
    items: [] as POItemDraft[]
  });

  const [newItemForm, setNewItemForm] = useState(blankNewItemForm());

  const [showBaleTypeDropdown, setShowBaleTypeDropdown] = useState(false);

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

  const isThrift = newItemForm.productType === 'THRIFT';
  const itemUnitOptions = isThrift ? THRIFT_UNITS : GENERAL_UNITS;
  // Thrift bales are apparel; general merchandise uses mall/retail categories.
  const itemCategoryMap = isThrift ? categorySubcategories : generalMerchandiseSubcategories;

  // Whether the Add-Item form has all required details (mirrors handleAddItemToPO).
  const itemName = isThrift ? newItemForm.baleType.trim() : newItemForm.name.trim();
  const itemFinalCategory = newItemForm.newCategory.trim() || newItemForm.category;
  const canAddItem =
    !!itemName &&
    newItemForm.quantity > 0 &&
    newItemForm.unitPrice > 0 &&
    (!!newItemForm.inventoryItemId || !!itemFinalCategory);

  // Lightweight bale-margin check: a thrift bale costs a fixed amount but is resold
  // as many sorted pieces. Recovery = expected sellable value ÷ what the bale(s) cost.
  const baleCost = newItemForm.unitPrice * newItemForm.quantity;
  const baleExpectedRevenue = isThrift
    ? newItemForm.sellingPrice * newItemForm.expectedPieces * newItemForm.quantity
    : 0;
  const baleRecovery = baleCost > 0 ? baleExpectedRevenue / baleCost : 0;
  const showBaleMargin =
    isThrift &&
    newItemForm.unitPrice > 0 &&
    newItemForm.sellingPrice > 0 &&
    newItemForm.expectedPieces > 0 &&
    newItemForm.quantity > 0;

  const handleAddItemToPO = () => {
    const isThrift = newItemForm.productType === 'THRIFT';
    const itemName = isThrift ? newItemForm.baleType.trim() : newItemForm.name.trim();
    if (!itemName) {
      toast.error(isThrift ? 'Please enter a Bale Type' : 'Please enter a Product Name');
      return;
    }
    if (!newItemForm.quantity || newItemForm.quantity <= 0) {
      toast.error('Please enter a Quantity greater than zero');
      return;
    }
    if (!newItemForm.unitPrice || newItemForm.unitPrice <= 0) {
      toast.error('Please enter a Unit Cost greater than zero');
      return;
    }
    const isNew = !newItemForm.inventoryItemId;
    const finalCategory = newItemForm.newCategory.trim() || newItemForm.category;
    const finalSubcategory = newItemForm.newSubcategory.trim() || newItemForm.subcategory;
    // New items become inventory on PO creation, so they must be classified.
    if (isNew && !finalCategory) {
      toast.error('Please select or enter a Category for the new item');
      return;
    }
    // A retail price below cost would mean selling at a loss — guard against typos.
    if (!isThrift && newItemForm.sellingPrice > 0 && newItemForm.sellingPrice < newItemForm.unitPrice) {
      toast.error('Retail Price is lower than Unit Cost — please review the pricing.');
      return;
    }
    setPOForm({
      ...poForm,
      items: [...poForm.items, {
        inventoryItemId: newItemForm.inventoryItemId || undefined,
        productType: newItemForm.productType,
        name: itemName,
        quantity: newItemForm.quantity,
        unitPrice: newItemForm.unitPrice,
        sellingPrice: newItemForm.sellingPrice > 0 ? newItemForm.sellingPrice : undefined,
        unit: newItemForm.unit || (isThrift ? 'bale' : 'pcs'),
        sku: !isThrift && newItemForm.sku.trim() ? newItemForm.sku.trim() : undefined,
        reorderPoint: !isThrift && newItemForm.reorderPoint > 0 ? newItemForm.reorderPoint : undefined,
        baleType: isThrift ? newItemForm.baleType : undefined,
        estimatedWeight: isThrift ? newItemForm.estimatedWeight : undefined,
        isNew,
        category: finalCategory || undefined,
        subcategory: finalSubcategory || undefined,
        targetCustomer: isThrift ? newItemForm.targetCustomer : undefined,
        size: newItemForm.size || undefined,
        condition: isThrift ? newItemForm.condition : undefined,
      }]
    });
    setNewItemForm(blankNewItemForm());
    setShowNewItemModal(false);
  };

  const handleCreatePO = async () => {
    if (!poForm.supplierId) {
      toast.error('Please select a supplier. For informal/cash buys, add a "Walk-in / Cash Purchase" supplier and select it.');
      return;
    }
    if (poForm.items.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    const hasNewItems = poForm.items.some(i => !i.inventoryItemId);
    const location = locations[0];
    if (hasNewItems && !location) {
      toast.error('Create a location before ordering a new item');
      return;
    }
    const deliveryTimeError = getExpectedDeliveryTimeWindowError(poForm.expectedDelivery);
    if (deliveryTimeError) {
      toast.error(deliveryTimeError);
      return;
    }
    setSaving(true);
    try {
      // New items (not linked to existing inventory) are registered as inventory
      // records with zero stock so they can be classified and stocked on receipt.
      const items = [];
      for (const i of poForm.items) {
        let inventoryItemId = i.inventoryItemId;
        if (!inventoryItemId) {
          const isThrift = i.productType === 'THRIFT';
          // Cost is what we pay the supplier (PO unit price); the retail price is
          // what we sell at. If no selling price was given, fall back to cost so
          // the item is at least valid — it can be priced later.
          const sellingPrice = i.sellingPrice && i.sellingPrice > 0 ? i.sellingPrice : i.unitPrice;
          const created: any = await saveInventoryMutation.mutateAsync({
            data: {
              name: i.name,
              ...(i.sku ? { sku: i.sku } : {}),
              category: i.category || 'General',
              subcategory: i.subcategory || 'Mixed',
              // Apparel attributes only apply to thrift/clothing lines.
              ...(isThrift
                ? {
                    targetCustomer: i.targetCustomer || 'Unisex',
                    size: i.size || 'Mixed',
                    condition: i.condition || 'Good',
                  }
                : i.size
                  ? { size: i.size }
                  : {}),
              quantity: 0,
              price: sellingPrice,
              costPrice: i.unitPrice,
              unit: i.unit || (isThrift ? 'bale' : 'pcs'),
              ...(i.reorderPoint ? { reorderPoint: i.reorderPoint } : {}),
              locationId: location.id,
            },
          });
          inventoryItemId = created.id;
        }
        items.push({
          inventoryItemId,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        });
      }

      await createPurchaseOrderMutation.mutateAsync({
        supplierId: poForm.supplierId || undefined,
        notes: poForm.notes || undefined,
        paymentMethod: poForm.paymentMethod,
        paymentTerms: poForm.paymentTerms || undefined,
        expectedDelivery: poForm.expectedDelivery
          ? new Date(poForm.expectedDelivery).toISOString()
          : undefined,
        items,
      });
      setPOForm({ supplierId: undefined, supplierName: '', paymentMethod: 'Bank Transfer', paymentTerms: '', expectedDelivery: '', notes: '', items: [] });
      setShowNewPOModal(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitPO = async (id: string) => {
    try {
      await submitPurchaseOrderMutation.mutateAsync(id);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to submit purchase order');
    }
  };

  const handleApprovePO = async (id: string) => {
    try {
      await approvePurchaseOrderMutation.mutateAsync(id);
      setSelectedPOForAction(null);
      setShowPendingApprovalsModal(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to approve purchase order');
    }
  };

  const handleRejectPO = async (id: string) => {
    if (!rejectionRemarks.trim()) {
      toast.error('Please provide remarks for rejection');
      return;
    }
    try {
      await rejectPurchaseOrderMutation.mutateAsync({ id, reason: rejectionRemarks });
      setRejectionRemarks('');
      setSelectedPOForAction(null);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to reject purchase order');
    }
  };

  const handleCancelPO = async (id: string) => {
    try {
      await cancelPurchaseOrderMutation.mutateAsync(id);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to cancel purchase order');
    }
  };

  const filteredOrders = orders.filter(o =>
    filterStatus === 'all'
      ? true
      : filterStatus === 'pending'
        ? ['DRAFT', 'SUBMITTED'].includes(o.status)
        : o.status === filterStatus,
  );
  const submittedPOs = orders.filter(o => o.status === 'SUBMITTED');
  const isAdmin = currentUser?.role === 'Admin';

  const getDeliveryDelayBadge = (order: { expectedDelivery?: string | null; status: string }) => {
    if (!isPurchaseOrderDelayed(order.expectedDelivery, order.status, now)) return null;
    const delayLabel = getDeliveryDelayLabel(order.expectedDelivery, now);

    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#DC2626] bg-[#FEE2E2] px-2 py-1 text-[11px] font-semibold text-[#991B1B]">
        Delayed: {delayLabel}
      </span>
    );
  };

  const stats = {
    total: orders.length,
    pending: orders.filter(o => ['DRAFT', 'SUBMITTED'].includes(o.status)).length,
    approved: orders.filter(o => o.status === 'APPROVED').length,
    received: orders.filter(o => o.status === 'RECEIVED').length,
  };

  // Stat cards toggle the status filter that drives the orders list; clicking the
  // active card (or Total Orders) clears it back to "all".
  const toggleFilterStatus = (status: string) => {
    setFilterStatus((current) => (current === status ? 'all' : status));
  };
  const statCardClass = (active: boolean) =>
    `text-left w-full bg-white rounded-[14px] p-4 border shadow-sm cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-[#007A5E]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007A5E]/40 active:translate-y-0 active:shadow-md ${
      active ? 'border-[#007A5E] bg-[#007A5E]/5 shadow-md' : 'border-[rgba(0,0,0,0.1)]'
    }`;

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
            className="bg-white border border-[rgba(0,0,0,0.1)] text-[#323B42] px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-[#F8FAFB] hover:-translate-y-0.5 hover:shadow-md hover:border-[#007A5E]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007A5E]/40 active:translate-y-0 active:shadow-sm transition-all duration-200"
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
            className="bg-[#007A5E] text-white px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-[#008967] hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#007A5E]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007A5E]/50 active:translate-y-0 active:shadow-sm transition-all duration-200"
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
                <label className="block text-[12px] font-medium text-[#323b42] mb-2">Supplier <span className="text-[#E7000B]">*</span></label>
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
                  <option value="GCash">GCash</option>
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
                <label className="block text-[12px] font-medium text-[#323b42] mb-2">Expected Delivery Date and Time</label>
                <input
                  type="datetime-local"
                  value={poForm.expectedDelivery}
                  onChange={(e) => setPOForm({ ...poForm, expectedDelivery: e.target.value })}
                  className="w-full px-[12.8px] py-[8.8px] bg-white border-[0.8px] border-transparent rounded-[10px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                />
                <p className="mt-1 text-[11px] text-[#6b7280]">
                  Delivery time must be between {EXPECTED_DELIVERY_TIME_WINDOW_LABEL}.
                </p>
              </div>

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
                          <div className="flex items-center gap-2">
                            <p className="text-[14px] font-semibold text-[#364153]">{item.name}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${item.productType === 'THRIFT' ? 'bg-[#fdf0e6] text-[#b45309]' : 'bg-[#E0F5F1] text-[#008967]'}`}>
                              {item.productType === 'THRIFT' ? 'Thrift Bale' : 'General'}
                            </span>
                          </div>
                          {(item.category || item.subcategory) && (
                            <p className="text-[12px] text-[#6b7280] mt-1">
                              {[item.category, item.subcategory].filter(Boolean).join(' › ')}
                              {item.sku && <span className="ml-2">• SKU: {item.sku}</span>}
                              {item.isNew && <span className="ml-2 text-[11px] text-[#007a5e]">(new item)</span>}
                            </p>
                          )}
                          {item.estimatedWeight && item.estimatedWeight > 0 && (
                            <p className="text-[12px] text-[#6b7280] mt-1">Est. Weight: {item.estimatedWeight} kg</p>
                          )}
                          {item.sellingPrice && item.sellingPrice > 0 && (
                            <p className="text-[12px] text-[#6b7280] mt-1">
                              Retail: ₱{item.sellingPrice.toLocaleString()} / {item.unit ?? 'pcs'}
                              {item.sellingPrice > item.unitPrice && (
                                <span className="ml-1 text-[#008967]">(+{Math.round(((item.sellingPrice - item.unitPrice) / item.unitPrice) * 100)}% margin)</span>
                              )}
                            </p>
                          )}
                        </div>
                        <button onClick={() => setPOForm({ ...poForm, items: poForm.items.filter((_, i) => i !== idx) })} className="text-[#E7000B] hover:bg-[#ffe2e2] p-1 rounded">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="border-t border-[rgba(50,59,66,0.15)] pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] text-[#6b7280]">{item.quantity} {item.unit ?? (item.productType === 'THRIFT' ? 'bale' : 'pcs')} × ₱{item.unitPrice.toLocaleString()}</span>
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
              <button onClick={handleCreatePO} disabled={saving || !poForm.supplierId || poForm.items.length === 0} className="px-4 py-2 h-[36px] bg-[#007a5e] text-white rounded-[10px] text-[14px] font-medium hover:bg-[#008967] transition-colors disabled:opacity-60">
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
            <h3 className="text-[24px] font-bold text-[#323B42] mb-1">Add Item to Purchase Order</h3>
            <p className="text-[14px] text-[#6b7280] mb-6">Order brand-new general merchandise or sealed ukay-ukay/thrift bales.</p>
            <div className="space-y-4">
              {/* Product type — general merchandise vs. thrift bale drive different fields */}
              <div>
                <label className="block text-[14px] font-medium text-[#323B42] mb-2">Product Type *</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { type: 'GENERAL' as POProductType, title: 'General Merchandise', desc: 'Brand-new goods sold per unit', defUnit: 'pcs' },
                    { type: 'THRIFT' as POProductType, title: 'Thrift Bale (Ukay-ukay)', desc: 'Sealed bales sorted into pieces', defUnit: 'bale' },
                  ]).map(({ type, title, desc, defUnit }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewItemForm({ ...newItemForm, productType: type, unit: defUnit, category: '', subcategory: '', newCategory: '', newSubcategory: '' })}
                      className={`text-left px-4 py-3 rounded-[10px] border transition-colors ${
                        newItemForm.productType === type
                          ? 'border-[#007A5E] bg-[#E0F5F1]'
                          : 'border-[rgba(0,0,0,0.1)] bg-white hover:bg-[#F8FAFB]'
                      }`}
                    >
                      <p className="text-[14px] font-semibold text-[#323B42]">{title}</p>
                      <p className="text-[12px] text-[#6b7280] mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#323B42] mb-2">Link to Existing Inventory Item (optional)</label>
                <select
                  value={newItemForm.inventoryItemId}
                  onChange={(e) => {
                    const linked = inventory.find((item: any) => item.id === e.target.value);
                    setNewItemForm({
                      ...newItemForm,
                      inventoryItemId: e.target.value,
                      // Pull classification from the linked item so it's visible (and read-only).
                      name: linked?.name ?? newItemForm.name,
                      baleType: linked?.name ?? newItemForm.baleType,
                      sku: linked?.sku ?? newItemForm.sku,
                      category: linked?.category ?? '',
                      subcategory: linked?.subcategory ?? '',
                      newCategory: '',
                      newSubcategory: '',
                      unit: linked?.unit ?? newItemForm.unit,
                      targetCustomer: (linked?.targetCustomer as any) ?? newItemForm.targetCustomer,
                      size: linked?.size ?? newItemForm.size,
                      condition: (linked?.condition as string) ?? newItemForm.condition,
                    });
                  }}
                  className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                >
                  <option value="">— No link (new item) —</option>
                  {inventory.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.name} (qty: {item.quantity})</option>
                  ))}
                </select>
              </div>

              {/* Name — bale type (autocomplete) for thrift, plain name + SKU for general */}
              {isThrift ? (
                <div className="relative">
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">Bale Type *</label>
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
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[14px] font-medium text-[#323B42] mb-2">Product Name *</label>
                    <input
                      type="text"
                      value={newItemForm.name}
                      onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })}
                      disabled={!!newItemForm.inventoryItemId}
                      className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] disabled:bg-[#F8FAFB] disabled:text-[#6b7280]"
                      placeholder="e.g., Cotton Crew Socks 3-pack"
                    />
                  </div>
                  <div>
                    <label className="block text-[14px] font-medium text-[#323B42] mb-2">SKU / Barcode (optional)</label>
                    <input
                      type="text"
                      value={newItemForm.sku}
                      onChange={(e) => setNewItemForm({ ...newItemForm, sku: e.target.value })}
                      disabled={!!newItemForm.inventoryItemId}
                      className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] disabled:bg-[#F8FAFB] disabled:text-[#6b7280]"
                      placeholder="e.g., SKU-00123"
                    />
                  </div>
                </div>
              )}

              {/* Category & Subcategory — required for new items (used to file the new inventory record) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">
                    Category {!newItemForm.inventoryItemId && <span className="text-[#E7000B]">*</span>}
                  </label>
                  <select
                    value={newItemForm.category}
                    onChange={(e) => setNewItemForm({ ...newItemForm, category: e.target.value, subcategory: '', newSubcategory: '' })}
                    disabled={!!newItemForm.inventoryItemId || !!newItemForm.newCategory.trim()}
                    className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] disabled:bg-[#F8FAFB] disabled:text-[#6b7280]"
                  >
                    <option value="">Select category</option>
                    {Object.keys(itemCategoryMap).map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {!newItemForm.inventoryItemId && (
                    <input
                      type="text"
                      value={newItemForm.newCategory}
                      onChange={(e) => setNewItemForm({ ...newItemForm, newCategory: e.target.value, subcategory: '' })}
                      disabled={!!newItemForm.category}
                      className="w-full mt-2 px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] disabled:bg-[#F8FAFB] disabled:text-[#6b7280]"
                      placeholder={newItemForm.category ? 'Using selected category' : '…or type a new category'}
                    />
                  )}
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">Subcategory</label>
                  <select
                    value={newItemForm.subcategory}
                    onChange={(e) => setNewItemForm({ ...newItemForm, subcategory: e.target.value })}
                    disabled={!!newItemForm.inventoryItemId || !newItemForm.category || !!newItemForm.newSubcategory.trim()}
                    className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] disabled:bg-[#F8FAFB] disabled:text-[#6b7280]"
                  >
                    <option value="">Select subcategory</option>
                    {(itemCategoryMap[newItemForm.category] ?? []).map((sub: string) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                  {!newItemForm.inventoryItemId && (
                    <input
                      type="text"
                      value={newItemForm.newSubcategory}
                      onChange={(e) => setNewItemForm({ ...newItemForm, newSubcategory: e.target.value })}
                      disabled={!!newItemForm.subcategory}
                      className="w-full mt-2 px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] disabled:bg-[#F8FAFB] disabled:text-[#6b7280]"
                      placeholder={newItemForm.subcategory ? 'Using selected subcategory' : '…or type a new subcategory'}
                    />
                  )}
                </div>
              </div>

              {/* Thrift bales are clothing — capture who they're for, sizing, grade and weight */}
              {isThrift && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[14px] font-medium text-[#323B42] mb-2">Target Customer</label>
                      <select
                        value={newItemForm.targetCustomer}
                        onChange={(e) => setNewItemForm({ ...newItemForm, targetCustomer: e.target.value as 'Male' | 'Female' | 'Unisex' })}
                        disabled={!!newItemForm.inventoryItemId}
                        className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] disabled:bg-[#F8FAFB] disabled:text-[#6b7280]"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Unisex">Unisex</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[14px] font-medium text-[#323B42] mb-2">Size</label>
                      <input
                        type="text"
                        value={newItemForm.size}
                        onChange={(e) => setNewItemForm({ ...newItemForm, size: e.target.value })}
                        disabled={!!newItemForm.inventoryItemId}
                        className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] disabled:bg-[#F8FAFB] disabled:text-[#6b7280]"
                        placeholder="e.g., M, L, XL, Mixed"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[14px] font-medium text-[#323B42] mb-2">Estimated Weight (kg)</label>
                      <input type="number" min="0" step="0.1" value={newItemForm.estimatedWeight || ''} onChange={(e) => setNewItemForm({ ...newItemForm, estimatedWeight: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]" placeholder="Weight in kg" />
                    </div>
                    <div>
                      <label className="block text-[14px] font-medium text-[#323B42] mb-2">Grade / Condition</label>
                      <select value={newItemForm.condition} onChange={(e) => setNewItemForm({ ...newItemForm, condition: e.target.value })} className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]">
                        <option value="Excellent">Excellent (Grade A)</option>
                        <option value="Good">Good (Grade B)</option>
                        <option value="Fair">Fair (Grade C)</option>
                        <option value="Damaged">Damaged</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[14px] font-medium text-[#323B42] mb-2">Est. Sellable Pieces per Bale</label>
                      <input type="number" min="0" value={newItemForm.expectedPieces || ''} onChange={(e) => setNewItemForm({ ...newItemForm, expectedPieces: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]" placeholder="Wearable pieces you expect to sell" />
                    </div>
                    <div className="flex items-end">
                      <p className="text-[12px] text-[#6b7280] pb-2.5">Used only to check the bale will recover its cost — not saved on the item.</p>
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">Quantity *</label>
                  <input type="number" min="1" value={newItemForm.quantity || ''} onChange={(e) => setNewItemForm({ ...newItemForm, quantity: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]" placeholder="How many to order" />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">Unit of Measure</label>
                  <select value={newItemForm.unit} onChange={(e) => setNewItemForm({ ...newItemForm, unit: e.target.value })} className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]">
                    {itemUnitOptions.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">Unit Cost (₱) *</label>
                  <input type="number" min="0" step="0.01" value={newItemForm.unitPrice || ''} onChange={(e) => setNewItemForm({ ...newItemForm, unitPrice: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]" placeholder="What you pay the supplier" />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">
                    Retail Price (₱) {isThrift && <span className="text-[12px] text-[#6b7280] font-normal">(per sorted piece)</span>}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newItemForm.sellingPrice || ''}
                    onChange={(e) => setNewItemForm({ ...newItemForm, sellingPrice: parseFloat(e.target.value) || 0 })}
                    disabled={!!newItemForm.inventoryItemId}
                    className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] disabled:bg-[#F8FAFB] disabled:text-[#6b7280]"
                    placeholder="What you sell it for"
                  />
                </div>
              </div>

              {/* Reorder point only matters for re-stockable general merchandise, not one-off bales */}
              {!isThrift && (
                <div>
                  <label className="block text-[14px] font-medium text-[#323B42] mb-2">Reorder Point (optional)</label>
                  <input
                    type="number"
                    min="0"
                    value={newItemForm.reorderPoint || ''}
                    onChange={(e) => setNewItemForm({ ...newItemForm, reorderPoint: parseFloat(e.target.value) || 0 })}
                    disabled={!!newItemForm.inventoryItemId}
                    className="w-full px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] disabled:bg-[#F8FAFB] disabled:text-[#6b7280]"
                    placeholder="Stock level that triggers a re-order"
                  />
                </div>
              )}

              {isThrift ? (
                showBaleMargin && (
                  <div
                    className="rounded-[8px] px-4 py-3 text-[13px]"
                    style={{
                      backgroundColor: baleRecovery >= 2 ? '#E0F5F1' : baleRecovery >= 1.5 ? '#FEF3C7' : '#FEE2E2',
                      color: baleRecovery >= 2 ? '#008967' : baleRecovery >= 1.5 ? '#92400E' : '#991B1B',
                    }}
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span>Bale cost: ₱{baleCost.toLocaleString()}</span>
                      <span>Expected sellable value: ₱{baleExpectedRevenue.toLocaleString()} ({baleRecovery.toFixed(1)}×)</span>
                    </div>
                    <p className="mt-1">
                      {baleRecovery >= 2
                        ? 'Healthy ukay margin — comfortably above the 2× target.'
                        : baleRecovery >= 1.5
                          ? 'Tight — duds and unsold pieces will eat into this. Consider raising piece prices.'
                          : 'Below 1.5× — you are likely to lose money on this bale once unsellables are removed.'}
                    </p>
                  </div>
                )
              ) : (
                newItemForm.sellingPrice > 0 && newItemForm.unitPrice > 0 && newItemForm.sellingPrice > newItemForm.unitPrice && (
                  <div className="bg-[#E0F5F1] rounded-[8px] px-4 py-2 text-[13px] text-[#008967]">
                    Margin: ₱{(newItemForm.sellingPrice - newItemForm.unitPrice).toLocaleString()} per unit
                    {' '}(+{Math.round(((newItemForm.sellingPrice - newItemForm.unitPrice) / newItemForm.unitPrice) * 100)}%)
                  </div>
                )
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNewItemModal(false)} className="flex-1 px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-[#323B42] hover:bg-[#F8FAFB] transition-colors">Cancel</button>
              <button onClick={handleAddItemToPO} disabled={!canAddItem} className="flex-1 px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[14px] font-medium hover:bg-[#008967] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Add to Order</button>
            </div>
          </div>
        </div>
      )}

      {/* Suppliers Manager (shared) */}
      <SuppliersManager
        open={showSuppliersModal}
        onClose={() => setShowSuppliersModal(false)}
        suppliers={suppliers as NormalizedSupplier[]}
        fields={[
          { key: 'name', label: 'Name', required: true, placeholder: 'Supplier name' },
          { key: 'contactPerson', label: 'Contact Person', placeholder: 'Contact name' },
          { key: 'email', label: 'Email', placeholder: 'email@example.com' },
          { key: 'phone', label: 'Phone', placeholder: '+63 9XX XXX XXXX' },
          { key: 'address', label: 'Address', type: 'textarea', placeholder: 'City, Province' },
          { key: 'category', label: 'Category', placeholder: 'e.g. Clothing, Footwear' },
        ]}
        onCreate={async (payload) => {
          await createSupplierMutation.mutateAsync(payload);
        }}
        onSelectSupplier={(s) => {
          setPOForm({ ...poForm, supplierId: s.id, supplierName: s.name });
          setShowSuppliersModal(false);
          setShowNewPOModal(true);
        }}
        selectLabel="Create PO"
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <button type="button" onClick={() => toggleFilterStatus('all')} aria-pressed={filterStatus === 'all'} aria-label="Show all orders" className={statCardClass(filterStatus === 'all')}>
          <p className="text-[#323B42] text-[12px] mb-1">Total Orders</p><p className="text-[#323B42] text-[24px] font-bold">{stats.total}</p>
        </button>
        <button type="button" onClick={() => toggleFilterStatus('pending')} aria-pressed={filterStatus === 'pending'} aria-label="Filter by pending" className={statCardClass(filterStatus === 'pending')}>
          <p className="text-[#323B42] text-[12px] mb-1">Pending</p><p className="text-[#FFA500] text-[24px] font-bold">{stats.pending}</p>
        </button>
        <button type="button" onClick={() => toggleFilterStatus('APPROVED')} aria-pressed={filterStatus === 'APPROVED'} aria-label="Filter by approved" className={statCardClass(filterStatus === 'APPROVED')}>
          <p className="text-[#323B42] text-[12px] mb-1">Approved</p><p className="text-[#007A5E] text-[24px] font-bold">{stats.approved}</p>
        </button>
        <button type="button" onClick={() => toggleFilterStatus('RECEIVED')} aria-pressed={filterStatus === 'RECEIVED'} aria-label="Filter by received" className={statCardClass(filterStatus === 'RECEIVED')}>
          <p className="text-[#323B42] text-[12px] mb-1">Received</p><p className="text-[#008967] text-[24px] font-bold">{stats.received}</p>
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] mb-4 p-4">
        <div className="flex items-center gap-2">
          <label className="text-[14px] text-[#323B42] font-medium">Status:</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-[6px] text-[14px] bg-white focus:outline-none focus:border-[#007A5E]">
            <option value="all">All Orders</option>
            <option value="pending">Pending</option>
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
                  {getDeliveryDelayBadge(order)}
                </div>
                <p className="text-[14px] text-[#323B42]">Supplier: <span className="font-medium">{order.supplier?.name ?? '—'}</span></p>
                <p className="text-[14px] text-[#323B42]">Date: {new Date(order.createdAt).toLocaleDateString()}</p>
                <p className="text-[14px] text-[#323B42]">Expected Delivery: {formatExpectedDelivery(order.expectedDelivery)}</p>
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
                        <p className="text-[14px] text-[#6b7280]">Expected Delivery: {formatExpectedDelivery(po.expectedDelivery)}</p>
                        <div className="mt-2">{getDeliveryDelayBadge(po)}</div>
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

