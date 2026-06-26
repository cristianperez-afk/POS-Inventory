import React, { useMemo, useRef, useState } from 'react';
import type { WheelEvent } from 'react';
import {
  Search,
  X,
  PackageCheck,
  CheckCircle,
  XCircle,
  ClipboardCheck,
  Eye,
  Upload,
} from 'lucide-react';
import { formatManilaDateTime, parseDatabaseTimestamp } from '../../../../../shared/utils/date';

const preventNumberWheel = (event: WheelEvent<HTMLInputElement>) => {
  event.currentTarget.blur();
};

const parseDecimalInput = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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
  purchaseOrderNumber?: string;
  supplier: string;
  receivedDate: string;
  receivedBy: string;
  status: string; // module-specific label
  // Parseable date (ISO or YYYY-MM-DD) used for time-range filtering.
  receivedAt?: string;
  actionReason?: string | null;
  proofImages?: string[];
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
  expiryPeriod?: string;
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
  receive: (poId: string, items: ReceiveItemInput[], proofImages?: string[]) => Promise<void>;
  quickAction?: (
    poId: string,
    action: 'reject' | 'cancel',
    reason: string,
    proofImages: string[],
  ) => Promise<void>;

  historyStatusClass?: (status: string) => string;
  renderHistoryDetails?: (record: ReceiptRecord) => React.ReactNode;
  headerActions?: React.ReactNode;
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
    quickAction,
    historyStatusClass,
    renderHistoryDetails,
    headerActions,
  } = config;

  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'accepted' | 'rejected'>('all');
  const [monthsFilter, setMonthsFilter] = useState<'all' | '1' | '3' | '6' | '12'>('all');
  const [selected, setSelected] = useState<PendingReceipt | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewRecord, setViewRecord] = useState<ReceiptRecord | null>(null);
  const [quickActionTarget, setQuickActionTarget] = useState<{
    po: PendingReceipt;
    action: 'reject' | 'cancel';
  } | null>(null);
  const [quickActionReason, setQuickActionReason] = useState('');
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [proofImageNames, setProofImageNames] = useState<string[]>([]);
  const pendingRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);

  // Stat cards toggle the outcome filter that drives the receiving history below;
  // clicking the active card (or Total Receipts) clears it back to "all".
  const toggleOutcome = (outcome: 'all' | 'accepted' | 'rejected') => {
    setOutcomeFilter((current) => (current === outcome ? 'all' : outcome));
    historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Pending QC has no history outcome — it jumps to the quality-check queue.
  const scrollToPending = () => {
    (pendingRef.current ?? historyRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const statCardClass = (active: boolean) =>
    `group text-left w-full bg-white rounded-[14px] p-4 border shadow-sm cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-[#007A5E]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007A5E]/40 active:translate-y-0 active:shadow-md ${
      active ? 'border-[#007A5E] bg-[#007A5E]/5 shadow-md' : 'border-[rgba(0,0,0,0.1)]'
    }`;

  const formatReceivedDateTime = (record: ReceiptRecord) => {
    const value = record.receivedAt || record.receivedDate;
    if (!value) return 'N/A';
    const date = parseDatabaseTimestamp(value);
    if (Number.isNaN(date.getTime())) return record.receivedDate || value;
    return formatManilaDateTime(value);
  };

  const stats = useMemo(
    () => ({
      pending: pending.length,
      received: history.length,
      fullyAccepted: history.filter((r) => r.totalRejected === 0 && !['rejected', 'cancelled'].includes(r.status.toLowerCase())).length,
      withRejections: history.filter((r) => r.totalRejected > 0 || ['rejected', 'cancelled'].includes(r.status.toLowerCase())).length,
    }),
    [pending, history],
  );

  const filteredHistory = history.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      r.orderNumber.toLowerCase().includes(q) ||
      (r.purchaseOrderNumber ?? '').toLowerCase().includes(q) ||
      r.supplier.toLowerCase().includes(q);

    const matchesOutcome =
      outcomeFilter === 'all'
        ? true
        : outcomeFilter === 'accepted'
          ? r.totalRejected === 0 && !['rejected', 'cancelled'].includes(r.status.toLowerCase())
          : r.totalRejected > 0 || ['rejected', 'cancelled'].includes(r.status.toLowerCase());

    let matchesMonths = true;
    if (monthsFilter !== 'all' && r.receivedAt) {
      const received = parseDatabaseTimestamp(r.receivedAt);
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

  const openQuickAction = (po: PendingReceipt, action: 'reject' | 'cancel') => {
    setError(null);
    setQuickActionTarget({ po, action });
    setQuickActionReason('');
    setProofImages([]);
    setProofImageNames([]);
  };

  const closeQuickAction = () => {
    setQuickActionTarget(null);
    setQuickActionReason('');
    setProofImages([]);
    setProofImageNames([]);
    setError(null);
  };

  const handleProofImages = async (files: FileList | null) => {
    if (!files) return;
    const selectedFiles = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, 6);
    const encoded = await Promise.all(
      selectedFiles.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ''));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          }),
      ),
    );
    setProofImages(encoded);
    setProofImageNames(selectedFiles.map((file) => file.name));
  };

  const handleQuickAction = async () => {
    if (!quickActionTarget || !quickAction || saving) return;
    const reason = quickActionReason.trim();
    if (!reason) {
      setError(`Enter a reason before ${quickActionTarget.action === 'reject' ? 'rejecting' : 'cancelling'} this delivery.`);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await quickAction(quickActionTarget.po.id, quickActionTarget.action, reason, proofImages);
      closeQuickAction();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update goods receipt');
    } finally {
      setSaving(false);
    }
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
      'w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary';
    return (
      <div key={field.key}>
        <label className="block text-[12px] font-medium text-foreground mb-2">{field.label}</label>
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
          <h2 className="text-[30px] font-bold text-foreground">{labels.title}</h2>
          <p className="text-foreground text-[14px] mt-1">{labels.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {headerActions}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground size-4" />
            <input
              type="text"
              placeholder="Search receipts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] w-[260px] text-[14px] focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {error && !selected && (
        <div className="mb-4 p-3 bg-[#ffe2e2] border border-[#E7000B] rounded-[8px] text-[14px] text-[#E7000B]">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <button
          type="button"
          onClick={scrollToPending}
          aria-label="Go to pending quality check queue"
          className={statCardClass(false)}
        >
          <p className="text-[#323B42] text-[12px] mb-1">Pending QC</p>
          <p className="text-[#FFA500] text-[24px] font-bold">{loading ? '—' : stats.pending}</p>
        </button>
        <button
          type="button"
          onClick={() => toggleOutcome('all')}
          aria-pressed={outcomeFilter === 'all'}
          aria-label="Show all receipts"
          className={statCardClass(outcomeFilter === 'all')}
        >
          <p className="text-[#323B42] text-[12px] mb-1">Total Receipts</p>
          <p className="text-[#323B42] text-[24px] font-bold">{loading ? '—' : stats.received}</p>
        </button>
        <button
          type="button"
          onClick={() => toggleOutcome('accepted')}
          aria-pressed={outcomeFilter === 'accepted'}
          aria-label="Filter by fully accepted"
          className={statCardClass(outcomeFilter === 'accepted')}
        >
          <p className="text-[#323B42] text-[12px] mb-1">Fully Accepted</p>
          <p className="text-[#008967] text-[24px] font-bold">{loading ? '—' : stats.fullyAccepted}</p>
        </button>
        <button
          type="button"
          onClick={() => toggleOutcome('rejected')}
          aria-pressed={outcomeFilter === 'rejected'}
          aria-label="Filter by with rejections"
          className={statCardClass(outcomeFilter === 'rejected')}
        >
          <p className="text-[#323B42] text-[12px] mb-1">With Rejections</p>
          <p className="text-[#E7000B] text-[24px] font-bold">{loading ? '—' : stats.withRejections}</p>
        </button>
      </div>

      {/* Pending Quality Check queue */}
        {pending.length > 0 && (
        <div ref={pendingRef} className="bg-card border border-[rgba(0,0,0,0.1)] rounded-[14px] p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <PackageCheck className="size-5 text-[#FFA500]" />
            <h3 className="text-[16px] font-semibold text-foreground">Pending Quality Check</h3>
            <span className="ml-1 text-[12px] bg-[#fff4e6] text-[#d08700] px-2 py-0.5 rounded-full font-medium">
              {pending.length}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground mb-4">
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
                    <h4 className="text-[15px] font-semibold text-foreground">{po.orderNumber}</h4>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        po.status === 'PARTIALLY_RECEIVED'
                          ? 'bg-[#fff4e6] text-[#d08700]'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {po.status === 'PARTIALLY_RECEIVED' ? 'Partially Received' : 'Approved'}
                    </span>
                  </div>
                  <p className="text-[13px] text-foreground">Supplier: {po.supplier || 'N/A'}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {po.items.length} item(s) • ₱{po.total.toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => openInspection(po)}
                  className="px-4 py-2 bg-primary text-white rounded-[8px] text-[13px] font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 flex-shrink-0"
                >
                  <ClipboardCheck className="size-4" />
                  Quality Check
                </button>
                {quickAction && (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => openQuickAction(po, 'reject')}
                      className="px-3 py-2 bg-[#ffe2e2] text-[#991B1B] border border-[#DC2626] rounded-[8px] text-[12px] font-semibold hover:bg-[#fecaca] transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircle className="size-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => openQuickAction(po, 'cancel')}
                      className="px-3 py-2 bg-muted text-foreground border border-border rounded-[8px] text-[12px] font-semibold hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receiving history + filters */}
      <div ref={historyRef} className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-[16px] font-semibold text-foreground">Receiving History</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[13px] text-muted-foreground">Outcome</label>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value as typeof outcomeFilter)}
            className="px-3 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[13px] bg-card focus:outline-none focus:border-primary"
          >
            <option value="all">All</option>
            <option value="accepted">Fully Accepted</option>
            <option value="rejected">With Rejections</option>
          </select>
          <label className="text-[13px] text-muted-foreground ml-1">Period</label>
          <select
            value={monthsFilter}
            onChange={(e) => setMonthsFilter(e.target.value as typeof monthsFilter)}
            className="px-3 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[13px] bg-card focus:outline-none focus:border-primary"
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
          <div className="bg-card border border-[rgba(0,0,0,0.1)] rounded-[14px] p-12 text-center">
            <p className="text-[14px] text-muted-foreground">Loading...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="bg-card border border-[rgba(0,0,0,0.1)] rounded-[14px] p-12 text-center">
            <PackageCheck className="size-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-[16px] text-foreground font-medium">No receipts found</p>
            <p className="text-[14px] text-muted-foreground mt-1">
              {history.length > 0
                ? 'No receipts match the current filters — try a different outcome or period.'
                : 'Complete a quality check to see received goods here'}
            </p>
          </div>
        ) : (
          filteredHistory.map((r) => (
            <div key={r.id} className="bg-card border border-[rgba(0,0,0,0.1)] rounded-[14px] p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-[18px] font-semibold text-foreground">{r.orderNumber}</h3>
                    <span
                      className={`px-3 py-1 rounded text-[12px] font-semibold ${
                        historyStatusClass?.(r.status) ?? 'bg-primary/10 text-primary'
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-[14px] text-foreground">
                    Supplier: <span className="font-medium">{r.supplier || 'N/A'}</span>
                  </p>
                  <p className="text-[14px] text-foreground">Date Received: {formatReceivedDateTime(r)}</p>
                  <p className="text-[14px] text-foreground">Received By: {r.receivedBy || 'N/A'}</p>
                  {r.actionReason && (
                    <p className="text-[14px] text-foreground">
                      Reason: <span className="font-medium">{r.actionReason}</span>
                    </p>
                  )}
                  {r.proofImages && r.proofImages.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.proofImages.map((src, index) => (
                        <a
                          key={`${r.id}-proof-${index}`}
                          href={src}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-14 w-14 overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-background"
                          title={`Open proof image ${index + 1}`}
                        >
                          <img src={src} alt={`Proof ${index + 1}`} className="h-full w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <div className="text-right">
                    <div className="bg-primary/10 rounded-[8px] px-4 py-2 mb-2">
                      <p className="text-[11px] text-foreground">Accepted</p>
                      <p className="text-[20px] font-bold text-primary">{r.totalAccepted}</p>
                    </div>
                    {r.totalRejected > 0 && (
                      <div className="bg-[#ffe2e2] rounded-[8px] px-4 py-2">
                        <p className="text-[11px] text-foreground">Rejected</p>
                        <p className="text-[20px] font-bold text-[#E7000B]">{r.totalRejected}</p>
                      </div>
                    )}
                  </div>
                  {renderHistoryDetails && (
                    <button
                      onClick={() => setViewRecord(r)}
                      className="p-2 hover:bg-primary/15 rounded-[8px] text-primary transition-colors"
                      title="View details"
                    >
                      <Eye className="size-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-[rgba(0,0,0,0.1)] pt-4">
                <p className="text-[14px] font-medium text-foreground mb-3">Items Inspection Results:</p>
                <div className="space-y-2">
                  {r.lines.map((line, idx) => (
                    <div key={idx} className="bg-background rounded-[8px] p-4 flex items-start justify-between">
                      <p className="text-[14px] font-medium text-foreground flex-1">{line.name}</p>
                      <div className="text-right">
                        <p className="text-[13px] text-foreground">
                          <span className="font-semibold text-primary">{line.acceptedQty}</span> accepted
                          {line.rejectedQty > 0 && (
                            <>
                              {' '}• <span className="font-semibold text-[#E7000B]">{line.rejectedQty}</span> rejected
                            </>
                          )}
                        </p>
                        <p className="text-[12px] text-muted-foreground">Ordered: {line.orderedQty}</p>
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
          <div className="bg-card rounded-[14px] p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[24px] font-bold text-foreground flex items-center gap-2">
                  <ClipboardCheck className="size-6 text-primary" />
                  Quality Check — {selected.orderNumber}
                </h3>
                <p className="text-[14px] text-foreground mt-1">Supplier: {selected.supplier || 'N/A'}</p>
              </div>
              <button onClick={closeInspection} className="p-2 hover:bg-background rounded">
                <X className="size-5 text-foreground" />
              </button>
            </div>

            <div className="mb-6 bg-primary/10 border border-primary rounded-[12px] p-4">
              <p className="text-[13px] text-foreground">
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
                    className="bg-background border border-[rgba(0,0,0,0.1)] rounded-[12px] p-5"
                  >
                    <div className="mb-4">
                      <h4 className="text-[16px] font-semibold text-foreground">{line.name}</h4>
                      <p className="text-[13px] text-foreground">
                        To receive: {line.orderedQty} units @ ₱{line.unitPrice} each
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-2">Accepted Qty *</label>
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          min="0"
                          max={line.orderedQty}
                          value={draft.acceptedQty}
                          onWheel={preventNumberWheel}
                          onChange={(e) =>
                            patchDraft(line.id, line, { acceptedQty: parseDecimalInput(e.target.value) })
                          }
                          className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-2">Rejected Qty</label>
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          min="0"
                          max={line.orderedQty - draft.acceptedQty}
                          value={draft.rejectedQty}
                          disabled={rejectedMode === 'auto-remainder'}
                          onWheel={preventNumberWheel}
                          onChange={(e) =>
                            patchDraft(line.id, line, { rejectedQty: parseDecimalInput(e.target.value) })
                          }
                          className={`w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                            rejectedMode === 'auto-remainder' ? 'bg-muted cursor-not-allowed' : ''
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
                className="flex-1 px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-foreground hover:bg-background transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-[8px] text-[14px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle className="size-4" />
                {saving ? 'Saving...' : 'Complete QC & Add Accepted Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick reject/cancel modal */}
      {quickActionTarget && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-[14px] p-6 max-w-xl w-full">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[22px] font-bold text-foreground">
                  {quickActionTarget.action === 'reject' ? 'Reject Goods Received' : 'Cancel Goods Received'}
                </h3>
                <p className="text-[14px] text-muted-foreground mt-1">
                  {quickActionTarget.po.orderNumber} • {quickActionTarget.po.supplier || 'N/A'}
                </p>
              </div>
              <button onClick={closeQuickAction} disabled={saving} className="p-2 hover:bg-background rounded">
                <X className="size-5 text-foreground" />
              </button>
            </div>

            <div className="mb-4 rounded-[10px] border border-[#facc15] bg-[#fef9c3] p-3 text-[13px] text-[#713f12]">
              This updates the whole delivery transaction without item-by-item checking. Accepted stock will not be added.
            </div>

            {error && (
              <div className="mb-4 p-3 bg-[#ffe2e2] border border-[#E7000B] rounded-[8px] text-[14px] text-[#E7000B]">
                {error}
              </div>
            )}

            <label className="block text-[12px] font-medium text-foreground mb-2">
              Reason / note *
            </label>
            <textarea
              value={quickActionReason}
              onChange={(event) => setQuickActionReason(event.target.value)}
              rows={4}
              placeholder={
                quickActionTarget.action === 'reject'
                  ? 'Example: damaged items, incorrect delivery, quality issue...'
                  : 'Example: supplier cancelled delivery, duplicate transaction...'
              }
              className="w-full resize-none rounded-[8px] border border-[rgba(0,0,0,0.1)] px-3 py-2 text-[14px] focus:outline-none focus:border-primary"
            />

            <label className="block text-[12px] font-medium text-foreground mt-4 mb-2">
              Proof images
            </label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-dashed border-border px-4 py-4 text-[13px] text-foreground hover:bg-background">
              <Upload className="size-4" />
              Upload image proof
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => void handleProofImages(event.target.files)}
              />
            </label>
            {proofImageNames.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {proofImageNames.map((name) => (
                  <span key={name} className="rounded-full bg-primary/10 px-3 py-1 text-[12px] text-primary">
                    {name}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={closeQuickAction}
                disabled={saving}
                className="flex-1 rounded-[8px] border border-[rgba(0,0,0,0.1)] px-4 py-2 text-[14px] font-medium text-foreground hover:bg-background disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleQuickAction}
                disabled={saving || !quickActionReason.trim()}
                className={`flex-1 rounded-[8px] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50 ${
                  quickActionTarget.action === 'reject'
                    ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                    : 'bg-[#374151] hover:bg-[#1F2937]'
                }`}
              >
                {saving
                  ? 'Saving...'
                  : quickActionTarget.action === 'reject'
                    ? 'Reject Delivery'
                    : 'Cancel Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History details modal (module-provided) */}
      {viewRecord && renderHistoryDetails && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-[14px] p-6 max-w-7xl w-[94vw] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[24px] font-bold text-foreground">
                  Goods Received — {viewRecord.orderNumber}
                </h3>
                <p className="mt-1 text-[14px] text-foreground">
                  PO Number: <span className="font-semibold">{viewRecord.purchaseOrderNumber || 'N/A'}</span>
                </p>
              </div>
              <button onClick={() => setViewRecord(null)} className="p-2 hover:bg-background rounded">
                <X className="size-5 text-foreground" />
              </button>
            </div>
            {renderHistoryDetails(viewRecord)}
          </div>
        </div>
      )}
    </div>
  );
}
