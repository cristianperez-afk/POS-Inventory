import {
  useReceiveRestaurantPurchaseOrderMutation,
  useRestaurantGoodsRecordsQuery,
  useRestaurantStorageTemperatureOptionsQuery,
} from '../lib/restaurant';
import { getStorageTemperatureOptions } from '../lib/inventoryLogic';
import type {
  LineDraft,
  NormalizedLine,
  PendingReceipt,
  ReceiptRecord,
  ResolvedReceivingConfig,
} from '../shared/receiving/GoodsReceived';

const INSPECTION_CRITERIA = [
  { key: 'appearance', label: 'Appearance & Freshness' },
  { key: 'quantity', label: 'Quantity Verification' },
  { key: 'temperature', label: 'Temperature Control' },
  { key: 'expiration', label: 'Expiration Dates' },
  { key: 'packaging', label: 'Packaging Integrity' },
] as const;

type ScoreEntry = { passed: string; total: string; remarks: string };

const defaultScores = (orderedQty: number): Record<string, ScoreEntry> =>
  INSPECTION_CRITERIA.reduce(
    (acc, c) => ({
      ...acc,
      [c.key]: { passed: String(orderedQty), total: String(orderedQty), remarks: '' },
    }),
    {} as Record<string, ScoreEntry>,
  );

