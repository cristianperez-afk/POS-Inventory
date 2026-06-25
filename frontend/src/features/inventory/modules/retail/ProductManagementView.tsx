import { useMemo, useState } from 'react';
import { Search, Save, PackageSearch, AlertTriangle, ShieldAlert, Boxes, Merge } from 'lucide-react';
import { toast } from 'sonner';
import { categorySubcategories, generalMerchandiseSubcategories } from '../../app/utils/constants';
import {
  useRetailInventoryRecordsQuery,
  useRetailLocationsQuery,
  useSaveRetailInventoryMutation,
  useRetailProductMergeMetadataQuery,
  useUpsertRetailProductMergeMetadataMutation,
} from '../lib/retail';

type ProductType = 'GENERAL' | 'THRIFT';

// Units a general-merchandise item is stocked in (a sack of rice, a case of cans, etc.)
const GENERAL_UNITS = ['pcs', 'box', 'case', 'pack', 'dozen', 'set', 'roll', 'sack', 'kg'];

// Thrift/apparel items are kept simple — "Size" only makes sense for clothing.
const isThriftCategory = (category: string) => category in categorySubcategories;

const categoryMapFor = (productType: ProductType) =>
  productType === 'THRIFT' ? categorySubcategories : generalMerchandiseSubcategories;

const conditionBadgeClass = (condition: string) => {
  const map: Record<string, string> = {
    Excellent: 'bg-secondary/10 text-secondary',
    Good: 'bg-secondary/10 text-secondary',
    Fair: 'bg-warning/10 text-warning',
    Damaged: 'bg-destructive/10 text-destructive',
  };
  return map[condition] ?? 'bg-muted text-muted-foreground';
};

const normalizeName = (value: string | undefined) => (value || '').trim().toLowerCase();

type RetailProductMergeMetadata = {
  aliases?: Record<string, string>;
};

type CatalogProduct = {
  key: string;
  sourceKeys: string[];
  name: string;
  sku: string;
  productType: ProductType;
  category: string;
  subcategory: string;
  targetCustomer: string;
  size: string;
  unit: string;
  condition: string;
  price: number;
  stock: number;
  maxStock: number;
  minStock: number;
  reorderPoint: number;
  locationNames: string[];
  rows: any[];
};

function getCanonicalKey(name: string, metadata: RetailProductMergeMetadata) {
  const key = normalizeName(name);
  return metadata.aliases?.[key] ?? key;
}

