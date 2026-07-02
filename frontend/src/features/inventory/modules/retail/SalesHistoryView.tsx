import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Search, Receipt, RotateCcw, X, Download, TrendingUp, PhilippinePeso, ShoppingBag } from 'lucide-react';
import {
  useRefundRetailSaleMutation,
  useRetailLocationsQuery,
  useRetailSalesQuery,
} from '../lib/retail';
import { formatManilaFullDateTime, getLocalDateKey, parseDatabaseTimestamp } from '../../../../shared/utils/date';

type Sale = {
  id: string;
  transactionNumber: string;
  createdAt: string;
  total: number;
  subtotal: number;
  discount: number;
  tax: number;
  amountPaid: number;
  change: number;
  paymentMethod: string;
  status: string;
  customer?: string | null;
  refundReason?: string | null;
  cashier?: { id: string; name: string } | null;
  location?: { id: string; name: string } | null;
  items?: { id: string; name: string; quantity: number; unitPrice: number; totalPrice: number }[];
};

const STATUS_PILL: Record<string, string> = {
  COMPLETED: 'bg-success/10 text-success',
  REFUNDED: 'bg-destructive/10 text-destructive',
  PARTIAL_REFUND: 'bg-warning/10 text-warning',
};

const formatDateTime = (value: string) => {
  const formatted = formatManilaFullDateTime(value);
  return formatted === '-' ? value : formatted;
};