// Maps the restaurant goods-records data onto the shared Goods Received contract.
export function useRestaurantReceivingConfig(): ResolvedReceivingConfig {
  const goodsQuery = useRestaurantGoodsRecordsQuery() as { data?: any[]; isLoading: boolean };
  const receiveMutation = useReceiveRestaurantPurchaseOrderMutation();
  const { data: storageTemperatureOptions = getStorageTemperatureOptions() } =
    useRestaurantStorageTemperatureOptionsQuery();

  const records = goodsQuery.data ?? [];
  const pendingRecords = records.filter((g) => g.status === 'pending');
  const receivedRecords = records.filter((g) => g.status !== 'pending');

  const pending: PendingReceipt[] = pendingRecords.map((g) => ({
    id: g.poId,
    orderNumber: g.id,
    supplier: g.supplier ?? '',
    status: 'APPROVED',
    total: g.totalValue ?? 0,
    items: (g.receivedItems ?? [])
      .filter((ri: any) => ri.backendItemId)
      .map((ri: any) => ({
        id: ri.backendItemId,
        name: ri.productName,
        orderedQty: ri.quantity,
        unitPrice: ri.unitPrice ?? 0,
        meta: { unit: ri.unit },
      })),
  }));

  // Keep the original record around so the details modal can show rich QC data.
  const receivedById = new Map<string, any>();
  const history: ReceiptRecord[] = receivedRecords.map((g) => {
    receivedById.set(g.id, g);
    const lines = (g.receivedItems ?? []).map((ri: any) => ({
      name: ri.productName,
      orderedQty: ri.quantity,
      acceptedQty: ri.acceptedQuantity ?? ri.quantity,
      rejectedQty: ri.rejectedQuantity ?? 0,
    }));
    return {
      id: g.id,
      orderNumber: g.id,
      supplier: g.supplier ?? '',
      receivedDate: g.receivedDate ?? '',
      receivedAt: g.receivedDate ?? undefined,
      receivedBy: g.receivedBy ?? '',
      status: g.status,
      totalAccepted: lines.reduce((s: number, l: { acceptedQty: number }) => s + l.acceptedQty, 0),
      totalRejected: lines.reduce((s: number, l: { rejectedQty: number }) => s + l.rejectedQty, 0),
      lines,
    };
  });

  return {
    labels: {
      title: 'Goods Received',
      subtitle: 'Inspect and verify incoming inventory shipments',
    },
    loading: goodsQuery.isLoading,

    pending,
    history,

    lineFields: [
      { key: 'expiryDate', type: 'date', label: 'Expiry date' },
      { key: 'storageTemperature', type: 'select', label: 'Storage temperature', options: ['', ...storageTemperatureOptions] },
      { key: 'remarks', type: 'textarea', label: 'Item remarks' },
    ],
    initLineFields: (line) => ({
      expiryDate: '',
      storageTemperature: '',
      remarks: '',
      scores: defaultScores(line.orderedQty),
    }),
    // The restaurant rejects everything not accepted (no back-orders).
    rejectedMode: 'auto-remainder',

    renderLineExtras: (line, draft, patch) => {
      const scores: Record<string, ScoreEntry> = draft.fields.scores ?? defaultScores(line.orderedQty);
      const setScore = (key: string, field: keyof ScoreEntry, value: string) =>
        patch({
          fields: {
            scores: { ...scores, [key]: { ...scores[key], [field]: value } },
          },
        });
      return (
        <div className="rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white p-3 mt-1">
          <p className="mb-3 text-[12px] font-semibold text-[#323B42]">Inspection criteria score</p>
          <div className="space-y-2">
            {INSPECTION_CRITERIA.map((c) => {
              const s = scores[c.key] ?? { passed: '', total: '', remarks: '' };
              return (
                <div key={c.key} className="grid grid-cols-[1.2fr_70px_16px_70px_1.4fr] items-center gap-2">
                  <p className="text-[12px] text-[#323B42]">{c.label}</p>
                  <input
                    type="number"
                    min="0"
                    value={s.passed}
                    onChange={(e) => setScore(c.key, 'passed', e.target.value)}
                    className="rounded-[6px] border border-[rgba(0,0,0,0.1)] px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#007A5E]"
                    aria-label={`${c.label} passed`}
                  />
                  <span className="text-center text-[12px] text-[#6b7280]">/</span>
                  <input
                    type="number"
                    min="1"
                    value={s.total}
                    onChange={(e) => setScore(c.key, 'total', e.target.value)}
                    className="rounded-[6px] border border-[rgba(0,0,0,0.1)] px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#007A5E]"
                    aria-label={`${c.label} total`}
                  />
                  <input
                    type="text"
                    value={s.remarks}
                    onChange={(e) => setScore(c.key, 'remarks', e.target.value)}
                    placeholder="Criterion remarks"
                    className="rounded-[6px] border border-[rgba(0,0,0,0.1)] px-2 py-1.5 text-[13px] focus:outline-none focus:border-[#007A5E]"
                  />
                </div>
              );
            })}
          </div>
        </div>
      );
    },

    validateLine: (line: NormalizedLine, draft: LineDraft) => {
      if (draft.acceptedQty <= 0) return null;
      if (!draft.fields.expiryDate) return `Please set an expiry date for ${line.name}`;
      if (!draft.fields.storageTemperature?.trim())
        return `Please set a storage temperature for ${line.name}`;
      const scores: Record<string, ScoreEntry> = draft.fields.scores ?? {};
      for (const c of INSPECTION_CRITERIA) {
        const s = scores[c.key];
        const passed = Number(s?.passed);
        const total = Number(s?.total);
        if (!s || !Number.isFinite(passed) || !Number.isFinite(total) || total <= 0 || passed < 0 || passed > total) {
          return `Please complete valid inspection scores for ${line.name}`;
        }
      }
      return null;
    },

    buildReceiveItem: (line, draft) => {
      const accepted = draft.acceptedQty;
      const rejected = draft.rejectedQty;
      const qualityStatus = accepted <= 0 ? 'rejected' : rejected > 0 ? 'partial' : 'accepted';
      const scores: Record<string, ScoreEntry> = draft.fields.scores ?? {};
      const qualityScores = INSPECTION_CRITERIA.reduce(
        (acc, c) => ({
          ...acc,
          [c.key]: {
            passed: Number(scores[c.key]?.passed) || 0,
            total: Number(scores[c.key]?.total) || line.orderedQty,
            remarks: scores[c.key]?.remarks || '',
          },
        }),
        {} as Record<string, { passed: number; total: number; remarks: string }>,
      );
      return {
        id: line.id,
        receivedQty: accepted,
        rejectedQty: rejected,
        condition: qualityStatus,
        notes: JSON.stringify({ remarks: draft.fields.remarks || undefined, qualityScores }),
        expiryDate:
          accepted > 0 && draft.fields.expiryDate
            ? new Date(`${draft.fields.expiryDate}T00:00:00`).toISOString()
            : undefined,
        storageTemperature: accepted > 0 ? draft.fields.storageTemperature || undefined : undefined,
      };
    },

    receive: async (poId, items) => {
      await receiveMutation.mutateAsync({ id: poId, items });
    },

    historyStatusClass: (status) =>
      status === 'verified'
        ? 'bg-[#E0F5F1] text-[#008967]'
        : status === 'partial'
          ? 'bg-[#fff4e6] text-[#d08700]'
          : 'bg-[#ffe2e2] text-[#E7000B]',

    renderHistoryDetails: (record) => {
      const g = receivedById.get(record.id);
      const items: any[] = g?.receivedItems ?? [];
      return (
        <div className="overflow-x-auto rounded-[10px] border border-[rgba(0,0,0,0.1)]">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F8FAFB] text-[#323B42]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Accepted</th>
                <th className="px-3 py-2 text-right font-medium">Rejected</th>
                <th className="px-3 py-2 text-left font-medium">Expiry</th>
                <th className="px-3 py-2 text-left font-medium">Storage Temp</th>
                <th className="px-3 py-2 text-left font-medium">QC Scores</th>
                <th className="px-3 py-2 text-left font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,0,0,0.08)]">
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-[#323B42]">{it.productName}</td>
                  <td className="px-3 py-2 text-right text-[#008967] font-medium">{it.acceptedQuantity ?? it.quantity}</td>
                  <td className="px-3 py-2 text-right text-[#E7000B]">{it.rejectedQuantity ?? 0}</td>
                  <td className="px-3 py-2 text-[#323B42]">{it.expiryDate || '—'}</td>
                  <td className="px-3 py-2 text-[#323B42]">{it.storageTemperature || '—'}</td>
                  <td className="px-3 py-2 text-[#323B42]">
                    {it.qualityScores
                      ? INSPECTION_CRITERIA.map((c) => {
                          const s = it.qualityScores[c.key];
                          return s ? `${c.label.split(' ')[0]} ${s.passed}/${s.total}` : null;
                        })
                          .filter(Boolean)
                          .join(' · ')
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-[#323B42]">{it.qualityRemarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    },
  };
}
