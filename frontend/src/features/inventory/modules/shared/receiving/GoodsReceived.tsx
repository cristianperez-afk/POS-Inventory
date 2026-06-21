import React, { useMemo, useState } from 'react';
import {
  Search,
  X,
  PackageCheck,
  CheckCircle,
  XCircle,
  ClipboardCheck,
  Eye,
} from 'lucide-react';

// ─── Shared types ────────────────────────────────────────────────────────────
// One PO line awaiting receipt. `orderedQty` is the quantity still to receive.
export type NormalizedLine = {
  id: string;
  name: string;
  orderedQty: number;
  unitPrice: number;
  meta?: Record<string, unknown>;
};

// A PO that is approved / partially received and awaiting a quality check.
export type PendingReceipt = {
  id: string;
  orderNumber: string;
  supplier: string;
  status: string; // 'APPROVED' | 'PARTIALLY_RECEIVED'
  total: number;
  items: NormalizedLine[];
};

// A completed goods receipt (history).
export type ReceiptRecord = {
  id: string;
  orderNumber: string;
  supplier: string;
  receivedDate: string;
  receivedBy: string;
  status: string; // module-specific label
  // Parseable date (ISO or YYYY-MM-DD) used for time-range filtering.
  receivedAt?: string;
  totalAccepted: number;
  totalRejected: number;
  lines: Array<{
    name: string;
    orderedQty: number;
    acceptedQty: number;
    rejectedQty: number;
  }>;
};

// The payload sent to the (shared) backend receive endpoint.
export type ReceiveItemInput = {
  id: string;
  receivedQty: number; // accepted units — the only quantity added to stock
  rejectedQty: number;
  condition?: string;
  notes?: string;
  expiryDate?: string;
  storageTemperature?: string;
};

// Per-line working state inside the inspection modal.
export type LineDraft = {
  acceptedQty: number;
  rejectedQty: number;
  fields: Record<string, any>; // module-specific field values
};

export type FieldDef =
  | { key: string; type: 'select'; label: string; options: string[] }
  | { key: string; type: 'date'; label: string }
  | { key: string; type: 'textarea'; label: string }
  | { key: string; type: 'text'; label: string };

// Everything the shared screen needs. A module provides this (usually via a hook
// that runs the module-specific queries/mutations).
export type ResolvedReceivingConfig = {
  labels: { title: string; subtitle: string };
  loading: boolean;
  error?: string | null;

  pending: PendingReceipt[];
  history: ReceiptRecord[];

  // Module-specific inspection fields, rendered per line.
  lineFields: FieldDef[];
  initLineFields: (line: NormalizedLine) => Record<string, any>;
  // How the rejected quantity is determined:
  //  'input'          → user types it (remainder back-orders)         [retail]
  //  'auto-remainder' → rejected = ordered − accepted (read-only)     [restaurant]
  rejectedMode: 'input' | 'auto-remainder';
  // Escape hatch for genuinely bespoke per-line UI (e.g. restaurant score grid).
  renderLineExtras?: (
    line: NormalizedLine,
    draft: LineDraft,
    patch: (partial: Partial<LineDraft>) => void,
  ) => React.ReactNode;
  validateLine?: (line: NormalizedLine, draft: LineDraft) => string | null;
  buildReceiveItem: (line: NormalizedLine, draft: LineDraft) => ReceiveItemInput;
  receive: (poId: string, items: ReceiveItemInput[]) => Promise<void>;

  historyStatusClass?: (status: string) => string;
  renderHistoryDetails?: (record: ReceiptRecord) => React.ReactNode;
};

