import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Pencil, Trash2, Upload } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Page, type StoreBrand } from '../App';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface ProductManagementProps {
  currentUser: AuthenticatedUser | null;
  storeBrand?: StoreBrand;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
}

interface Category {
  id: number;
  name: string;
}

interface Product {
  id: number;
  category_id: number | null;
  category_name: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  material: string | null;
  price: string | number;
  image_url: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string | null;
  size: string | null;
  color: string | null;
  stock_quantity: number | null;
  low_stock_limit: number | null;
  is_available: boolean;
  available_quantity?: number | string;
  variants?: ProductVariant[];
}

interface Ingredient {
  id: number;
  ingredient_name: string;
  unit: string;
  quantity_available: number | string;
}

interface ProductIngredientForm {
  ingredient_id: string;
  quantity_required: string;
  is_required: boolean;
  is_removable: boolean;
}

interface ProductVariant {
  id?: number;
  size: string;
  color: string;
  sku: string;
  barcode: string;
  image_url: string;
  price: string | number;
  stock_quantity: string | number;
  low_stock_limit: string | number;
  is_active: boolean;
}

interface InventoryDeduction {
  id: number;
  order_number: string | null;
  order_item_name: string | null;
  product_id: number | null;
  product_name: string | null;
  deduction_type: string;
  quantity_deducted: string | number;
  unit: string | null;
  created_at: string;
}

const emptyProduct = {
  category_id: '',
  name: '',
  description: '',
  brand: '',
  material: '',
  price: '',
  image_url: '',
  unit: '',
  is_available: true,
};

const emptyVariant: ProductVariant = {
  size: '',
  color: '',
  sku: '',
  barcode: '',
  image_url: '',
  price: '',
  stock_quantity: '0',
  low_stock_limit: '5',
  is_active: true,
};