export default function SalesHistoryView({
  currentUser,
}: {
  currentUser: { email: string; role: string } | null;
}) {
  const salesQuery = useRetailSalesQuery({ limit: 500 });
  const locationsQuery = useRetailLocationsQuery();
  const refundSaleMutation = useRefundRetailSaleMutation();
  const sales = (salesQuery.data ?? []) as Sale[];
  const locations = locationsQuery.data ?? [];
  const loading = salesQuery.isLoading || locationsQuery.isLoading;

  const [dateRange, setDateRange] = useState<'7days' | '30days' | '3months' | 'year' | 'all'>('30days');
  const [locationId, setLocationId] = useState('all');
  const [status, setStatus] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [search, setSearch] = useState('');

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [refundTarget, setRefundTarget] = useState<Sale | null>(null);
  const [refundReason, setRefundReason] = useState('');

  // Refunds/returns are an approver action — available to Managers and Admins,
  // never to Staff.
  const canRefund = currentUser?.role === 'Admin' || currentUser?.role === 'Manager';

  const rangeStart = useMemo(() => {
    if (dateRange === 'all') return null;
    const now = new Date();
    const d = new Date(now);
    if (dateRange === '7days') d.setDate(now.getDate() - 7);
    else if (dateRange === '30days') d.setDate(now.getDate() - 30);
    else if (dateRange === '3months') d.setMonth(now.getMonth() - 3);
    else if (dateRange === 'year') d.setFullYear(now.getFullYear() - 1);
    return d;
  }, [dateRange]);

  const filteredSales = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sales.filter((s) => {
      if (rangeStart && parseDatabaseTimestamp(s.createdAt) < rangeStart) return false;
      if (locationId !== 'all' && s.location?.id !== locationId) return false;
      if (status !== 'all' && s.status !== status) return false;
      if (paymentMethod !== 'all' && s.paymentMethod !== paymentMethod) return false;
      if (term) {
        const haystack = `${s.transactionNumber} ${s.customer ?? ''} ${s.cashier?.name ?? ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [sales, rangeStart, locationId, status, paymentMethod, search]);

  const stats = useMemo(() => {
    const completed = filteredSales.filter((s) => s.status === 'COMPLETED');
    const revenue = completed.reduce((sum, s) => sum + s.total, 0);
    const refunds = filteredSales.filter((s) => s.status === 'REFUNDED');
    const refundValue = refunds.reduce((sum, s) => sum + s.total, 0);
    const itemsSold = completed.reduce(
      (sum, s) => sum + (s.items?.reduce((n, i) => n + i.quantity, 0) ?? 0), 0,
    );
    const avgSale = completed.length > 0 ? revenue / completed.length : 0;

    const byPayment: Record<string, number> = {};
    completed.forEach((s) => { byPayment[s.paymentMethod] = (byPayment[s.paymentMethod] || 0) + s.total; });

    const productCount: Record<string, { qty: number; revenue: number }> = {};
    completed.forEach((s) => (s.items ?? []).forEach((i) => {
      const e = productCount[i.name] || { qty: 0, revenue: 0 };
      e.qty += i.quantity; e.revenue += i.totalPrice;
      productCount[i.name] = e;
    }));
    const topProducts = Object.entries(productCount)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);

    return { revenue, transactions: completed.length, avgSale, itemsSold, refundCount: refunds.length, refundValue, byPayment, topProducts };
  }, [filteredSales]);

  const handleRefund = async () => {
    if (!refundTarget) return;
    if (!refundReason.trim()) { toast.error('Please provide a reason for the refund'); return; }
    try {
      await refundSaleMutation.mutateAsync({ id: refundTarget.id, reason: refundReason.trim() });
      setRefundTarget(null);
      setRefundReason('');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to process refund');
    }
  };

  const handleExport = () => {
    const rows = [
      ['Transaction', 'Date', 'Cashier', 'Location', 'Customer', 'Items', 'Payment', 'Status', 'Subtotal', 'Discount', 'Total'],
      ...filteredSales.map((s) => [
        s.transactionNumber,
        formatDateTime(s.createdAt),
        s.cashier?.name ?? '',
        s.location?.name ?? '',
        s.customer ?? '',
        String(s.items?.reduce((n, i) => n + i.quantity, 0) ?? 0),
        s.paymentMethod,
        s.status,
        s.subtotal.toFixed(2),
        s.discount.toFixed(2),
        s.total.toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Sales_History_${getLocalDateKey()}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading sales history…</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[30px] font-bold text-foreground">Sales History</h2>
          <p className="text-[14px] text-muted-foreground mt-1">Review past transactions, returns, and sales performance</p>
        </div>
        <button
          onClick={handleExport}
          className="bg-secondary text-white px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-secondary/90 hover:-translate-y-0.5 hover:shadow-md hover:shadow-secondary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 active:translate-y-0 active:shadow-sm transition-all duration-200 flex items-center gap-2"
        >
          <Download className="size-4" />
          Export
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-[14px] p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted-foreground text-[12px]">Total Revenue</p>
            <PhilippinePeso className="size-4 text-secondary" />
          </div>
          <p className="text-foreground text-[24px] font-bold">₱{stats.revenue.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted-foreground text-[12px]">Transactions</p>
            <Receipt className="size-4 text-secondary" />
          </div>
          <p className="text-foreground text-[24px] font-bold">{stats.transactions}</p>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted-foreground text-[12px]">Avg. Sale</p>
            <TrendingUp className="size-4 text-secondary" />
          </div>
          <p className="text-foreground text-[24px] font-bold">₱{Math.round(stats.avgSale).toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted-foreground text-[12px]">Items Sold</p>
            <ShoppingBag className="size-4 text-secondary" />
          </div>
          <p className="text-foreground text-[24px] font-bold">{stats.itemsSold}</p>
          {stats.refundCount > 0 && (
            <p className="text-destructive text-[12px] mt-1">{stats.refundCount} refund(s) · ₱{stats.refundValue.toLocaleString()}</p>
          )}
        </div>
      </div>

      {/* Breakdown row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-card border border-border rounded-[14px] p-6">
          <h4 className="text-[16px] font-semibold text-foreground mb-4">Revenue by Payment Method</h4>
          {Object.keys(stats.byPayment).length === 0 ? (
            <p className="text-[14px] text-muted-foreground py-4 text-center">No completed sales in range</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.byPayment).sort((a, b) => b[1] - a[1]).map(([method, value]) => (
                <div key={method}>
                  <div className="flex justify-between text-[14px] mb-1">
                    <span className="text-foreground font-medium">{method}</span>
                    <span className="text-secondary font-bold">₱{value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-secondary rounded-full" style={{ width: `${stats.revenue > 0 ? (value / stats.revenue) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-[14px] p-6">
          <h4 className="text-[16px] font-semibold text-foreground mb-4">Top Products by Revenue</h4>
          {stats.topProducts.length === 0 ? (
            <p className="text-[14px] text-muted-foreground py-4 text-center">No completed sales in range</p>
          ) : (
            <div className="space-y-3">
              {stats.topProducts.map(([name, data], i) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center font-bold text-[14px] flex-shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-foreground truncate">{name}</p>
                    <p className="text-[12px] text-muted-foreground">{data.qty} sold</p>
                  </div>
                  <p className="text-[14px] font-bold text-foreground flex-shrink-0">₱{data.revenue.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
          <input
            type="text"
            placeholder="Search transaction #, customer, cashier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-[8px] text-[14px] bg-card text-foreground focus:outline-none focus:border-secondary"
          />
        </div>
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value as any)} className="bg-card border border-border rounded-[8px] px-3 py-2 text-[14px] text-foreground">
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
          <option value="3months">Last 3 Months</option>
          <option value="year">This Year</option>
          <option value="all">All Time</option>
        </select>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="bg-card border border-border rounded-[8px] px-3 py-2 text-[14px] text-foreground">
          <option value="all">All Locations</option>
          {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-card border border-border rounded-[8px] px-3 py-2 text-[14px] text-foreground">
          <option value="all">All Status</option>
          <option value="COMPLETED">Completed</option>
          <option value="REFUNDED">Refunded</option>
          <option value="PARTIAL_REFUND">Partial Refund</option>
        </select>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="bg-card border border-border rounded-[8px] px-3 py-2 text-[14px] text-foreground">
          <option value="all">All Payments</option>
          <option value="Cash">Cash</option>
          <option value="GCash">GCash</option>
          <option value="Card">Card</option>
          <option value="Bank Transfer">Bank Transfer</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-[14px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Transaction</th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Cashier</th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Location</th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Items</th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Payment</th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-foreground uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold text-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-[12px] font-semibold text-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-[14px] text-muted-foreground">No sales match the current filters</td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 text-[13px] font-medium text-foreground whitespace-nowrap">{sale.transactionNumber}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{formatDateTime(sale.createdAt)}</td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{sale.cashier?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{sale.location?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{sale.items?.reduce((n, i) => n + i.quantity, 0) ?? 0}</td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{sale.paymentMethod}</td>
                    <td className="px-4 py-3 text-[13px] font-bold text-secondary text-right whitespace-nowrap">₱{sale.total.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-medium ${STATUS_PILL[sale.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {sale.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setSelectedSale(sale)} className="text-[12px] text-secondary font-medium hover:underline mr-3">View</button>
                      {canRefund && sale.status === 'COMPLETED' && (
                        <button onClick={() => { setRefundTarget(sale); setRefundReason(''); }} className="text-[12px] text-destructive font-medium hover:underline">Refund</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {selectedSale && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-[20px] font-bold text-foreground">{selectedSale.transactionNumber}</h3>
                <p className="text-[12px] text-muted-foreground">{formatDateTime(selectedSale.createdAt)}</p>
              </div>
              <button onClick={() => setSelectedSale(null)} className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-medium ${STATUS_PILL[selectedSale.status] ?? 'bg-muted text-muted-foreground'}`}>
                {selectedSale.status.replace('_', ' ')}
              </span>
              <span className="text-[12px] text-muted-foreground">{selectedSale.paymentMethod}</span>
              {selectedSale.location?.name && <span className="text-[12px] text-muted-foreground">· {selectedSale.location.name}</span>}
            </div>

            {selectedSale.customer && <p className="text-[13px] text-foreground mb-1">Customer: <span className="text-muted-foreground">{selectedSale.customer}</span></p>}
            <p className="text-[13px] text-foreground mb-4">Cashier: <span className="text-muted-foreground">{selectedSale.cashier?.name ?? '—'}</span></p>

            <div className="border border-border rounded-[8px] p-4 mb-4">
              <div className="space-y-2 mb-3">
                {(selectedSale.items ?? []).map((item) => (
                  <div key={item.id} className="flex justify-between text-[13px]">
                    <span className="text-foreground">{item.name} <span className="text-muted-foreground">x{item.quantity}</span></span>
                    <span className="font-medium text-foreground">₱{item.totalPrice.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-2 space-y-1">
                <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Subtotal</span><span className="text-foreground">₱{selectedSale.subtotal.toLocaleString()}</span></div>
                {selectedSale.discount > 0 && <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Discount</span><span className="text-destructive">-₱{selectedSale.discount.toLocaleString()}</span></div>}
                <div className="flex justify-between text-[16px] font-bold pt-2 border-t border-border"><span className="text-foreground">Total</span><span className="text-secondary">₱{selectedSale.total.toLocaleString()}</span></div>
              </div>
            </div>

            {selectedSale.status === 'REFUNDED' && selectedSale.refundReason && (
              <div className="bg-destructive/10 rounded-[8px] p-3 mb-4">
                <p className="text-[12px] font-medium text-destructive">Refund reason</p>
                <p className="text-[13px] text-foreground mt-1">{selectedSale.refundReason}</p>
              </div>
            )}

            {canRefund && selectedSale.status === 'COMPLETED' && (
              <button
                onClick={() => { setRefundTarget(selectedSale); setRefundReason(''); setSelectedSale(null); }}
                className="w-full bg-warning text-warning-foreground px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-warning/90 transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw className="size-4" /> Process Refund
              </button>
            )}
          </div>
        </div>
      )}

      {/* Refund modal */}
      {refundTarget && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-[14px] p-6 max-w-md w-full">
            <h3 className="text-[20px] font-bold text-foreground mb-1">Refund {refundTarget.transactionNumber}</h3>
            <p className="text-[13px] text-muted-foreground mb-4">This restocks the items and marks the sale as refunded.</p>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Reason for refund…"
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] bg-card text-foreground focus:outline-none focus:border-secondary resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setRefundTarget(null); setRefundReason(''); }} className="flex-1 bg-muted text-foreground px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-muted/80">Cancel</button>
              <button onClick={handleRefund} disabled={refundSaleMutation.isPending} className="flex-1 bg-destructive text-white px-4 py-2 rounded-[8px] text-[14px] font-medium hover:bg-destructive/90 disabled:opacity-60">
                {refundSaleMutation.isPending ? 'Processing…' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

