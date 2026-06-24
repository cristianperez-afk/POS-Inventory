import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Settings, Trash2, X } from 'lucide-react';
import {
  useReceiveRestaurantPurchaseOrderMutation,
  useRestaurantGoodsRecordsQuery,
  useRestaurantSettings,
  useRestaurantStorageTemperatureOptionsQuery,
  useUpsertRestaurantSettingMutation,
} from '../lib/restaurant';
import { getStorageTemperatureOptions } from '../lib/inventoryLogic';
import type {
  LineDraft,
  NormalizedLine,
  PendingReceipt,
  ReceiptRecord,
  ResolvedReceivingConfig,
} from '../shared/receiving/GoodsReceived';

type QualityCriterion = { key: string; label: string };

const QUALITY_CRITERIA_STORAGE_KEY = 'restaurant-goods-received-quality-criteria';

const DEFAULT_INSPECTION_CRITERIA: QualityCriterion[] = [
  { key: 'appearance', label: 'Appearance & Freshness' },
  { key: 'quantity', label: 'Quantity Verification' },
  { key: 'temperature', label: 'Temperature Control' },
  { key: 'expiration', label: 'Expiration Dates' },
  { key: 'packaging', label: 'Packaging Integrity' },
] as const;

const EXPIRY_PERIOD_OPTIONS = [
  '',
  'Early Morning',
  'Morning',
  'Afternoon',
  'Evening',
  'Midnight',
];

type ScoreEntry = { passed: string; total: string; remarks: string };

const createCriterionKey = (label: string, existing: QualityCriterion[]) => {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'criterion';
  let key = base;
  let index = 2;
  while (existing.some((criterion) => criterion.key === key)) {
    key = `${base}-${index}`;
    index += 1;
  }
  return key;
};

const loadQualityCriteria = (): QualityCriterion[] => {
  if (typeof window === 'undefined') return DEFAULT_INSPECTION_CRITERIA;
  try {
    const stored = window.localStorage.getItem(QUALITY_CRITERIA_STORAGE_KEY);
    if (stored === null) return DEFAULT_INSPECTION_CRITERIA;
    const parsed = JSON.parse(stored) as QualityCriterion[];
    const clean = parsed
      .map((criterion) => ({
        key: String(criterion?.key ?? '').trim(),
        label: String(criterion?.label ?? '').trim(),
      }))
      .filter((criterion) => criterion.key && criterion.label);
    return clean;
  } catch {
    return DEFAULT_INSPECTION_CRITERIA;
  }
};

const normalizeQualityCriteria = (value: unknown): QualityCriterion[] | null => {
  if (!Array.isArray(value)) return null;
  return value
    .map((criterion) => ({
      key: String(criterion?.key ?? '').trim(),
      label: String(criterion?.label ?? '').trim(),
    }))
    .filter((criterion) => criterion.key && criterion.label);
};

const defaultScores = (orderedQty: number, criteria: QualityCriterion[]): Record<string, ScoreEntry> =>
  criteria.reduce(
    (acc, c) => ({
      ...acc,
      [c.key]: { passed: String(orderedQty), total: String(orderedQty), remarks: '' },
    }),
    {} as Record<string, ScoreEntry>,
  );

