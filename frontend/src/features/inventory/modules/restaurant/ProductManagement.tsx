import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, Link2, Merge, PackageSearch, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../../app/hooks/useSession";
import { InlineDataLoading } from "../shared/InlineDataLoading";
import { defaultCategoryHierarchy, InventoryProduct } from "../lib/inventoryLogic";
import {
  useRestaurantCategoryHierarchyQuery,
  useRestaurantGlobalProductsQuery,
  useRestaurantInventoryQuery,
  useRestaurantLocationsQuery,
  useRestaurantSuppliersQuery,
  useUpdateRestaurantInventoryMutation,
  useRestaurantProductMergeMetadataQuery,
  useUpsertRestaurantProductMergeMetadataMutation,
} from "../lib/restaurant";

type RestaurantInventoryProduct = InventoryProduct & {
  backendId?: string;
  locationId?: string;
  condition?: string;
  purchaseUnit?: string;
  baseUnit?: string;
  conversionFactor?: number;
};

type GlobalProduct = {
  id: string;
  backendId?: string;
  inventoryId?: number;
  sku?: string;
  name: string;
  category?: string;
  subCategory?: string;
  unit?: string;
};

type Supplier = {
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  products: Array<{ name: string; price: number }>;
};

type ProductMergeMetadata = {
  aliases?: Record<string, string>;
  overrides?: Record<
    string,
    {
      name?: string;
      category?: string;
      subCategory?: string;
      unit?: string;
      sku?: string;
    }
  >;
  supplierPrices?: Record<string, Record<string, number>>;
};

type CatalogProduct = {
  key: string;
  sourceKeys: string[];
  name: string;
  category: string;
  subCategory: string;
  unit: string;
  purchaseUnit: string;
  baseUnit: string;
  conversionFactor: number;
  inventoryIds: number[];
  inventoryItems: RestaurantInventoryProduct[];
  globalIds: string[];
  stock: number;
  maxStock: number;
  minStock: number;
  reorderPoint: number;
  price: number;
  condition: string;
  locationId: string;
  supplierNames: string[];
};

const units = [
  "kg",
  "g",
  "pcs",
  "slices",
  "L",
  "ml",
  "liter",
  "milliliter",
  "bottle",
  "can",
  "pack",
  "box",
  "bag",
  "sack",
  "carton",
  "tray",
  "dozen",
  "gallon",
  "block",
  "loaf",
  "pouch",
  "tub",
];
const normalizeName = (value: string | undefined) => (value || '').trim().toLowerCase();

function splitCategory(value?: string) {
  const [category = "", subCategory = ""] = (value || "").split(" > ");
  return { category, subCategory };
}

function joinCategory(category: string, subCategory: string) {
  return subCategory ? `${category} > ${subCategory}` : category;
}

function getCanonicalKey(productName: string, metadata: ProductMergeMetadata) {
  const key = normalizeName(productName);
  return metadata.aliases?.[key] ?? key;
}

