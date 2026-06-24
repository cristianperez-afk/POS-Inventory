import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, X, Search, ShoppingCart, CreditCard, Trash2, CheckCircle, Receipt, RotateCcw } from 'lucide-react';
import {
  useCreateRetailSaleMutation,
  useRefundRetailSaleMutation,
  useRetailInventoryRecordsQuery,
  useRetailLocationsQuery,
  useRetailSalesQuery,
} from '../lib/retail';

export default function POSView({
  currentUser,
}: {
  currentUser: { email: string; role: string } | null;
}) {
  const inventoryQuery = useRetailInventoryRecordsQuery();
  const salesQuery = useRetailSalesQuery();
  const locationsQuery = useRetailLocationsQuery();
  const createSaleMutation = useCreateRetailSaleMutation();
  const refundSaleMutation = useRefundRetailSaleMutation();
  const inventory = inventoryQuery.data ?? [];
  const sales = salesQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const loading = inventoryQuery.isLoading || salesQuery.isLoading || locationsQuery.isLoading;
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [activeTab, setActiveTab] = useState<'sales' | 'history' | 'returns'>('sales');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<{
    inventoryItemId: string;
    name: string;
    category: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    availableStock: number;
  }[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customer, setCustomer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash' | 'Card' | 'Bank Transfer'>('Cash');
  const [amountPaid, setAmountPaid] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any | null>(null);
  const [selectedSaleForReturn, setSelectedSaleForReturn] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  const availableItems = inventory.filter((item: any) => item.quantity > 0);
  const availableCategories = Array.from(new Set(availableItems.map((item: any) => item.category))).sort() as string[];

  const filteredInventory = availableItems.filter((item: any) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.subcategory ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const tax = 0;
  const total = subtotal - discount + tax;
  const change = amountPaid - total;

  const handleAddToCart = (item: any) => {
    const existing = cart.find(c => c.inventoryItemId === item.id);
    if (existing) {
      if (existing.quantity >= item.quantity) { toast.error('Insufficient stock!'); return; }
      setCart(cart.map(c => c.inventoryItemId === item.id ? { ...c, quantity: c.quantity + 1, totalPrice: (c.quantity + 1) * c.unitPrice } : c));
    } else {
      setCart([...cart, { inventoryItemId: item.id, name: item.name, category: item.category, quantity: 1, unitPrice: item.price, totalPrice: item.price, availableStock: item.quantity }]);
    }
  };

  const handleUpdateQuantity = (id: string, qty: number) => {
    const cartItem = cart.find(c => c.inventoryItemId === id);
    if (!cartItem) return;
    if (qty <= 0) { setCart(cart.filter(c => c.inventoryItemId !== id)); return; }
    if (qty > cartItem.availableStock) { toast.error('Cannot exceed available stock!'); return; }
    setCart(cart.map(c => c.inventoryItemId === id ? { ...c, quantity: qty, totalPrice: qty * c.unitPrice } : c));
  };

  const handleClearCart = () => { setCart([]); setDiscount(0); setCustomer(''); setAmountPaid(0); };

  const handleProcessPayment = async () => {
    if (cart.length === 0) { toast.error('Cart is empty!'); return; }
    if (!selectedLocationId) { toast.error('Please select a location first'); return; }
    if (paymentMethod === 'Cash' && amountPaid < total) { toast.error('Insufficient payment amount!'); return; }
    setSaving(true);
    try {
      const sale = await createSaleMutation.mutateAsync({
        locationId: selectedLocationId,
        items: cart.map(i => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity, unitPrice: i.unitPrice })),
        discount: discount > 0 ? discount : undefined,
        paymentMethod,
        amountPaid: paymentMethod === 'Cash' ? amountPaid : total,
        customer: customer || undefined,
      });
      setLastTransaction(sale);
      handleClearCart();
      setShowPaymentModal(false);
      setShowReceiptModal(true);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to process sale');
    } finally {
      setSaving(false);
    }
  };

  const handleProcessReturn = async (saleId: string) => {
    if (!returnReason.trim()) { toast.error('Please provide a reason for return'); return; }
    setSaving(true);
    try {
      await refundSaleMutation.mutateAsync({ id: saleId, reason: returnReason });
      setSelectedSaleForReturn(null);
      setReturnReason('');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to process return');
    } finally {
      setSaving(false);
    }
  };

  const todaySales = sales.filter((s: any) => {
    const saleDate = new Date(s.createdAt).toDateString();
    return saleDate === new Date().toDateString() && s.status === 'COMPLETED';
  });
  const todayRevenue = todaySales.reduce((sum: number, s: any) => sum + s.total, 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading POS…</div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-[30px] font-bold text-foreground">Point of Sale</h2>
          <p className="text-muted-foreground text-[14px] mt-1">Process sales transactions and manage returns</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[14px] font-medium text-foreground">Location:</label>
          <select value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)} className="px-3 py-2 border border-border rounded-[8px] text-[14px] bg-white focus:outline-none focus:border-secondary">
            {locations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-border">
        {[
          { id: 'sales', icon: <ShoppingCart className="inline-block size-4 mr-2" />, label: 'Sales' },
          { id: 'history', icon: <Receipt className="inline-block size-4 mr-2" />, label: 'Transaction History' },
          { id: 'returns', icon: <RotateCcw className="inline-block size-4 mr-2" />, label: 'Returns' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-6 py-3 text-[14px] font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-secondary text-secondary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Sales Tab */}
      {activeTab === 'sales' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-secondary/10 border border-secondary/20 rounded-[12px] p-4">
                <p className="text-[14px] text-secondary font-medium">Today's Sales</p>
                <p className="text-[28px] font-bold text-secondary mt-1">₱{todayRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-white border border-border rounded-[12px] p-4">
                <p className="text-[14px] text-muted-foreground font-medium">Transactions</p>
                <p className="text-[28px] font-bold text-foreground mt-1">{todaySales.length}</p>
              </div>
              <div className="bg-white border border-border rounded-[12px] p-4">
                <p className="text-[14px] text-muted-foreground font-medium">Avg. Sale</p>
                <p className="text-[28px] font-bold text-foreground mt-1">
                  ₱{todaySales.length > 0 ? Math.round(todayRevenue / todaySales.length).toLocaleString() : 0}
                </p>
              </div>
            </div>

            <div className="mb-4 bg-white border border-border rounded-[12px] p-4">
              <p className="text-[12px] font-medium text-foreground mb-3">Filter by Category:</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setSelectedCategory('all')} className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all ${selectedCategory === 'all' ? 'bg-secondary text-white shadow-md' : 'bg-muted text-foreground hover:bg-muted'}`}>
                  All Items ({availableItems.length})
                </button>
                {availableCategories.map(cat => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all ${selectedCategory === cat ? 'bg-secondary text-white shadow-md' : 'bg-muted text-foreground hover:bg-muted'}`}>
                    {cat} ({availableItems.filter((i: any) => i.category === cat).length})
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-5" />
              <input type="text" placeholder="Search products..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary" />
            </div>

            <div className="bg-white border border-border rounded-[14px] p-4 max-h-[600px] overflow-y-auto">
              {filteredInventory.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-[16px] text-muted-foreground font-medium">No items found</p>
                  <p className="text-[14px] text-muted-foreground mt-1">Try selecting a different category or adjusting your search</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredInventory.map((item: any) => (
                    <button key={item.id} onClick={() => handleAddToCart(item)} className="text-left border border-border rounded-[8px] p-3 hover:border-secondary hover:bg-muted transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-[14px] font-medium text-foreground line-clamp-2">{item.name}</p>
                        {item.condition && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${item.condition === 'Excellent' ? 'bg-secondary/10 text-secondary' : item.condition === 'Good' ? 'bg-secondary/10 text-secondary' : item.condition === 'Fair' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'}`}>
                            {item.condition}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-muted-foreground mb-2">{item.category}{item.size ? ` • Size ${item.size}` : ''}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-[18px] font-bold text-secondary">₱{item.price}</p>
                        <p className="text-[12px] text-muted-foreground">Stock: {item.quantity}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart */}
          <div>
            <div className="bg-white border border-border rounded-[14px] p-4 sticky top-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[18px] font-bold text-foreground">Current Sale</h3>
                {cart.length > 0 && <button onClick={handleClearCart} className="text-destructive text-[12px] font-medium hover:underline">Clear All</button>}
              </div>

              <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="text-center py-8">
                    <ShoppingCart className="size-12 text-muted mx-auto mb-2" />
                    <p className="text-muted-foreground text-[14px]">Cart is empty</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.inventoryItemId} className="border border-border rounded-[8px] p-3">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-[13px] font-medium text-foreground flex-1">{item.name}</p>
                        <button onClick={() => setCart(cart.filter(c => c.inventoryItemId !== item.inventoryItemId))} className="text-destructive hover:bg-destructive/10 p-1 rounded"><Trash2 className="size-3" /></button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleUpdateQuantity(item.inventoryItemId, item.quantity - 1)} className="size-6 rounded bg-muted hover:bg-muted flex items-center justify-center text-foreground font-bold">-</button>
                          <span className="text-[14px] font-medium text-foreground min-w-[20px] text-center">{item.quantity}</span>
                          <button onClick={() => handleUpdateQuantity(item.inventoryItemId, item.quantity + 1)} className="size-6 rounded bg-muted hover:bg-muted flex items-center justify-center text-foreground font-bold">+</button>
                        </div>
                        <p className="text-[14px] font-bold text-secondary">₱{item.totalPrice}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <>
                  <div className="mb-3">
                    <label className="block text-[12px] font-medium text-muted-foreground mb-1">Customer (Optional)</label>
                    <input type="text" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer name" className="w-full px-3 py-2 border border-border rounded-[6px] text-[13px] focus:outline-none focus:border-secondary" />
                  </div>
                  <div className="mb-4">
                    <label className="block text-[12px] font-medium text-muted-foreground mb-1">Discount (₱)</label>
                    <input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} min="0" max={subtotal} className="w-full px-3 py-2 border border-border rounded-[6px] text-[13px] focus:outline-none focus:border-secondary" />
                  </div>
                </>
              )}

              <div className="border-t border-border pt-3 mb-4 space-y-2">
                <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Subtotal:</span><span className="font-medium text-foreground">₱{subtotal.toLocaleString()}</span></div>
                {discount > 0 && <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Discount:</span><span className="font-medium text-destructive">-₱{discount.toLocaleString()}</span></div>}
                <div className="flex justify-between text-[18px] font-bold pt-2 border-t border-border"><span className="text-foreground">Total:</span><span className="text-secondary">₱{total.toLocaleString()}</span></div>
              </div>

              <button onClick={() => { if (cart.length > 0) { setAmountPaid(paymentMethod === 'Cash' ? Math.ceil(total / 100) * 100 : total); setShowPaymentModal(true); } }} disabled={cart.length === 0} className="w-full bg-secondary text-white py-3 rounded-[8px] font-bold text-[16px] hover:bg-secondary transition-colors disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed flex items-center justify-center gap-2">
                <CreditCard className="size-5" />
                Proceed to Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white border border-border rounded-[14px] p-6">
          {sales.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No sales recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {sales.slice(0, 50).map((sale: any) => (
                <div key={sale.id} className="border border-border rounded-[8px] p-4 hover:bg-muted">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-[16px] font-bold text-foreground">{sale.transactionNumber}</p>
                      <p className="text-[13px] text-muted-foreground">{new Date(sale.createdAt).toLocaleString()} • {sale.cashier?.name ?? '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[18px] font-bold text-secondary">₱{sale.total.toLocaleString()}</p>
                      <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${sale.status === 'COMPLETED' ? 'bg-secondary/10 text-secondary' : sale.status === 'REFUNDED' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                        {sale.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
                    <span>{sale.items?.length ?? 0} item(s)</span>
                    <span>•</span>
                    <span>{sale.paymentMethod}</span>
                    {sale.customer && <><span>•</span><span>{sale.customer}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Returns Tab */}
      {activeTab === 'returns' && (
        <div className="bg-white border border-border rounded-[14px] p-6">
          <p className="text-[14px] text-muted-foreground mb-4">Process returns for completed sales (Inventory Manager only)</p>
          {sales.filter((s: any) => s.status === 'COMPLETED').length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No completed sales available for returns.</p>
          ) : (
            <div className="space-y-3">
              {sales.filter((s: any) => s.status === 'COMPLETED').slice(0, 20).map((sale: any) => (
                <div key={sale.id} className="border border-border rounded-[8px] p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-[16px] font-bold text-foreground">{sale.transactionNumber}</p>
                      <p className="text-[13px] text-muted-foreground">{new Date(sale.createdAt).toLocaleString()}</p>
                      <p className="text-[13px] text-muted-foreground">Items: {sale.items?.map((i: any) => i.name).join(', ')}</p>
                    </div>
                    <p className="text-[18px] font-bold text-secondary">₱{sale.total.toLocaleString()}</p>
                  </div>
                  {selectedSaleForReturn === sale.id ? (
                    <div>
                      <textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Reason for return..." className="w-full px-3 py-2 border border-border rounded-[6px] text-[13px] focus:outline-none focus:border-secondary mb-2 resize-none" rows={2} />
                      <div className="flex gap-2">
                        <button onClick={() => handleProcessReturn(sale.id)} disabled={saving} className="flex-1 bg-destructive text-white px-4 py-2 rounded-[6px] text-[13px] font-medium hover:bg-destructive disabled:opacity-60">{saving ? 'Processing…' : 'Confirm Return'}</button>
                        <button onClick={() => { setSelectedSaleForReturn(null); setReturnReason(''); }} className="flex-1 bg-muted text-foreground px-4 py-2 rounded-[6px] text-[13px] font-medium hover:bg-muted">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setSelectedSaleForReturn(sale.id)} disabled={currentUser?.role === 'Staff'} className="w-full bg-warning text-white px-4 py-2 rounded-[6px] text-[13px] font-medium hover:bg-warning disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      <RotateCcw className="size-4" /> Process Return
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[14px] p-6 max-w-md w-full">
            <h3 className="text-[20px] font-bold text-foreground mb-4">Payment</h3>
            <div className="mb-4">
              <p className="text-[14px] text-muted-foreground mb-1">Payment Method</p>
              <div className="grid grid-cols-2 gap-2">
                {(['Cash', 'GCash', 'Card', 'Bank Transfer'] as const).map(method => (
                  <button key={method} onClick={() => { setPaymentMethod(method); setAmountPaid(method === 'Cash' ? Math.ceil(total / 100) * 100 : total); }} className={`px-4 py-2 rounded-[6px] text-[13px] font-medium border ${paymentMethod === method ? 'bg-secondary text-white border-secondary' : 'bg-white text-foreground border-border hover:border-secondary'}`}>
                    {method}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-muted rounded-[8px] p-4 mb-4">
              <div className="flex justify-between mb-2"><span className="text-[14px] text-muted-foreground">Total Amount:</span><span className="text-[18px] font-bold text-secondary">₱{total.toLocaleString()}</span></div>
            </div>
            {paymentMethod === 'Cash' && (
              <>
                <div className="mb-4">
                  <label className="block text-[14px] font-medium text-foreground mb-2">Amount Paid</label>
                  <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(Number(e.target.value))} min={total} step={50} className="w-full px-4 py-2 border border-border rounded-[6px] text-[16px] font-medium focus:outline-none focus:border-secondary" />
                </div>
                {amountPaid >= total && (
                  <div className="bg-secondary/10 rounded-[8px] p-4 mb-4">
                    <div className="flex justify-between"><span className="text-[14px] text-secondary font-medium">Change:</span><span className="text-[20px] font-bold text-secondary">₱{change.toLocaleString()}</span></div>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowPaymentModal(false)} className="flex-1 bg-muted text-foreground px-4 py-3 rounded-[8px] font-medium hover:bg-muted">Cancel</button>
              <button onClick={handleProcessPayment} disabled={saving || (paymentMethod === 'Cash' && amountPaid < total)} className="flex-1 bg-secondary text-white px-4 py-3 rounded-[8px] font-medium hover:bg-secondary disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed">
                {saving ? 'Processing…' : 'Complete Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceiptModal && lastTransaction && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[14px] p-6 max-w-md w-full">
            <div className="text-center mb-6">
              <CheckCircle className="size-16 text-success mx-auto mb-3" />
              <h3 className="text-[24px] font-bold text-foreground">Sale Completed!</h3>
              <p className="text-[14px] text-muted-foreground">{lastTransaction.transactionNumber}</p>
            </div>
            <div className="border border-border rounded-[8px] p-4 mb-4">
              <p className="text-[12px] text-muted-foreground mb-2">{new Date(lastTransaction.createdAt).toLocaleString()}</p>
              <div className="space-y-1 mb-3">
                {lastTransaction.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-[13px]">
                    <span className="text-foreground">{item.name} x{item.quantity}</span>
                    <span className="font-medium text-foreground">₱{item.totalPrice}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-2 space-y-1">
                <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Subtotal:</span><span className="text-foreground">₱{lastTransaction.subtotal.toLocaleString()}</span></div>
                {lastTransaction.discount > 0 && <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Discount:</span><span className="text-destructive">-₱{lastTransaction.discount.toLocaleString()}</span></div>}
                <div className="flex justify-between text-[16px] font-bold pt-2 border-t border-border"><span className="text-foreground">Total:</span><span className="text-secondary">₱{lastTransaction.total.toLocaleString()}</span></div>
                <div className="flex justify-between text-[13px] pt-2"><span className="text-muted-foreground">Payment:</span><span className="text-foreground">{lastTransaction.paymentMethod}</span></div>
                {lastTransaction.paymentMethod === 'Cash' && (
                  <>
                    <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Cash:</span><span className="text-foreground">₱{lastTransaction.amountPaid.toLocaleString()}</span></div>
                    <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Change:</span><span className="text-foreground">₱{lastTransaction.change.toLocaleString()}</span></div>
                  </>
                )}
              </div>
            </div>
            <button onClick={() => setShowReceiptModal(false)} className="w-full bg-secondary text-white px-4 py-3 rounded-[8px] font-medium hover:bg-secondary">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