// ─── Component ───────────────────────────────────────────────────────────────
export function GoodsReceived({ config }: { config: ResolvedReceivingConfig }) {
  const {
    labels,
    loading,
    pending,
    history,
    lineFields,
    initLineFields,
    rejectedMode,
    renderLineExtras,
    validateLine,
    buildReceiveItem,
    receive,
    historyStatusClass,
    renderHistoryDetails,
  } = config;

  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'accepted' | 'rejected'>('all');
  const [monthsFilter, setMonthsFilter] = useState<'all' | '1' | '3' | '6' | '12'>('all');
  const [selected, setSelected] = useState<PendingReceipt | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewRecord, setViewRecord] = useState<ReceiptRecord | null>(null);

  const stats = useMemo(
    () => ({
      pending: pending.length,
      received: history.length,
      fullyAccepted: history.filter((r) => r.totalRejected === 0).length,
      withRejections: history.filter((r) => r.totalRejected > 0).length,
    }),
    [pending, history],
  );

  const filteredHistory = history.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      r.orderNumber.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q);

    const matchesOutcome =
      outcomeFilter === 'all'
        ? true
        : outcomeFilter === 'accepted'
          ? r.totalRejected === 0
          : r.totalRejected > 0;

    let matchesMonths = true;
    if (monthsFilter !== 'all' && r.receivedAt) {
      const received = new Date(r.receivedAt);
      if (!Number.isNaN(received.getTime())) {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - Number(monthsFilter));
        matchesMonths = received >= cutoff;
      }
    }

    return matchesSearch && matchesOutcome && matchesMonths;
  });

  const openInspection = (po: PendingReceipt) => {
    setError(null);
    const initial: Record<string, LineDraft> = {};
    po.items.forEach((line) => {
      initial[line.id] = {
        acceptedQty: line.orderedQty,
        rejectedQty: 0,
        fields: initLineFields(line),
      };
    });
    setDrafts(initial);
    setSelected(po);
  };

  const closeInspection = () => {
    setSelected(null);
    setDrafts({});
    setError(null);
  };

  const patchDraft = (lineId: string, line: NormalizedLine, partial: Partial<LineDraft>) => {
    setDrafts((prev) => {
      const current = prev[lineId];
      const next: LineDraft = {
        ...current,
        ...partial,
        fields: { ...current.fields, ...(partial.fields ?? {}) },
      };
      // Clamp accepted to the orderable range.
      next.acceptedQty = Math.min(Math.max(next.acceptedQty || 0, 0), line.orderedQty);
      if (rejectedMode === 'auto-remainder') {
        next.rejectedQty = Math.max(0, line.orderedQty - next.acceptedQty);
      } else {
        // Rejected can't push accepted+rejected past what was ordered.
        next.rejectedQty = Math.min(
          Math.max(next.rejectedQty || 0, 0),
          line.orderedQty - next.acceptedQty,
        );
      }
      return { ...prev, [lineId]: next };
    });
  };

  const handleSubmit = async () => {
    if (!selected || saving) return;
    const items: ReceiveItemInput[] = [];
    for (const line of selected.items) {
      const draft = drafts[line.id];
      if (!draft) continue;
      const err = validateLine?.(line, draft);
      if (err) {
        setError(err);
        return;
      }
      items.push(buildReceiveItem(line, draft));
    }
    const totalProcessed = items.reduce((sum, i) => sum + i.receivedQty + i.rejectedQty, 0);
    if (totalProcessed <= 0) {
      setError('Enter an accepted or rejected quantity for at least one item.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await receive(selected.id, items);
      closeInspection();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to receive purchase order');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (
    field: FieldDef,
    line: NormalizedLine,
    draft: LineDraft,
  ) => {
    const value = draft.fields[field.key] ?? '';
    const onChange = (v: string) => patchDraft(line.id, line, { fields: { [field.key]: v } });
    const base =
      'w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]';
    return (
      <div key={field.key}>
        <label className="block text-[12px] font-medium text-[#323B42] mb-2">{field.label}</label>
        {field.type === 'select' ? (
          <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : field.type === 'textarea' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className={`${base} resize-none`}
          />
        ) : (
          <input
            type={field.type === 'date' ? 'date' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={base}
          />
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[30px] font-bold text-[#323B42]">{labels.title}</h2>
          <p className="text-[#323B42] text-[14px] mt-1">{labels.subtitle}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#323B42] size-4" />
          <input
            type="text"
            placeholder="Search receipts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] w-[260px] text-[14px] focus:outline-none focus:border-[#007A5E]"
          />
        </div>
      </div>

      {error && !selected && (
        <div className="mb-4 p-3 bg-[#ffe2e2] border border-[#E7000B] rounded-[8px] text-[14px] text-[#E7000B]">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4">
          <p className="text-[#323B42] text-[12px] mb-1">Pending QC</p>
          <p className="text-[#FFA500] text-[24px] font-bold">{loading ? '—' : stats.pending}</p>
        </div>
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4">
          <p className="text-[#323B42] text-[12px] mb-1">Total Receipts</p>
          <p className="text-[#323B42] text-[24px] font-bold">{loading ? '—' : stats.received}</p>
        </div>
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4">
          <p className="text-[#323B42] text-[12px] mb-1">Fully Accepted</p>
          <p className="text-[#008967] text-[24px] font-bold">{loading ? '—' : stats.fullyAccepted}</p>
        </div>
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4">
          <p className="text-[#323B42] text-[12px] mb-1">With Rejections</p>
          <p className="text-[#E7000B] text-[24px] font-bold">{loading ? '—' : stats.withRejections}</p>
        </div>
      </div>

      {/* Pending Quality Check queue */}
      {pending.length > 0 && (
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <PackageCheck className="size-5 text-[#FFA500]" />
            <h3 className="text-[16px] font-semibold text-[#323B42]">Pending Quality Check</h3>
            <span className="ml-1 text-[12px] bg-[#fff4e6] text-[#d08700] px-2 py-0.5 rounded-full font-medium">
              {pending.length}
            </span>
          </div>
          <p className="text-[13px] text-[#6b7280] mb-4">
            Approved deliveries awaiting inspection. Stock is only added after the quality check.
          </p>
          <div className="space-y-3">
            {pending.map((po) => (
              <div
                key={po.id}
                className="border border-[rgba(0,0,0,0.1)] rounded-[12px] p-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-[15px] font-semibold text-[#323B42]">{po.orderNumber}</h4>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        po.status === 'PARTIALLY_RECEIVED'
                          ? 'bg-[#fff4e6] text-[#d08700]'
                          : 'bg-[#E0F2F2] text-[#007A5E]'
                      }`}
                    >
                      {po.status === 'PARTIALLY_RECEIVED' ? 'Partially Received' : 'Approved'}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#323B42]">Supplier: {po.supplier || 'N/A'}</p>
                  <p className="text-[12px] text-[#6b7280]">
                    {po.items.length} item(s) • ₱{po.total.toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => openInspection(po)}
                  className="px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[13px] font-medium hover:bg-[#008967] transition-colors flex items-center gap-2 flex-shrink-0"
                >
                  <ClipboardCheck className="size-4" />
                  Quality Check
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receiving history + filters */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-[16px] font-semibold text-[#323B42]">Receiving History</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[13px] text-[#6b7280]">Outcome</label>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value as typeof outcomeFilter)}
            className="px-3 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[13px] bg-white focus:outline-none focus:border-[#007A5E]"
          >
            <option value="all">All</option>
            <option value="accepted">Fully Accepted</option>
            <option value="rejected">With Rejections</option>
          </select>
          <label className="text-[13px] text-[#6b7280] ml-1">Period</label>
          <select
            value={monthsFilter}
            onChange={(e) => setMonthsFilter(e.target.value as typeof monthsFilter)}
            className="px-3 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[13px] bg-white focus:outline-none focus:border-[#007A5E]"
          >
            <option value="all">All time</option>
            <option value="1">Last month</option>
            <option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
          </select>
        </div>
      </div>

      {/* History */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-12 text-center">
            <p className="text-[14px] text-[#6b7280]">Loading...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-12 text-center">
            <PackageCheck className="size-16 text-[#d1d5dc] mx-auto mb-4" />
            <p className="text-[16px] text-[#323B42] font-medium">No receipts found</p>
            <p className="text-[14px] text-[#6b7280] mt-1">
              {history.length > 0
                ? 'No receipts match the current filters — try a different outcome or period.'
                : 'Complete a quality check to see received goods here'}
            </p>
          </div>
        ) : (
          filteredHistory.map((r) => (
            <div key={r.id} className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-[18px] font-semibold text-[#323B42]">{r.orderNumber}</h3>
                    <span
                      className={`px-3 py-1 rounded text-[12px] font-semibold ${
                        historyStatusClass?.(r.status) ?? 'bg-[#E0F5F1] text-[#008967]'
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-[14px] text-[#323B42]">
                    Supplier: <span className="font-medium">{r.supplier || 'N/A'}</span>
                  </p>
                  <p className="text-[14px] text-[#323B42]">Date Received: {r.receivedDate || 'N/A'}</p>
                  <p className="text-[14px] text-[#323B42]">Received By: {r.receivedBy || 'N/A'}</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="text-right">
                    <div className="bg-[#E0F5F1] rounded-[8px] px-4 py-2 mb-2">
                      <p className="text-[11px] text-[#323B42]">Accepted</p>
                      <p className="text-[20px] font-bold text-[#008967]">{r.totalAccepted}</p>
                    </div>
                    {r.totalRejected > 0 && (
                      <div className="bg-[#ffe2e2] rounded-[8px] px-4 py-2">
                        <p className="text-[11px] text-[#323B42]">Rejected</p>
                        <p className="text-[20px] font-bold text-[#E7000B]">{r.totalRejected}</p>
                      </div>
                    )}
                  </div>
                  {renderHistoryDetails && (
                    <button
                      onClick={() => setViewRecord(r)}
                      className="p-2 hover:bg-[#E0F2F2] rounded-[8px] text-[#007A5E] transition-colors"
                      title="View details"
                    >
                      <Eye className="size-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-[rgba(0,0,0,0.1)] pt-4">
                <p className="text-[14px] font-medium text-[#323B42] mb-3">Items Inspection Results:</p>
                <div className="space-y-2">
                  {r.lines.map((line, idx) => (
                    <div key={idx} className="bg-[#F8FAFB] rounded-[8px] p-4 flex items-start justify-between">
                      <p className="text-[14px] font-medium text-[#323B42] flex-1">{line.name}</p>
                      <div className="text-right">
                        <p className="text-[13px] text-[#323B42]">
                          <span className="font-semibold text-[#008967]">{line.acceptedQty}</span> accepted
                          {line.rejectedQty > 0 && (
                            <>
                              {' '}• <span className="font-semibold text-[#E7000B]">{line.rejectedQty}</span> rejected
                            </>
                          )}
                        </p>
                        <p className="text-[12px] text-[#6b7280]">Ordered: {line.orderedQty}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Inspection Modal */}
      {selected && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[14px] p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[24px] font-bold text-[#323B42] flex items-center gap-2">
                  <ClipboardCheck className="size-6 text-[#007A5E]" />
                  Quality Check — {selected.orderNumber}
                </h3>
                <p className="text-[14px] text-[#323B42] mt-1">Supplier: {selected.supplier || 'N/A'}</p>
              </div>
              <button onClick={closeInspection} className="p-2 hover:bg-[#F8FAFB] rounded">
                <X className="size-5 text-[#323B42]" />
              </button>
            </div>

            <div className="mb-6 bg-[#E0F5F1] border border-[#007A5E] rounded-[12px] p-4">
              <p className="text-[13px] text-[#323B42]">
                Only the <span className="font-semibold">accepted</span> quantity is added to inventory.
                Rejected units are held back for return/refund; any remainder stays on the order.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-[#ffe2e2] border border-[#E7000B] rounded-[8px] text-[14px] text-[#E7000B]">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {selected.items.map((line) => {
                const draft = drafts[line.id];
                if (!draft) return null;
                return (
                  <div
                    key={line.id}
                    className="bg-[#F8FAFB] border border-[rgba(0,0,0,0.1)] rounded-[12px] p-5"
                  >
                    <div className="mb-4">
                      <h4 className="text-[16px] font-semibold text-[#323B42]">{line.name}</h4>
                      <p className="text-[13px] text-[#323B42]">
                        To receive: {line.orderedQty} units @ ₱{line.unitPrice} each
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-[12px] font-medium text-[#323B42] mb-2">Accepted Qty *</label>
                        <input
                          type="number"
                          min="0"
                          max={line.orderedQty}
                          value={draft.acceptedQty}
                          onChange={(e) =>
                            patchDraft(line.id, line, { acceptedQty: parseInt(e.target.value) || 0 })
                          }
                          className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#323B42] mb-2">Rejected Qty</label>
                        <input
                          type="number"
                          min="0"
                          max={line.orderedQty - draft.acceptedQty}
                          value={draft.rejectedQty}
                          disabled={rejectedMode === 'auto-remainder'}
                          onChange={(e) =>
                            patchDraft(line.id, line, { rejectedQty: parseInt(e.target.value) || 0 })
                          }
                          className={`w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] ${
                            rejectedMode === 'auto-remainder' ? 'bg-[#e9ecef] cursor-not-allowed' : ''
                          }`}
                        />
                      </div>
                      {lineFields[0] && renderField(lineFields[0], line, draft)}
                    </div>

                    {lineFields.length > 1 && (
                      <div className="grid grid-cols-1 gap-4 mb-2">
                        {lineFields.slice(1).map((f) => renderField(f, line, draft))}
                      </div>
                    )}

                    {renderLineExtras?.(line, draft, (partial) => patchDraft(line.id, line, partial))}

                    {draft.rejectedQty > 0 && (
                      <div className="mt-3 p-3 bg-[#fff4e6] border border-[#FFA500] rounded-[8px]">
                        <p className="text-[13px] text-[#d08700] font-medium">
                          {draft.rejectedQty} unit(s) will be rejected and not added to stock
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeInspection}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-[#323B42] hover:bg-[#F8FAFB] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[14px] font-medium hover:bg-[#008967] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle className="size-4" />
                {saving ? 'Saving...' : 'Complete QC & Add Accepted Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History details modal (module-provided) */}
      {viewRecord && renderHistoryDetails && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[14px] p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[24px] font-bold text-[#323B42]">
                Goods Received — {viewRecord.orderNumber}
              </h3>
              <button onClick={() => setViewRecord(null)} className="p-2 hover:bg-[#F8FAFB] rounded">
                <X className="size-5 text-[#323B42]" />
              </button>
            </div>
            {renderHistoryDetails(viewRecord)}
          </div>
        </div>
      )}
    </div>
  );
}