export function ProductManagement() {
  const { currentUser } = useSession();
  const isAdmin = currentUser?.role === "Admin";
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [mergeKey, setMergeKey] = useState<string>("");
  const productsQuery = useRestaurantInventoryQuery<RestaurantInventoryProduct[]>();
  const globalProductsQuery = useRestaurantGlobalProductsQuery();
  const suppliersQuery = useRestaurantSuppliersQuery();
  const categoryHierarchyQuery = useRestaurantCategoryHierarchyQuery();
  const locationsQuery = useRestaurantLocationsQuery();
  const productMetadataQuery = useRestaurantProductMergeMetadataQuery<ProductMergeMetadata>();
  const products = productsQuery.data ?? [];
  const globalProducts = (globalProductsQuery.data ?? []) as GlobalProduct[];
  const suppliers = (suppliersQuery.data ?? []) as Supplier[];
  const categoryHierarchy = categoryHierarchyQuery.data ?? defaultCategoryHierarchy;
  const locations = (locationsQuery.data ?? []) as { id: string; name: string }[];
  const productMetadata = productMetadataQuery.data ?? {};
  const catalogLoading = productsQuery.isLoading || globalProductsQuery.isLoading || suppliersQuery.isLoading
    || categoryHierarchyQuery.isLoading || locationsQuery.isLoading || productMetadataQuery.isLoading;
  const updateInventory = useUpdateRestaurantInventoryMutation();
  const saveMetadata = useUpsertRestaurantProductMergeMetadataMutation();
  const [form, setForm] = useState({
    name: "",
    category: "",
    subCategory: "",
    unit: "",
    baseUnit: "",
    conversionFactor: "1",
    maxStock: "0",
    minStock: "0",
    reorderPoint: "0",
    price: "0",
    condition: "Good",
    locationId: "",
  });
  const [supplierPrices, setSupplierPrices] = useState<Record<string, string>>({});

  const catalog = useMemo<CatalogProduct[]>(() => {
    const grouped = new Map<string, CatalogProduct>();

    products.forEach((product) => {
      const sourceKey = normalizeName(product.name);
      const key = getCanonicalKey(product.name, productMetadata);
      const override = productMetadata.overrides?.[key];
      const categoryParts = splitCategory(product.category);
      const category = override?.category ?? categoryParts.category;
      const subCategory = override?.subCategory ?? categoryParts.subCategory;
      const linkedGlobalIds = globalProducts
        .filter((globalProduct) =>
          globalProduct.backendId === product.backendId ||
          globalProduct.id === product.backendId ||
          globalProduct.inventoryId === product.id
        )
        .map((globalProduct) => globalProduct.id);
      const current = grouped.get(key) || {
        key,
        sourceKeys: [],
        name: override?.name ?? product.name,
        category,
        subCategory,
        unit: override?.unit ?? (product.baseUnit || product.unit || "pcs"),
        purchaseUnit: product.purchaseUnit || product.unit || product.baseUnit || "pcs",
        baseUnit: override?.unit ?? (product.baseUnit || product.unit || "pcs"),
        conversionFactor: Number(product.conversionFactor ?? 1),
        inventoryIds: [],
        inventoryItems: [],
        globalIds: linkedGlobalIds,
        stock: 0,
        maxStock: product.maxStock || 0,
        minStock: product.minStock ?? Math.ceil((product.maxStock || 0) * 0.25),
        reorderPoint: product.reorderPoint ?? Math.ceil((product.maxStock || 0) * 0.3),
        price: product.price ?? 0,
        condition: product.condition ?? "Good",
        locationId: product.locationId ?? "",
        supplierNames: Object.keys(productMetadata.supplierPrices?.[key] ?? {}),
      };
      if (!current.sourceKeys.includes(sourceKey)) current.sourceKeys.push(sourceKey);
      current.inventoryIds.push(product.id);
      current.inventoryItems.push(product);
      linkedGlobalIds.forEach((id) => {
        if (!current.globalIds.includes(id)) current.globalIds.push(id);
      });
      current.stock += product.stock || 0;
      current.maxStock = Math.max(current.maxStock, product.maxStock || 0);
      current.minStock = Math.min(current.minStock, product.minStock ?? current.minStock);
      current.reorderPoint = Math.max(current.reorderPoint, product.reorderPoint ?? 0);
      grouped.set(key, current);
    });

    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, globalProducts, productMetadata]);

  const selectedProduct = catalog.find((product) => product.key === selectedKey);
  const categoryOptions = Object.keys(categoryHierarchy);
  const subCategoryOptions = form.category ? categoryHierarchy[form.category] || [] : [];

  const filteredCatalog = catalog.filter((product) => {
    const query = searchQuery.toLowerCase();
    return (
      (product.name || '').toLowerCase().includes(query) ||
      (product.category || '').toLowerCase().includes(query) ||
      product.supplierNames.some((supplier) => (supplier || '').toLowerCase().includes(query))
    );
  });

  const openProduct = (product: CatalogProduct) => {
    setSelectedKey(product.key);
    setMergeKey("");
    setForm({
      name: product.name,
      category: product.category,
      subCategory: product.subCategory,
      unit: product.purchaseUnit || product.unit || "pcs",
      baseUnit: product.baseUnit || product.unit || "pcs",
      conversionFactor: String(product.conversionFactor || 1),
      maxStock: String(product.maxStock || 0),
      minStock: String(product.minStock || 0),
      reorderPoint: String(product.reorderPoint || 0),
      price: String(product.price || 0),
      condition: product.condition || "Good",
      locationId: product.locationId || "",
    });

    const savedPrices = productMetadata.supplierPrices?.[product.key] ?? {};
    const nextSupplierPrices: Record<string, string> = {};
    suppliers.forEach((supplier) => {
      if (savedPrices[supplier.name] !== undefined) {
        nextSupplierPrices[supplier.name] = String(savedPrices[supplier.name]);
      }
    });
    setSupplierPrices(nextSupplierPrices);
  };

  const saveProduct = async () => {
    const conversionFactor = Number(form.conversionFactor);
    if (!selectedProduct || !form.name.trim() || !form.category.trim() || !form.unit.trim() || !form.baseUnit.trim()) {
      toast.error("Product name, category, purchase unit, and base unit are required");
      return;
    }
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
      toast.error("Conversion factor must be greater than zero");
      return;
    }

    const next = {
      name: form.name.trim(),
      category: form.category,
      subCategory: form.subCategory,
      unit: form.unit,
      baseUnit: form.baseUnit,
      conversionFactor,
      fullCategory: joinCategory(form.category, form.subCategory),
      maxStock: Number(form.maxStock) || 0,
      minStock: Number(form.minStock) || 0,
      reorderPoint: Number(form.reorderPoint) || 0,
      price: Number(form.price) || 0,
      condition: form.condition,
      locationId: form.locationId,
    };
    const nextKey = normalizeName(next.name);
    const currentKey = selectedProduct.key;
    const supplierPriceValues = Object.fromEntries(
      Object.entries(supplierPrices)
        .filter(([, value]) => value !== "")
        .map(([name, value]) => [name, Number(value) || 0]),
    );

    const nextMetadata: ProductMergeMetadata = {
      ...productMetadata,
      aliases: { ...(productMetadata.aliases ?? {}) },
      overrides: { ...(productMetadata.overrides ?? {}) },
      supplierPrices: { ...(productMetadata.supplierPrices ?? {}) },
    };

    selectedProduct.sourceKeys.forEach((sourceKey) => {
      if (sourceKey !== nextKey) nextMetadata.aliases![sourceKey] = nextKey;
    });
    Object.entries(nextMetadata.aliases!).forEach(([source, canonical]) => {
      if (canonical === currentKey) nextMetadata.aliases![source] = nextKey;
    });
    if (currentKey !== nextKey) {
      delete nextMetadata.overrides![currentKey];
      delete nextMetadata.supplierPrices![currentKey];
      nextMetadata.aliases![currentKey] = nextKey;
    }
    nextMetadata.overrides![nextKey] = {
      name: next.name,
      category: next.category,
      subCategory: next.subCategory,
      unit: next.baseUnit,
    };
    nextMetadata.supplierPrices![nextKey] = supplierPriceValues;

    try {
      await Promise.all(
        selectedProduct.inventoryItems
          .filter((product) => product.backendId)
          .map((product) =>
            updateInventory.mutateAsync({
              id: product.backendId!,
              data: {
                name: next.name,
                category: next.fullCategory,
                unit: next.baseUnit,
                purchaseUnit: next.unit,
                baseUnit: next.baseUnit,
                conversionFactor: next.conversionFactor,
                maxStock: next.maxStock,
                minStock: next.minStock,
                reorderPoint: next.reorderPoint,
                price: next.price,
                condition: next.condition,
                locationId: next.locationId || undefined,
              },
            }),
          ),
      );
      await saveMetadata.mutateAsync(nextMetadata);
      setSelectedKey(nextKey);
      toast.success("Product master data saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save product");
    }
  };

  const mergeDuplicate = async () => {
    if (!selectedProduct || !mergeKey || mergeKey === selectedProduct.key) return;
    const duplicate = catalog.find((product) => product.key === mergeKey);
    if (!duplicate) return;

    const nextMetadata: ProductMergeMetadata = {
      ...productMetadata,
      aliases: { ...(productMetadata.aliases ?? {}) },
      overrides: { ...(productMetadata.overrides ?? {}) },
      supplierPrices: { ...(productMetadata.supplierPrices ?? {}) },
    };

    duplicate.sourceKeys.forEach((sourceKey) => {
      nextMetadata.aliases![sourceKey] = selectedProduct.key;
    });
    Object.entries(nextMetadata.aliases!).forEach(([source, canonical]) => {
      if (canonical === duplicate.key) nextMetadata.aliases![source] = selectedProduct.key;
    });
    nextMetadata.aliases![duplicate.key] = selectedProduct.key;
    delete nextMetadata.overrides![duplicate.key];
    nextMetadata.supplierPrices![selectedProduct.key] = {
      ...(nextMetadata.supplierPrices?.[duplicate.key] ?? {}),
      ...(nextMetadata.supplierPrices?.[selectedProduct.key] ?? {}),
    };
    delete nextMetadata.supplierPrices![duplicate.key];

    try {
      await saveMetadata.mutateAsync(nextMetadata);
      setMergeKey("");
      toast.success("Duplicate product merged");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to merge product");
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-center gap-3 text-red-800">
            <ShieldAlert className="h-6 w-6" />
            <h1 className="text-xl font-bold">Admin Access Required</h1>
          </div>
          <p className="mt-3 text-sm text-red-700">Product Management is restricted to admin users because changes affect linked PO and inventory records.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product Management</h1>
          <p className="text-sm text-muted-foreground">Admin maintenance for products that already passed receiving/QC and exist in inventory.</p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-5 w-5" />
          Changes affect received inventory records
        </div>
        <p className="mt-2 text-sm">Products still waiting for receiving or quality check are kept out of this list. Use this only to fix accepted inventory items, merge duplicates, assign suppliers, and set reorder levels.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">Product Master List</h2>
          </div>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search products, categories, suppliers..."
            className="mb-4 w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="max-h-[620px] space-y-2 overflow-y-auto">
            {!catalogLoading && filteredCatalog.map((product) => (
              <button
                key={product.key}
                type="button"
                onClick={() => openProduct(product)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedKey === product.key ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">{product.name}</p>
                  <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{product.stock} {product.unit}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{joinCategory(product.category, product.subCategory) || "Uncategorized"}</p>
                <p className="mt-1 text-xs text-muted-foreground">1 {product.purchaseUnit} = {product.conversionFactor} {product.baseUnit}</p>
                <p className="mt-1 text-xs text-muted-foreground">{product.supplierNames.length} supplier link{product.supplierNames.length === 1 ? "" : "s"}</p>
              </button>
            ))}
            {catalogLoading
              ? <InlineDataLoading label="Loading product records…" />
              : filteredCatalog.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No product records found</div>}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          {!selectedProduct ? (
            <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">Select a product to manage its master data</div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Boxes className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">{selectedProduct.name}</h2>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-foreground">Product Name</label>
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground">Purchase Unit</label>
                  <select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary">
                    {form.unit && !units.includes(form.unit) && <option value={form.unit}>{form.unit}</option>}
                    {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                  <p className="mt-1 text-[10px] text-muted-foreground">Unit used when ordering from suppliers, such as pack, sack, or bottle.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground">Base Unit</label>
                  <select value={form.baseUnit} onChange={(event) => setForm({ ...form, baseUnit: event.target.value })} className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary">
                    {form.baseUnit && !units.includes(form.baseUnit) && <option value={form.baseUnit}>{form.baseUnit}</option>}
                    {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                  <p className="mt-1 text-[10px] text-muted-foreground">Unit used for inventory stock, recipe deductions, and unit cost.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground">Conversion Factor</label>
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    value={form.conversionFactor}
                    onChange={(event) => setForm({ ...form, conversionFactor: event.target.value })}
                    className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    1 {form.unit || "purchase unit"} = {form.conversionFactor || "?"} {form.baseUnit || "base unit"}.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground">Category</label>
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value, subCategory: "" })} className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary">
                    <option value="">Select category</option>
                    {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground">Subcategory</label>
                  <select value={form.subCategory} onChange={(event) => setForm({ ...form, subCategory: event.target.value })} disabled={!form.category} className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50">
                    <option value="">Select subcategory</option>
                    {subCategoryOptions.map((subCategory) => <option key={subCategory} value={subCategory}>{subCategory}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground">Condition</label>
                  <select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })} className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary">
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground">Location</label>
                  <select value={form.locationId} onChange={(event) => setForm({ ...form, locationId: event.target.value })} className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary">
                    <option value="">— No location assigned —</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs text-foreground">Selling Price</label>
                  <input type="number" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground">Max Stock</label>
                  <input type="number" value={form.maxStock} onChange={(event) => setForm({ ...form, maxStock: event.target.value })} className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground">Minimum Stock</label>
                  <input type="number" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: event.target.value })} className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-foreground">Reorder Point</label>
                  <input type="number" value={form.reorderPoint} onChange={(event) => setForm({ ...form, reorderPoint: event.target.value })} className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-foreground">Supplier Relationships</h3>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {suppliers.map((supplier) => {
                    const linked = supplierPrices[supplier.name] !== undefined;
                    return (
                      <div key={supplier.name} className="rounded-lg border border-border p-3">
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={linked}
                            onChange={(event) => {
                              const next = { ...supplierPrices };
                              if (event.target.checked) next[supplier.name] = next[supplier.name] || "0";
                              else delete next[supplier.name];
                              setSupplierPrices(next);
                            }}
                          />
                          {supplier.name}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={supplierPrices[supplier.name] || ""}
                          disabled={!linked}
                          onChange={(event) => setSupplierPrices({ ...supplierPrices, [supplier.name]: event.target.value })}
                          placeholder="Supplier price"
                          className="mt-2 w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                        />
                      </div>
                    );
                  })}
                  {suppliers.length === 0 && <p className="text-sm text-muted-foreground">No suppliers registered yet.</p>}
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Merge className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-foreground">Merge Duplicate Product</h3>
                </div>
                <div className="flex gap-3">
                  <select value={mergeKey} onChange={(event) => setMergeKey(event.target.value)} className="flex-1 rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary">
                    <option value="">Select duplicate to merge into this product</option>
                    {catalog.filter((product) => product.key !== selectedProduct.key).map((product) => (
                      <option key={product.key} value={product.key}>{product.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={mergeDuplicate} disabled={!mergeKey || saveMetadata.isPending} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                    Merge
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={saveProduct} disabled={updateInventory.isPending || saveMetadata.isPending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
                  <Save className="h-4 w-4" />
                  Save Master Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