function CriteriaManager({
  criteria,
  onChange,
}: {
  criteria: QualityCriterion[];
  onChange: (criteria: QualityCriterion[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const resetDraft = () => {
    setDraftLabel('');
    setEditingKey(null);
  };

  const saveCriterion = () => {
    const label = draftLabel.trim();
    if (!label) return;

    if (editingKey) {
      onChange(criteria.map((criterion) => (criterion.key === editingKey ? { ...criterion, label } : criterion)));
    } else {
      onChange([...criteria, { key: createCriterionKey(label, criteria), label }]);
    }
    resetDraft();
  };

  const startEdit = (criterion: QualityCriterion) => {
    setEditingKey(criterion.key);
    setDraftLabel(criterion.label);
  };

  const removeCriterion = (key: string) => {
    onChange(criteria.filter((criterion) => criterion.key !== key));
    if (editingKey === key) resetDraft();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white px-3 py-2 text-[13px] font-medium text-[#323B42] hover:bg-[#F8FAFB]"
      >
        <Settings className="size-4 text-[#007A5E]" />
        Manage Criteria
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[14px] bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[22px] font-bold text-[#323B42]">Quality Criteria</h3>
                <p className="mt-1 text-[13px] text-[#6b7280]">Used for new Goods Received quality checks.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-2 hover:bg-[#F8FAFB]">
                <X className="size-5 text-[#323B42]" />
              </button>
            </div>

            <div className="mb-5 flex gap-2">
              <input
                type="text"
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
                placeholder="Criteria name"
                className="flex-1 rounded-[8px] border border-[rgba(0,0,0,0.1)] px-3 py-2 text-[14px] focus:border-[#007A5E] focus:outline-none"
              />
              <button
                type="button"
                onClick={saveCriterion}
                className="inline-flex items-center gap-2 rounded-[8px] bg-[#007A5E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#008967]"
              >
                <Plus className="size-4" />
                {editingKey ? 'Save' : 'Add'}
              </button>
            </div>

            <div className="space-y-2">
              {criteria.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.16)] p-5 text-center text-[14px] text-[#6b7280]">
                  No quality criteria yet.
                </div>
              ) : (
                criteria.map((criterion) => (
                  <div
                    key={criterion.key}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-[rgba(0,0,0,0.1)] p-3"
                  >
                    <p className="text-[14px] font-medium text-[#323B42]">{criterion.label}</p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(criterion)}
                        className="rounded p-2 text-[#007A5E] hover:bg-[#E0F5F1]"
                        aria-label={`Edit ${criterion.label}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCriterion(criterion.key)}
                        className="rounded p-2 text-[#E7000B] hover:bg-[#ffe2e2]"
                        aria-label={`Remove ${criterion.label}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Maps the restaurant goods-records data onto the shared Goods Received contract.
export function useRestaurantReceivingConfig(): ResolvedReceivingConfig {
  const goodsQuery = useRestaurantGoodsRecordsQuery() as { data?: any[]; isLoading: boolean };
  const receiveMutation = useReceiveRestaurantPurchaseOrderMutation();
  const settingsQuery = useRestaurantSettings();
  const saveSettingsMutation = useUpsertRestaurantSettingMutation();
  const { data: storageTemperatureOptions = getStorageTemperatureOptions() } =
    useRestaurantStorageTemperatureOptionsQuery();
  const [qualityCriteria, setQualityCriteria] = useState<QualityCriterion[]>(loadQualityCriteria);

  useEffect(() => {
    window.localStorage.setItem(QUALITY_CRITERIA_STORAGE_KEY, JSON.stringify(qualityCriteria));
  }, [qualityCriteria]);

  useEffect(() => {
    if (!settingsQuery.data) return;
    const settingValue = settingsQuery.data.find((setting) => setting.key === 'GOODS_RECEIVED_QUALITY_CRITERIA')?.value;
    const storedCriteria = normalizeQualityCriteria(settingValue);
    if (storedCriteria) {
      setQualityCriteria(storedCriteria);
    }
  }, [settingsQuery.data]);

  const handleQualityCriteriaChange = (nextCriteria: QualityCriterion[]) => {
    setQualityCriteria(nextCriteria);
    window.localStorage.setItem(QUALITY_CRITERIA_STORAGE_KEY, JSON.stringify(nextCriteria));
    saveSettingsMutation.mutate({
      key: 'GOODS_RECEIVED_QUALITY_CRITERIA',
      value: nextCriteria,
    });
  };

  const initialScores = useMemo(
    () => (orderedQty: number) => defaultScores(orderedQty, qualityCriteria),
    [qualityCriteria],
  );

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
      purchaseOrderNumber: g.poNumber ?? g.poId,
      supplier: g.supplier ?? '',
      receivedDate: g.receivedDate ?? '',
      receivedAt: g.receivedAt ?? g.receivedDate ?? undefined,
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
    headerActions: <CriteriaManager criteria={qualityCriteria} onChange={handleQualityCriteriaChange} />,

    pending,
    history,

    lineFields: [
      { key: 'expiryDate', type: 'date', label: 'Expiry date' },
      { key: 'expiryPeriod', type: 'select', label: 'Expiry period', options: EXPIRY_PERIOD_OPTIONS },
      { key: 'storageTemperature', type: 'select', label: 'Storage temperature', options: ['', ...storageTemperatureOptions] },
      { key: 'remarks', type: 'textarea', label: 'Item remarks' },
    ],
    initLineFields: (line) => ({
      expiryDate: '',
      expiryPeriod: '',
      storageTemperature: '',
      remarks: '',
      scores: initialScores(line.orderedQty),
    }),
    // The restaurant rejects everything not accepted (no back-orders).
    rejectedMode: 'auto-remainder',

    renderLineExtras: (line, draft, patch) => {
      const scores: Record<string, ScoreEntry> = {
        ...initialScores(line.orderedQty),
        ...(draft.fields.scores ?? {}),
      };
      const setScore = (key: string, field: keyof ScoreEntry, value: string) =>
        patch({
          fields: {
            scores: { ...scores, [key]: { ...scores[key], [field]: value } },
          },
        });
      return (
        <div className="rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white p-3 mt-1">
          <p className="mb-3 text-[12px] font-semibold text-[#323B42]">Inspection criteria score</p>
          {qualityCriteria.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[rgba(0,0,0,0.16)] p-3 text-[12px] text-[#6b7280]">
              No quality criteria configured.
            </div>
          ) : (
            <div className="space-y-2">
              {qualityCriteria.map((c) => {
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
          )}
        </div>
      );
    },

    validateLine: (line: NormalizedLine, draft: LineDraft) => {
      if (draft.acceptedQty <= 0) return null;
      if (!draft.fields.expiryDate) return `Please set an expiry date for ${line.name}`;
      if (!draft.fields.expiryPeriod?.trim()) return `Please set an expiry period for ${line.name}`;
      if (!draft.fields.storageTemperature?.trim())
        return `Please set a storage temperature for ${line.name}`;
      const scores: Record<string, ScoreEntry> = draft.fields.scores ?? {};
      for (const c of qualityCriteria) {
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
      const qualityScores = qualityCriteria.reduce(
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
        notes: JSON.stringify({
          remarks: draft.fields.remarks || undefined,
          expiryDate: draft.fields.expiryDate || undefined,
          expiryPeriod: draft.fields.expiryPeriod || undefined,
          storageTemperature: draft.fields.storageTemperature || undefined,
          qualityCriteria,
          qualityScores,
        }),
        expiryDate:
          accepted > 0 && draft.fields.expiryDate
            ? new Date(`${draft.fields.expiryDate}T00:00:00`).toISOString()
            : undefined,
        expiryPeriod: accepted > 0 ? draft.fields.expiryPeriod || undefined : undefined,
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
          <table className="min-w-[1120px] table-fixed text-[13px]">
            <colgroup>
              <col className="w-[110px]" />
              <col className="w-[120px]" />
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              <col className="w-[90px]" />
              <col className="w-[110px]" />
              <col className="w-[120px]" />
              <col className="w-[360px]" />
              <col className="w-[180px]" />
            </colgroup>
            <thead className="bg-[#F8FAFB] text-[#323B42]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Product</th>
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-right font-medium">Accepted</th>
                <th className="px-3 py-2 text-right font-medium">Rejected</th>
                <th className="px-3 py-2 text-left font-medium">Expiry</th>
                <th className="px-3 py-2 text-left font-medium">Expiry Period</th>
                <th className="px-3 py-2 text-left font-medium">Storage Temp</th>
                <th className="px-3 py-2 text-left font-medium">QC Scores</th>
                <th className="px-3 py-2 text-left font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,0,0,0.08)]">
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-[#323B42] break-words">{it.productName}</td>
                  <td className="px-3 py-2 text-[#323B42] break-words">{it.category || '—'}</td>
                  <td className="px-3 py-2 text-right text-[#008967] font-medium">{it.acceptedQuantity ?? it.quantity}</td>
                  <td className="px-3 py-2 text-right text-[#E7000B]">{it.rejectedQuantity ?? 0}</td>
                  <td className="px-3 py-2 text-[#323B42]">{it.expiryDate || '—'}</td>
                  <td className="px-3 py-2 text-[#323B42]">{it.expiryPeriod || '—'}</td>
                  <td className="px-3 py-2 text-[#323B42] break-words">{it.storageTemperature || '—'}</td>
                  <td className="px-3 py-2 text-[#323B42] align-top">
                    {it.qualityScores ? (
                      <div className={`grid gap-1.5 ${(it.qualityCriteria ?? qualityCriteria).length > 4 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {(it.qualityCriteria ?? qualityCriteria).map((c: QualityCriterion) => {
                          const s = it.qualityScores[c.key];
                          if (!s) return null;
                          return (
                            <div
                              key={c.key}
                              className="flex items-center justify-between gap-3 rounded-md border border-[rgba(0,0,0,0.08)] bg-[#F8FAFB] px-2 py-1"
                            >
                              <span className="min-w-0 text-[12px] text-[#323B42] break-words">{c.label}</span>
                              <span className="shrink-0 rounded-full bg-[#E0F5F1] px-2 py-0.5 text-[11px] font-semibold text-[#008967]">
                                {s.passed}/{s.total}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-[#323B42] align-top break-words">{it.qualityRemarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    },
  };
}
