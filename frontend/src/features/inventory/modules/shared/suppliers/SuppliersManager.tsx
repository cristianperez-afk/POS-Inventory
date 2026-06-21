import { useEffect, useState } from 'react';
import { Plus, X, Users, Building2 } from 'lucide-react';

// A supplier in the shape the shared UI understands. Each module normalizes its
// own supplier records to this before passing them in.
export type NormalizedSupplier = {
  id?: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  category?: string;
};

export type SupplierCreatePayload = {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  category?: string;
};

export type SupplierFieldDef = {
  key: keyof SupplierCreatePayload;
  label: string;
  required?: boolean;
  type?: 'text' | 'textarea';
  placeholder?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  suppliers: NormalizedSupplier[];
  fields: SupplierFieldDef[];
  onCreate: (payload: SupplierCreatePayload) => Promise<void>;
  // When provided, each supplier row gets an action button (e.g. retail "Create PO").
  onSelectSupplier?: (supplier: NormalizedSupplier) => void;
  selectLabel?: string;
};

// Shared Suppliers directory + add-supplier form. Used by both the retail and
// restaurant Purchase Order screens, which only differ in data source and which
// fields are required.
export function SuppliersManager({
  open,
  onClose,
  suppliers,
  fields,
  onCreate,
  onSelectSupplier,
  selectLabel = 'Select',
}: Props) {
  const [mode, setMode] = useState<'list' | 'add'>('list');
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setMode('list');
      setForm({});
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    const missing = fields.filter((f) => f.required && !form[f.key]?.trim());
    if (missing.length > 0) {
      setError(`Please complete: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    const payload: SupplierCreatePayload = { name: (form.name ?? '').trim() };
    fields.forEach((f) => {
      const v = form[f.key]?.trim();
      if (v) (payload as any)[f.key] = v;
    });
    try {
      setSaving(true);
      setError(null);
      await onCreate(payload);
      setForm({});
      setMode('list');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create supplier');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[60]">
      <div className="bg-white rounded-[14px] p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Users className="size-6 text-[#007A5E]" />
            <div>
              <h3 className="text-[22px] font-bold text-[#323B42]">Suppliers Directory</h3>
              <p className="text-[13px] text-[#6b7280]">{suppliers.length} registered</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#F8FAFB] rounded-[6px] transition-colors">
            <X className="size-5 text-[#323B42]" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#ffe2e2] border border-[#E7000B] rounded-[8px] text-[14px] text-[#E7000B]">
            {error}
          </div>
        )}

        {mode === 'list' ? (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  setForm({});
                  setError(null);
                  setMode('add');
                }}
                className="px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-[#008967]"
              >
                <Plus className="size-4" /> Add Supplier
              </button>
            </div>

            {suppliers.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="size-14 text-[#d1d5dc] mx-auto mb-3" />
                <p className="text-[14px] text-[#6b7280]">No suppliers registered yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {suppliers.map((s, idx) => (
                  <div
                    key={s.id ?? idx}
                    className="bg-[#F8FAFB] border border-[rgba(0,0,0,0.1)] rounded-[12px] p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="size-9 bg-[#007A5E] rounded-[8px] flex items-center justify-center text-white font-bold">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-[15px] font-semibold text-[#323B42]">{s.name}</h4>
                          {s.category && (
                            <span className="text-[11px] bg-[#E0F5F1] text-[#008967] px-2 py-0.5 rounded font-medium">
                              {s.category}
                            </span>
                          )}
                        </div>
                      </div>
                      {onSelectSupplier && (
                        <button
                          onClick={() => onSelectSupplier(s)}
                          className="px-3 py-1.5 bg-[#007A5E] text-white rounded-[6px] text-[13px] font-medium hover:bg-[#008967]"
                        >
                          {selectLabel}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      {s.contactPerson && (
                        <Field label="Contact Person" value={s.contactPerson} />
                      )}
                      {s.phone && <Field label="Phone" value={s.phone} />}
                      {s.email && <Field label="Email" value={s.email} />}
                      {s.address && <Field label="Address" value={s.address} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-3">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-[12px] font-medium text-[#323B42] mb-1">
                    {f.label} {f.required && <span className="text-[#E7000B]">*</span>}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={form[f.key] ?? ''}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      rows={2}
                      className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] resize-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={form[f.key] ?? ''}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  setMode('list');
                  setError(null);
                }}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-[#323B42] hover:bg-[#F8FAFB] disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[14px] font-medium hover:bg-[#008967] disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Add Supplier'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[#6b7280] mb-0.5">{label}</p>
      <p className="text-[13px] font-medium text-[#323B42] break-words">{value}</p>
    </div>
  );
}