export default function ProductManagementView({
  currentUser,
}: {
  currentUser: { email: string; role: string } | null;
}) {
  const itemsQuery = useRetailInventoryRecordsQuery();
  const locationsQuery = useRetailLocationsQuery();
  const saveInventoryMutation = useSaveRetailInventoryMutation();
  const { data: mergeMetadata = {} } = useRetailProductMergeMetadataQuery<RetailProductMergeMetadata>();
  const saveMergeMetadata = useUpsertRetailProductMergeMetadataMutation();
  const items = itemsQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const loading = itemsQuery.isLoading || locationsQuery.isLoading;
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState('');
  const [mergeKey, setMergeKey] = useState('');
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const isAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'Manager';

  const locationNameById = useMemo(
    () => new Map(locations.map((loc: any) => [loc.id, loc.name])),
    [locations],
  );

  // Group inventory rows across locations into one catalog product per canonical name,
  // so "Rice 25kg" stocked at two branches is edited once instead of as two unrelated rows.
  const catalog = useMemo<CatalogProduct[]>(() => {
    const grouped = new Map<string, CatalogProduct>();

    items.forEach((item: any) => {
      const sourceKey = normalizeName(item.name);
      const key = getCanonicalKey(item.name, mergeMetadata);
      const locationName = locationNameById.get(item.locationId) ?? item.location?.name;
      const current: CatalogProduct = grouped.get(key) || {
        key,
        sourceKeys: [],
        name: item.name ?? '',
        sku: item.sku ?? '',
        productType: (isThriftCategory(item.category ?? '') ? 'THRIFT' : 'GENERAL') as ProductType,
        category: item.category ?? '',
        subcategory: item.subcategory ?? '',
        targetCustomer: item.targetCustomer ?? 'Unisex',
        size: item.size ?? '',
        unit: item.unit ?? 'pcs',
        condition: item.condition ?? 'Good',
        price: item.price ?? 0,
        stock: 0,
        maxStock: item.maxStock ?? 0,
        minStock: item.minStock ?? 0,
        reorderPoint: item.reorderPoint ?? 0,
        locationNames: [],
        rows: [],
      };
      if (!current.sourceKeys.includes(sourceKey)) current.sourceKeys.push(sourceKey);
      if (locationName && !current.locationNames.includes(locationName)) current.locationNames.push(locationName);
      current.rows.push(item);
      current.stock += item.quantity ?? 0;
      current.maxStock = Math.max(current.maxStock, item.maxStock ?? 0);
      current.minStock = Math.min(current.minStock, item.minStock ?? current.minStock);
      current.reorderPoint = Math.max(current.reorderPoint, item.reorderPoint ?? 0);
      grouped.set(key, current);
    });

    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, mergeMetadata, locationNameById]);

  const selectedProduct = catalog.find((product) => product.key === selectedKey);

  const openProduct = (product: CatalogProduct) => {
    setSelectedKey(product.key);
    setMergeKey('');
    setForm({
      name: product.name,
      sku: product.sku,
      productType: product.productType,
      category: product.category,
      subcategory: product.subcategory,
      targetCustomer: product.targetCustomer,
      size: product.size,
      unit: product.unit,
      condition: product.condition,
      price: product.price,
      minStock: product.minStock,
      maxStock: product.maxStock,
      reorderPoint: product.reorderPoint,
    });
  };

  const handleSave = async () => {
    if (!selectedProduct || !form.name.trim()) return;
    const isThrift = form.productType === 'THRIFT';
    const nextKey = normalizeName(form.name);
    const currentKey = selectedProduct.key;
    setSaving(true);
    try {
      await Promise.all(
        selectedProduct.rows.map((row) =>
          saveInventoryMutation.mutateAsync({
            id: row.id,
            data: {
              name: form.name.trim(),
              sku: form.sku?.trim() || undefined,
              category: form.category,
              subcategory: form.subcategory,
              targetCustomer: isThrift ? form.targetCustomer : undefined,
              size: isThrift ? form.size : undefined,
              unit: isThrift ? undefined : form.unit,
              condition: form.condition,
              price: Number(form.price),
              minStock: Number(form.minStock),
              maxStock: Number(form.maxStock),
              reorderPoint: Number(form.reorderPoint),
            },
          }),
        ),
      );

      if (currentKey !== nextKey) {
        const nextAliases = { ...(mergeMetadata.aliases ?? {}) };
        selectedProduct.sourceKeys.forEach((sourceKey) => {
          if (sourceKey !== nextKey) nextAliases[sourceKey] = nextKey;
        });
        Object.entries(nextAliases).forEach(([source, canonical]) => {
          if (canonical === currentKey) nextAliases[source] = nextKey;
        });
        nextAliases[currentKey] = nextKey;
        await saveMergeMetadata.mutateAsync({ ...mergeMetadata, aliases: nextAliases });
        setSelectedKey(nextKey);
      }
      toast.success('Item saved');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const mergeDuplicate = async () => {
    if (!selectedProduct || !mergeKey || mergeKey === selectedProduct.key) return;
    const duplicate = catalog.find((product) => product.key === mergeKey);
    if (!duplicate) return;

    const nextAliases = { ...(mergeMetadata.aliases ?? {}) };
    duplicate.sourceKeys.forEach((sourceKey) => {
      nextAliases[sourceKey] = selectedProduct.key;
    });
    Object.entries(nextAliases).forEach(([source, canonical]) => {
      if (canonical === duplicate.key) nextAliases[source] = selectedProduct.key;
    });
    nextAliases[duplicate.key] = selectedProduct.key;

    try {
      await saveMergeMetadata.mutateAsync({ ...mergeMetadata, aliases: nextAliases });
      setMergeKey('');
      toast.success('Duplicate product merged');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to merge product');
    }
  };

  const filteredCatalog = catalog.filter(product => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (product.name ?? '').toLowerCase().includes(q) || (product.sku ?? '').toLowerCase().includes(q);
    const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Catalog spans both apparel/thrift and general-merchandise taxonomies.
  const allCategories = [...Object.keys(categorySubcategories), ...Object.keys(generalMerchandiseSubcategories)];
  const isEditThrift = form.productType === 'THRIFT';
  const editCategoryOptions = Object.keys(categoryMapFor(form.productType));
  const subcategoryOptions = form.category ? (categoryMapFor(form.productType)[form.category] ?? []) : [];

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading product catalog…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl rounded-[12px] border border-destructive/30 bg-destructive/10 p-6">
        <div className="flex items-center gap-3 text-destructive mb-2">
          <ShieldAlert className="size-6" />
          <h2 className="text-[18px] font-bold">Admin Access Required</h2>
        </div>
        <p className="text-[13px] text-destructive">Product Management is restricted to Admin and Manager roles.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-[30px] font-bold text-foreground">Product Management</h2>
          <p className="text-[14px] text-muted-foreground mt-1">Edit item master data — name, category, pricing, and stock thresholds.</p>
        </div>
      </div>

      {/* Warning banner */}
      <div className="mb-4 rounded-[10px] border border-warning bg-warning/10 p-3 text-warning flex items-start gap-3">
        <AlertTriangle className="size-4 flex-shrink-0 mt-0.5" />
        <p className="text-[13px]">Changes here affect item master data only, and apply to this product at every location it's stocked in. Quantity changes should go through Purchase Orders, Goods Received, or Adjustments.</p>
      </div>

      {/* Split panel */}
      <div className="grid grid-cols-[320px_1fr] gap-4 flex-1 min-h-0">
        {/* Left: item list */}
        <div className="bg-card border border-border rounded-[14px] p-4 flex flex-col overflow-hidden">
          <div className="mb-3 flex items-center gap-2">
            <PackageSearch className="size-5 text-secondary" />
            <h3 className="font-semibold text-foreground text-[14px]">Product Catalog</h3>
            <span className="ml-auto text-[12px] text-muted-foreground">{filteredCatalog.length} products</span>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name or SKU…"
              className="w-full pl-9 pr-3 py-2 border border-border rounded-[8px] text-[13px] focus:outline-none focus:border-secondary"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="mb-3 w-full px-3 py-2 border border-border rounded-[8px] text-[13px] focus:outline-none focus:border-secondary"
          >
            <option value="all">All Categories</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex-1 overflow-y-auto space-y-1">
            {filteredCatalog.map(product => (
              <button
                key={product.key}
                type="button"
                onClick={() => openProduct(product)}
                className={`w-full text-left px-3 py-3 rounded-[8px] border transition-colors ${selectedKey === product.key ? 'border-secondary bg-secondary/10' : 'border-transparent hover:bg-muted'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium text-foreground truncate">{product.name}</p>
                  <span className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium ${conditionBadgeClass(product.condition ?? 'Good')}`}>
                    {product.condition ?? 'Good'}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground mt-0.5">{product.category}{product.subcategory ? ` › ${product.subcategory}` : ''}</p>
                <p className="text-[12px] text-muted-foreground">₱{Number(product.price).toLocaleString()} • qty: {product.stock}{product.locationNames.length > 1 ? ` across ${product.locationNames.length} locations` : ''}</p>
              </button>
            ))}
            {filteredCatalog.length === 0 && (
              <div className="py-8 text-center text-[13px] text-muted-foreground">No items found</div>
            )}
          </div>
        </div>

        {/* Right: edit panel */}
        <div className="bg-card border border-border rounded-[14px] p-6 overflow-y-auto">
          {!selectedProduct ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Boxes className="size-12 text-muted mx-auto mb-3" />
                <p className="text-[14px] text-muted-foreground">Select an item from the list to edit its master data</p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h3 className="text-[20px] font-bold text-foreground">{selectedProduct.name}</h3>
                <p className="text-[12px] text-muted-foreground">SKU: {selectedProduct.sku || '—'} • Current qty: {selectedProduct.stock}</p>
                <p className="text-[12px] text-muted-foreground">Stocked at: {selectedProduct.locationNames.join(', ') || '—'}</p>
              </div>

              {/* Basic fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[12px] font-medium text-foreground mb-1">Item Name *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-foreground mb-1">SKU</label>
                  <input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="Optional" className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[12px] font-medium text-foreground mb-1">Item Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { type: 'GENERAL' as ProductType, title: 'General Merchandise', desc: 'Sold by unit — sacks, boxes, kg, pcs' },
                      { type: 'THRIFT' as ProductType, title: 'Apparel / Thrift', desc: 'Clothing — has size & target customer' },
                    ]).map(({ type, title, desc }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm({ ...form, productType: type, category: '', subcategory: '' })}
                        className={`text-left px-3 py-2 rounded-[8px] border text-[12px] transition-colors ${
                          form.productType === type ? 'border-secondary bg-secondary/10' : 'border-border bg-card hover:bg-muted'
                        }`}
                      >
                        <p className="font-semibold text-foreground">{title}</p>
                        <p className="text-muted-foreground mt-0.5">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-foreground mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value, subcategory: '' })} className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary">
                    <option value="">Select category</option>
                    {editCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-foreground mb-1">Subcategory</label>
                  <select value={form.subcategory} onChange={e => setForm({ ...form, subcategory: e.target.value })} disabled={!form.category} className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary disabled:opacity-50">
                    <option value="">Select subcategory</option>
                    {subcategoryOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {isEditThrift ? (
                  <>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1">Target Customer</label>
                      <select value={form.targetCustomer} onChange={e => setForm({ ...form, targetCustomer: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary">
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Unisex">Unisex</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1">Size</label>
                      <input value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} placeholder="e.g., M, L, XL" className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary" />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-[12px] font-medium text-foreground mb-1">Unit of Measure</label>
                    <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary">
                      {GENERAL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-[12px] font-medium text-foreground mb-1">Condition</label>
                  <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary">
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>
              </div>

              {/* Pricing & Thresholds */}
              <div className="border-t border-border/50 pt-4">
                <h4 className="text-[13px] font-semibold text-foreground mb-3">Pricing & Stock Thresholds</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-medium text-foreground mb-1">Selling Price (₱)</label>
                    <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-foreground mb-1">Min Stock</label>
                    <input type="number" min="0" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-foreground mb-1">Max Stock</label>
                    <input type="number" min="0" value={form.maxStock} onChange={e => setForm({ ...form, maxStock: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-foreground mb-1">Reorder Point</label>
                    <input type="number" min="0" value={form.reorderPoint} onChange={e => setForm({ ...form, reorderPoint: e.target.value })} className="w-full px-3 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary" />
                  </div>
                </div>
              </div>

              {/* Merge duplicate */}
              <div className="border-t border-border/50 pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <Merge className="size-4 text-secondary" />
                  <h4 className="text-[13px] font-semibold text-foreground">Merge Duplicate Product</h4>
                </div>
                <div className="flex gap-3">
                  <select
                    value={mergeKey}
                    onChange={e => setMergeKey(e.target.value)}
                    className="flex-1 px-3 py-2 border border-border rounded-[8px] text-[13px] focus:outline-none focus:border-secondary"
                  >
                    <option value="">Select duplicate to merge into this product</option>
                    {catalog.filter(product => product.key !== selectedProduct.key).map(product => (
                      <option key={product.key} value={product.key}>{product.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={mergeDuplicate}
                    disabled={!mergeKey || saveMergeMetadata.isPending}
                    className="px-4 py-2 bg-warning text-white rounded-[8px] text-[13px] font-medium disabled:opacity-50"
                  >
                    Merge
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-secondary text-white rounded-[8px] text-[14px] font-medium hover:bg-secondary transition-colors disabled:opacity-60 flex items-center gap-2">
                  <Save className="size-4" />
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
