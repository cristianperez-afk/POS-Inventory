import { useEffect, useState } from 'react';
import { Archive, Edit, Plus, RotateCcw, X, Users, Building2 } from 'lucide-react';
import { toast } from 'sonner';

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
  isActive?: boolean;
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
  type?: 'text' | 'textarea' | 'select';
  placeholder?: string;
  // For `select` fields: the choices offered in the dropdown.
  options?: { value: string; label: string }[];
  // Optional helper text shown beneath the field.
  hint?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  suppliers: NormalizedSupplier[];
  archivedSuppliers?: NormalizedSupplier[];
  fields: SupplierFieldDef[];
  onCreate: (payload: SupplierCreatePayload) => Promise<void>;
  onUpdate?: (id: string, payload: SupplierCreatePayload) => Promise<void>;
  onArchive?: (id: string) => Promise<void>;
  onRestore?: (id: string) => Promise<void>;
  canManage?: boolean;
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
  archivedSuppliers = [],
  fields,
  onCreate,
  onUpdate,
  onArchive,
  onRestore,
  canManage = false,
  onSelectSupplier,
  selectLabel = 'Select',
}: Props) {
  const [mode, setMode] = useState<'list' | 'archived' | 'add' | 'edit'>('list');
  const [form, setForm] = useState<Record<string, string>>({});
  const [editingSupplier, setEditingSupplier] = useState<NormalizedSupplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setMode('list');
      setForm({});
      setEditingSupplier(null);
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
      if (f.key === 'name') return;
      if (mode === 'edit' || v) (payload as any)[f.key] = v ?? '';
    });
    try {
      setSaving(true);
      setError(null);
      if (mode === 'edit') {
        const supplierId = editingSupplier?.id;
        if (!supplierId || !onUpdate) throw new Error('Supplier cannot be edited from this view.');
        await onUpdate(supplierId, payload);
      } else {
        await onCreate(payload);
      }
      toast.success(mode === 'edit' ? `Supplier "${payload.name}" updated` : `Supplier "${payload.name}" added`);
      setForm({});
      setEditingSupplier(null);
      setMode('list');
    } catch (e: any) {
      const message = e?.message ?? `Failed to ${mode === 'edit' ? 'update' : 'create'} supplier`;
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (supplier: NormalizedSupplier) => {
    setEditingSupplier(supplier);
    setForm({
      name: supplier.name ?? '',
      contactPerson: supplier.contactPerson ?? '',
      email: supplier.email ?? '',
      phone: supplier.phone ?? '',
      address: supplier.address ?? '',
      category: supplier.category ?? '',
    });
    setError(null);
    setMode('edit');
  };

  const handleArchive = async (supplier: NormalizedSupplier) => {
    if (!supplier.id || !onArchive) return;
    const confirmed = window.confirm(`Archive supplier "${supplier.name}"? This will hide it from supplier lists and new purchase orders.`);
    if (!confirmed) return;
    try {
      setSaving(true);
      setError(null);
      await onArchive(supplier.id);
      toast.success(`Supplier "${supplier.name}" archived`);
      if (editingSupplier?.id === supplier.id) {
        setEditingSupplier(null);
        setForm({});
        setMode('list');
      }
    } catch (e: any) {
      const message = e?.message ?? 'Failed to archive supplier';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (supplier: NormalizedSupplier) => {
    if (!supplier.id || !onRestore) return;
    try {
      setSaving(true);
      setError(null);
      await onRestore(supplier.id);
      toast.success(`Supplier "${supplier.name}" restored`);
    } catch (e: any) {
      const message = e?.message ?? 'Failed to restore supplier';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[60]">
      <div className="bg-card rounded-[14px] p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Users className="size-6 text-primary" />
            <div>
              <h3 className="text-[22px] font-bold text-foreground">Suppliers Directory</h3>
              <p className="text-[13px] text-muted-foreground">{suppliers.length} registered</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-background rounded-[6px] transition-colors">
            <X className="size-5 text-foreground" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#ffe2e2] border border-[#E7000B] rounded-[8px] text-[14px] text-[#E7000B]">
            {error}
          </div>
        )}

        {mode === 'list' ? (
          <>
            <div className="flex flex-wrap justify-end gap-2 mb-4">
              {canManage && (
                <button
                  onClick={() => {
                    setError(null);
                    setMode('archived');
                  }}
                  className="px-4 py-2 bg-white border border-[rgba(0,0,0,0.1)] text-[#323B42] rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-[#F8FAFB]"
                >
                  <Archive className="size-4" />
                  Archived ({archivedSuppliers.length})
                </button>
              )}
              <button
                onClick={() => {
                  setForm({});
                  setError(null);
                  setMode('add');
                }}
                className="px-4 py-2 bg-primary text-white rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-primary/90"
              >
                <Plus className="size-4" /> Add Supplier
              </button>
            </div>

            {suppliers.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="size-14 text-muted-foreground mx-auto mb-3" />
                <p className="text-[14px] text-muted-foreground">No suppliers registered yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {suppliers.map((s, idx) => (
                  <div
                    key={s.id ?? idx}
                    className="bg-background border border-[rgba(0,0,0,0.1)] rounded-[12px] p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="size-9 bg-primary rounded-[8px] flex items-center justify-center text-white font-bold">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-[15px] font-semibold text-foreground">{s.name}</h4>
                          {s.category && (
                            <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                              {s.category}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {onSelectSupplier && (
                          <button
                            onClick={() => onSelectSupplier(s)}
                            className="px-3 py-1.5 bg-primary text-white rounded-[6px] text-[13px] font-medium hover:bg-primary/90"
                          >
                            {selectLabel}
                          </button>
                        )}
                        {canManage && onUpdate && (
                          <button
                            onClick={() => startEdit(s)}
                            disabled={saving}
                            className="px-3 py-1.5 bg-card border border-[rgba(0,0,0,0.1)] text-foreground rounded-[6px] text-[13px] font-medium hover:bg-background inline-flex items-center gap-1.5"
                          >
                            <Edit className="size-3.5" />
                            Edit
                          </button>
                        )}
                        {canManage && onArchive && s.id && (
                          <button
                            onClick={() => handleArchive(s)}
                            disabled={saving}
                            className="px-3 py-1.5 bg-[#fff7ed] border border-[#fed7aa] text-[#9a3412] rounded-[6px] text-[13px] font-medium hover:bg-[#ffedd5] inline-flex items-center gap-1.5 disabled:opacity-60"
                          >
                            <Archive className="size-3.5" />
                            Archive
                          </button>
                        )}
                      </div>
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
        ) : mode === 'archived' ? (
          <>
            <div className="flex justify-between items-center mb-4">
              <button
                onClick={() => {
                  setError(null);
                  setMode('list');
                }}
                disabled={saving}
                className="px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-[#323B42] hover:bg-[#F8FAFB] disabled:opacity-50"
              >
                Back
              </button>
              <p className="text-[13px] text-[#6b7280]">{archivedSuppliers.length} archived</p>
            </div>

            {archivedSuppliers.length === 0 ? (
              <div className="text-center py-12">
                <Archive className="size-14 text-[#d1d5dc] mx-auto mb-3" />
                <p className="text-[14px] text-[#6b7280]">No archived suppliers.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {archivedSuppliers.map((s, idx) => (
                  <div
                    key={s.id ?? idx}
                    className="bg-[#fff7ed] border border-[#fed7aa] rounded-[12px] p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3">
                        <div className="size-9 bg-[#9a3412] rounded-[8px] flex items-center justify-center text-white font-bold">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-[15px] font-semibold text-[#323B42]">{s.name}</h4>
                          <p className="text-[12px] text-[#9a3412]">Archived</p>
                        </div>
                      </div>
                      {canManage && onRestore && s.id && (
                        <button
                          onClick={() => handleRestore(s)}
                          disabled={saving}
                          className="px-3 py-1.5 bg-[#007A5E] text-white rounded-[6px] text-[13px] font-medium hover:bg-[#008967] inline-flex items-center gap-1.5 disabled:opacity-60"
                        >
                          <RotateCcw className="size-3.5" />
                          Restore
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      {s.contactPerson && <Field label="Contact Person" value={s.contactPerson} />}
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
            <div className="mb-4">
              <h4 className="text-[16px] font-semibold text-[#323B42]">
                {mode === 'edit' ? 'Edit Supplier' : 'Add Supplier'}
              </h4>
              {mode === 'edit' && editingSupplier && (
                <p className="text-[12px] text-[#6b7280]">Updating {editingSupplier.name}</p>
              )}
            </div>
            <div className="space-y-3">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-[12px] font-medium text-foreground mb-1">
                    {f.label} {f.required && <span className="text-[#E7000B]">*</span>}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={form[f.key] ?? ''}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      rows={2}
                      className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary resize-none"
                    />
                  ) : f.type === 'select' ? (
                    <select
                      value={form[f.key] ?? ''}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] bg-white focus:outline-none focus:border-primary"
                    >
                      <option value="">{f.placeholder ?? 'Select…'}</option>
                      {(f.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={form[f.key] ?? ''}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-primary"
                    />
                  )}
                  {f.hint && <p className="text-[11px] text-muted-foreground mt-1">{f.hint}</p>}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  setMode('list');
                  setEditingSupplier(null);
                  setForm({});
                  setError(null);
                }}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-foreground hover:bg-background disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-[8px] text-[14px] font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Add Supplier'}
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
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-[13px] font-medium text-foreground break-words">{value}</p>
    </div>
  );
}