export function ProductManagement({ currentUser, storeBrand, onLogout, onNavigate }: ProductManagementProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [productIngredients, setProductIngredients] = useState<ProductIngredientForm[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([{ ...emptyVariant }]);
  const [deductions, setDeductions] = useState<InventoryDeduction[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyProduct);
  const [message, setMessage] = useState('');
  const [codeSeed, setCodeSeed] = useState(() => Date.now());
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deletingFormRow, setDeletingFormRow] = useState<{ type: 'variant' | 'ingredient'; index: number } | null>(null);
  const isRestaurant = currentUser?.store_type === 'RESTAURANT';
  const productImagePreview = String(form.image_url || storeBrand?.logo || '');

  const setField = (field: string, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const buildVariantCode = (index: number) => {
    return `${codeSeed}${String(index + 1).padStart(3, '0')}`;
  };

  const getProductCodes = (product: Product) => {
    const variantCodes = (product.variants ?? [])
      .flatMap((variant) => [variant.barcode, variant.sku])
      .filter((code): code is string => Boolean(code));

    return variantCodes.length
      ? variantCodes
      : [product.barcode, product.sku].filter((code): code is string => Boolean(code));
  };

  const handleProductImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage('Product image must be 2MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setField('image_url', String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleVariantImageUpload = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage('Variant image must be 2MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => updateVariantRow(index, { image_url: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const load = async () => {
    if (!currentUser?.id) return;
    try {
      const [categoryResponse, productResponse, deductionResponse] = await Promise.all([
        fetch(`${getApiBaseUrl()}/admin/categories?admin_user_id=${currentUser.id}`),
        fetch(`${getApiBaseUrl()}/admin/products?admin_user_id=${currentUser.id}`),
        fetch(`${getApiBaseUrl()}/admin/inventory-deductions?admin_user_id=${currentUser.id}`),
      ]);
      const categoryData = await categoryResponse.json();
      const productData = await productResponse.json();
      const deductionData = await deductionResponse.json();

      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setProducts(Array.isArray(productData) ? productData : []);
      setDeductions(Array.isArray(deductionData) ? deductionData.filter((deduction: InventoryDeduction) => deduction.product_id) : []);

      if (isRestaurant) {
        const ingredientResponse = await fetch(`${getApiBaseUrl()}/admin/ingredients?admin_user_id=${currentUser.id}`);
        const ingredientData = await ingredientResponse.json();
        setIngredients(Array.isArray(ingredientData) ? ingredientData : []);
      }
    } catch {
      setCategories([]);
      setProducts([]);
      setDeductions([]);
      setIngredients([]);
      setMessage('Unable to load products. Please check if the backend server is running.');
    }
  };

  useEffect(() => {
    void load();
  }, [currentUser?.id]);

  const reset = () => {
    setEditing(null);
    setForm(emptyProduct);
    setProductIngredients([]);
    setVariants([{ ...emptyVariant }]);
    setCodeSeed(Date.now());
  };

  const addIngredientRow = () => {
    setProductIngredients((current) => [
      ...current,
      { ingredient_id: '', quantity_required: '', is_required: true, is_removable: true },
    ]);
  };

  const updateIngredientRow = (index: number, updates: Partial<ProductIngredientForm>) => {
    setProductIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...updates } : row));
  };

  const removeIngredientRow = (index: number) => {
    setProductIngredients((current) => current.filter((_, rowIndex) => rowIndex !== index));
  };

  const addVariantRow = () => {
    setVariants((current) => [...current, { ...emptyVariant }]);
  };

  const updateVariantRow = (index: number, updates: Partial<ProductVariant>) => {
    setVariants((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...updates } : row));
  };

  const removeVariantRow = (index: number) => {
    setVariants((current) => current.length <= 1 ? current : current.filter((_, rowIndex) => rowIndex !== index));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser?.id) return;

    const cleanedVariants = variants
      .filter((variant) => variant.size || variant.color || variant.image_url || variant.price || variant.stock_quantity)
      .map((variant, index) => {
        const generatedCode = buildVariantCode(index);

        return {
        size: variant.size || null,
        color: variant.color || null,
        sku: generatedCode,
        barcode: generatedCode,
        image_url: variant.image_url || null,
        price: Number(variant.price || 0),
        stock_quantity: Number(variant.stock_quantity || 0),
        low_stock_limit: Number(variant.low_stock_limit || 5),
        is_active: variant.is_active,
        };
      });

    if (!isRestaurant && cleanedVariants.length === 0) {
      setMessage('Add at least one product variant for retail items.');
      return;
    }

    const body = {
      admin_user_id: currentUser.id,
      category_id: form.category_id ? Number(form.category_id) : null,
      name: form.name,
      description: form.description || null,
      brand: form.brand || null,
      material: form.material || null,
      price: isRestaurant ? Number(form.price) : Number(cleanedVariants[0]?.price ?? 0),
      image_url: form.image_url || null,
      unit: form.unit || null,
      stock_quantity: isRestaurant ? 0 : cleanedVariants.reduce((sum, variant) => sum + Number(variant.stock_quantity || 0), 0),
      low_stock_limit: 0,
      is_available: Boolean(form.is_available),
      variants: isRestaurant ? undefined : cleanedVariants,
      ingredients: isRestaurant
        ? productIngredients
            .filter((ingredient) => ingredient.ingredient_id && ingredient.quantity_required)
            .map((ingredient) => ({
              ingredient_id: Number(ingredient.ingredient_id),
              quantity_required: Number(ingredient.quantity_required),
              is_required: ingredient.is_required,
              is_removable: ingredient.is_removable,
            }))
        : undefined,
    };

    const response = await fetch(`${getApiBaseUrl()}/admin/products${editing ? `/${editing.id}` : ''}`, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data?.message ?? 'Unable to save product.');
      return;
    }

    await load();
    reset();
    setMessage('Product saved.');
  };

  const edit = async (product: Product) => {
    setEditing(product);
    setCodeSeed(Date.now());
    setForm({
      category_id: product.category_id ? String(product.category_id) : '',
      name: product.name,
      description: product.description ?? '',
      brand: product.brand ?? '',
      material: product.material ?? '',
      price: String(product.price ?? ''),
      image_url: product.image_url ?? '',
      unit: product.unit ?? '',
      is_available: product.is_available,
    });
    setVariants((product.variants?.length ? product.variants : [{ ...emptyVariant }]).map((variant) => ({
      id: variant.id,
      size: String(variant.size ?? ''),
      color: String(variant.color ?? ''),
      sku: String(variant.sku ?? ''),
      barcode: String(variant.barcode ?? ''),
      image_url: String(variant.image_url ?? ''),
      price: String(variant.price ?? ''),
      stock_quantity: String(variant.stock_quantity ?? 0),
      low_stock_limit: String(variant.low_stock_limit ?? 5),
      is_active: variant.is_active ?? true,
    })));

    if (currentUser?.id && isRestaurant) {
      const response = await fetch(`${getApiBaseUrl()}/admin/products/${product.id}/ingredients?admin_user_id=${currentUser.id}`);
      const rows = await response.json();
      setProductIngredients(rows.map((row: any) => ({
        ingredient_id: String(row.ingredient_id ?? ''),
        quantity_required: String(row.quantity_required ?? row.default_quantity ?? ''),
        is_required: row.is_required ?? true,
        is_removable: row.is_removable ?? true,
      })));
    }
  };

  const remove = async (product: Product) => {
    if (!currentUser?.id) return;
    await fetch(`${getApiBaseUrl()}/admin/products/${product.id}?admin_user_id=${currentUser.id}`, { method: 'DELETE' });
    await load();
    setDeletingProduct(null);
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPage="product-management" onNavigate={onNavigate} onLogout={onLogout} isAdmin storeBrand={storeBrand} userName={currentUser?.full_name} storeType={currentUser?.store_type} />
      <div className="flex-1 overflow-auto bg-background">
        <main className="p-8">
          <div className="mb-6">
            <h1 className="text-primary mb-2">Products</h1>
            <p className="text-muted-foreground">Add products for POS testing until the inventory API is integrated.</p>
          </div>

          {message && <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">{message}</div>}

          <form onSubmit={submit} className="mb-6 rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <input value={String(form.name)} onChange={(event) => setField('name', event.target.value)} required placeholder="Product name" className="rounded-lg border border-border bg-input-background px-4 py-2" />
              <select value={String(form.category_id)} onChange={(event) => setField('category_id', event.target.value)} className="rounded-lg border border-border bg-input-background px-4 py-2">
                <option value="">No category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              {isRestaurant ? (
                <input type="number" value={String(form.price)} onChange={(event) => setField('price', event.target.value)} required placeholder="Price" className="rounded-lg border border-border bg-input-background px-4 py-2" />
              ) : (
                <input value={String(form.brand)} onChange={(event) => setField('brand', event.target.value)} placeholder="Brand" className="rounded-lg border border-border bg-input-background px-4 py-2" />
              )}
              <input value={String(form.description)} onChange={(event) => setField('description', event.target.value)} placeholder="Description" className="rounded-lg border border-border bg-input-background px-4 py-2 md:col-span-2" />
              {!isRestaurant && (
                <input value={String(form.material)} onChange={(event) => setField('material', event.target.value)} placeholder="Material" className="rounded-lg border border-border bg-input-background px-4 py-2" />
              )}
              <div className="md:col-span-1">
                <div className="flex gap-3">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                    {productImagePreview ? (
                      <img src={productImagePreview} alt={String(form.name || 'Product')} className="h-full w-full object-cover" />
                    ) : (
                      <span className="px-2 text-center text-xs text-muted-foreground">No image</span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 text-center text-sm text-primary transition-colors hover:bg-muted/40">
                      <Upload className="h-4 w-4" />
                      Upload product image
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleProductImageUpload} className="hidden" />
                    </label>
                    {form.image_url && (
                      <button type="button" onClick={() => setField('image_url', '')} className="rounded-lg border border-border px-3 py-2 text-sm text-primary hover:bg-muted">
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {!isRestaurant && (
                <div className="rounded-lg border border-border p-4 md:col-span-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-medium">Product Variants</h2>
                      <p className="text-xs text-muted-foreground">Size, color, price, and stock are managed per variant.</p>
                    </div>
                    <button type="button" onClick={addVariantRow} className="rounded-lg border border-border px-3 py-1.5 text-sm text-primary">Add Variant</button>
                  </div>
                  <div className="space-y-3">
                    {variants.map((variant, index) => (
                      <div key={index} className="grid gap-3 md:grid-cols-[72px_90px_110px_1fr_120px_110px_110px_90px_80px_auto]">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                          {(variant.image_url || form.image_url || storeBrand?.logo) ? (
                            <img src={String(variant.image_url || form.image_url || storeBrand?.logo)} alt={`${String(form.name || 'Variant')} variant`} className="h-full w-full object-cover" />
                          ) : (
                            <Upload className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <input value={variant.size} onChange={(event) => updateVariantRow(index, { size: event.target.value })} placeholder="Size" className="rounded-lg border border-border bg-input-background px-3 py-2" />
                        <input value={variant.color} onChange={(event) => updateVariantRow(index, { color: event.target.value })} placeholder="Color" className="rounded-lg border border-border bg-input-background px-3 py-2" />
                        <div className="min-w-0 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                          <div className="truncate font-medium text-foreground" title={buildVariantCode(index)}>{buildVariantCode(index)}</div>
                          <div className="truncate text-muted-foreground" title="SKU and barcode use the same numeric code">Numeric SKU / Barcode</div>
                        </div>
                        <input type="number" value={variant.price} onChange={(event) => updateVariantRow(index, { price: event.target.value })} required placeholder="Price" className="rounded-lg border border-border bg-input-background px-3 py-2" />
                        <input type="number" value={variant.stock_quantity} onChange={(event) => updateVariantRow(index, { stock_quantity: event.target.value })} placeholder="Stock" className="rounded-lg border border-border bg-input-background px-3 py-2" />
                        <input type="number" value={variant.low_stock_limit} onChange={(event) => updateVariantRow(index, { low_stock_limit: event.target.value })} placeholder="Low stock" className="rounded-lg border border-border bg-input-background px-3 py-2" />
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={variant.is_active} onChange={(event) => updateVariantRow(index, { is_active: event.target.checked })} className="h-5 w-5 accent-primary" />
                          Active
                        </label>
                        <label className="cursor-pointer rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-primary hover:bg-muted">
                          Photo
                          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleVariantImageUpload(index, event)} className="hidden" />
                        </label>
                        <button type="button" onClick={() => setDeletingFormRow({ type: 'variant', index })} className="rounded-lg border border-destructive/20 px-3 py-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {isRestaurant && (
              <div className="mt-5 rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-medium">Required Ingredients</h2>
                    <p className="text-xs text-muted-foreground">Product availability is calculated from assigned ingredient stock.</p>
                  </div>
                  <button type="button" onClick={addIngredientRow} className="rounded-lg border border-border px-3 py-1.5 text-sm text-primary">Add Ingredient</button>
                </div>

                <div className="space-y-3">
                  {productIngredients.map((ingredient, index) => (
                    <div key={index} className="grid gap-3 md:grid-cols-[1fr_140px_120px_120px_auto]">
                      <select
                        value={ingredient.ingredient_id}
                        onChange={(event) => {
                          updateIngredientRow(index, { ingredient_id: event.target.value });
                        }}
                        className="rounded-lg border border-border bg-input-background px-4 py-2"
                      >
                        <option value="">Select ingredient</option>
                        {ingredients.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.ingredient_name} ({Number(item.quantity_available).toLocaleString()} {item.unit})
                          </option>
                        ))}
                      </select>
                      <input type="number" value={ingredient.quantity_required} onChange={(event) => updateIngredientRow(index, { quantity_required: event.target.value })} placeholder="Quantity" className="rounded-lg border border-border bg-input-background px-4 py-2" />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={ingredient.is_required} onChange={(event) => updateIngredientRow(index, { is_required: event.target.checked })} className="h-5 w-5 accent-primary" />
                        Required
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={ingredient.is_removable} onChange={(event) => updateIngredientRow(index, { is_removable: event.target.checked })} className="h-5 w-5 accent-primary" />
                        Removable
                      </label>
                      <button type="button" onClick={() => setDeletingFormRow({ type: 'ingredient', index })} className="rounded-lg border border-destructive/20 px-3 py-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  {productIngredients.length === 0 && (
                    <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">No ingredients assigned yet.</p>
                  )}
                </div>
              </div>
            )}

            <label className="mt-4 flex items-center gap-2">
              <input type="checkbox" checked={Boolean(form.is_available)} onChange={(event) => setField('is_available', event.target.checked)} className="h-5 w-5 accent-primary" />
              Available
            </label>

            <div className="mt-5 flex gap-3">
              <button className="rounded-lg bg-primary px-5 py-2 text-primary-foreground hover:bg-primary/90">{editing ? 'Save Product' : 'Add Product'}</button>
              {editing && <button type="button" onClick={reset} className="rounded-lg border border-border px-5 py-2">Cancel</button>}
            </div>
          </form>

          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-4 text-left">Name</th>
                  <th className="px-6 py-4 text-left">Category</th>
                  <th className="px-6 py-4 text-left">Price</th>
                  {!isRestaurant && <th className="px-6 py-4 text-left">SKU / Barcode</th>}
                  <th className="px-6 py-4 text-left">{isRestaurant ? 'Can Make' : 'Stock'}</th>
                  <th className="px-6 py-4 text-left">Status</th>
                  <th className="px-6 py-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-t border-border">
                    <td className="px-6 py-4">{product.name}</td>
                    <td className="px-6 py-4">{product.category_name ?? '-'}</td>
                    <td className="px-6 py-4">₱ {Number(product.price).toFixed(2)}</td>
                    {!isRestaurant && (
                      <td className="max-w-52 px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {getProductCodes(product).slice(0, 4).map((code) => (
                            <span key={code} title={code} className="max-w-24 truncate rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] leading-tight text-muted-foreground">
                              {code}
                            </span>
                          ))}
                          {getProductCodes(product).length > 4 && (
                            <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground">
                              +{getProductCodes(product).length - 4}
                            </span>
                          )}
                          {getProductCodes(product).length === 0 && <span className="text-xs text-muted-foreground">-</span>}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4">{isRestaurant ? Number(product.available_quantity ?? 0).toLocaleString() : Number(product.stock_quantity ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-4">{product.is_available ? 'Available' : 'Unavailable'}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => edit(product)} className="rounded-lg border border-border px-3 py-1.5 text-primary"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setDeletingProduct(product)} className="rounded-lg border border-destructive/20 px-3 py-1.5 text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isRestaurant && (
            <div className="mt-8">
              <div className="mb-4">
                <h2 className="text-primary mb-2">Product Stock Deduction History</h2>
                <p className="text-muted-foreground">Recent paid orders that deducted retail product stock.</p>
              </div>

              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-4 text-left">Date</th>
                      <th className="px-6 py-4 text-left">Order</th>
                      <th className="px-6 py-4 text-left">Product</th>
                      <th className="px-6 py-4 text-left">Qty Deducted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductions.map((deduction) => (
                      <tr key={deduction.id} className="border-t border-border">
                        <td className="px-6 py-4">{new Date(deduction.created_at).toLocaleString()}</td>
                        <td className="px-6 py-4">{deduction.order_number ?? '-'}</td>
                        <td className="px-6 py-4">{deduction.product_name ?? deduction.order_item_name ?? '-'}</td>
                        <td className="px-6 py-4">{Number(deduction.quantity_deducted).toLocaleString()} {deduction.unit ?? ''}</td>
                      </tr>
                    ))}
                    {deductions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-6 text-center text-sm text-muted-foreground">No product stock deductions yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
      <DeleteConfirmDialog
        isOpen={Boolean(deletingProduct)}
        title="Confirm Delete"
        description={`Are you sure you want to delete ${deletingProduct?.name ?? 'this product'}?`}
        onCancel={() => setDeletingProduct(null)}
        onConfirm={() => {
          if (deletingProduct) void remove(deletingProduct);
        }}
      />
      <DeleteConfirmDialog
        isOpen={Boolean(deletingFormRow)}
        title="Confirm Delete"
        description={`Are you sure you want to delete this ${deletingFormRow?.type ?? 'row'}?`}
        onCancel={() => setDeletingFormRow(null)}
        onConfirm={() => {
          if (!deletingFormRow) return;
          if (deletingFormRow.type === 'variant') {
            removeVariantRow(deletingFormRow.index);
          } else {
            removeIngredientRow(deletingFormRow.index);
          }
          setDeletingFormRow(null);
        }}
      />
    </div>
  );
}
