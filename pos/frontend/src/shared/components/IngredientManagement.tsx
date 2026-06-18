import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Page, type StoreBrand } from '../App';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { getApiBaseUrl } from '../../auth/services/auth';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface IngredientManagementProps {
  currentUser: AuthenticatedUser | null;
  storeBrand?: StoreBrand;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
}

interface Ingredient {
  id: number;
  ingredient_name: string;
  unit: string;
  quantity_available: string | number;
  low_stock_limit: string | number;
  cost_per_unit: string | number;
  is_available: boolean;
}

interface IngredientAlternative {
  id: number;
  parent_ingredient_id: number;
  parent_ingredient_name: string;
  alternative_ingredient_id: number;
  alternative_ingredient_name: string;
  additional_price: string | number;
  is_available: boolean;
}

interface InventoryDeduction {
  id: number;
  order_number: string | null;
  order_item_name: string | null;
  ingredient_id: number | null;
  ingredient_name: string | null;
  deduction_type: string;
  quantity_deducted: string | number;
  unit: string | null;
  created_at: string;
}

export function IngredientManagement({ currentUser, storeBrand, onLogout, onNavigate }: IngredientManagementProps) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [alternatives, setAlternatives] = useState<IngredientAlternative[]>([]);
  const [deductions, setDeductions] = useState<InventoryDeduction[]>([]);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [editingAlternative, setEditingAlternative] = useState<IngredientAlternative | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [stock, setStock] = useState('');
  const [lowStockLimit, setLowStockLimit] = useState('0');
  const [costPerUnit, setCostPerUnit] = useState('0');
  const [isAvailable, setIsAvailable] = useState(true);
  const [parentIngredientId, setParentIngredientId] = useState('');
  const [alternativeIngredientId, setAlternativeIngredientId] = useState('');
  const [additionalPrice, setAdditionalPrice] = useState('0');
  const [alternativeAvailable, setAlternativeAvailable] = useState(true);
  const [message, setMessage] = useState('');
  const [deletingIngredient, setDeletingIngredient] = useState<Ingredient | null>(null);
  const [deletingAlternative, setDeletingAlternative] = useState<IngredientAlternative | null>(null);

  const load = async () => {
    if (!currentUser?.id) return;
    try {
      const [ingredientResponse, alternativeResponse, deductionResponse] = await Promise.all([
        fetch(`${getApiBaseUrl()}/admin/ingredients?admin_user_id=${currentUser.id}`),
        fetch(`${getApiBaseUrl()}/admin/ingredient-alternatives?admin_user_id=${currentUser.id}`),
        fetch(`${getApiBaseUrl()}/admin/inventory-deductions?admin_user_id=${currentUser.id}`),
      ]);

      const ingredientData = await ingredientResponse.json();
      const alternativeData = await alternativeResponse.json();
      const deductionData = await deductionResponse.json();

      if (!ingredientResponse.ok) {
        setMessage(ingredientData?.message ?? 'Unable to load ingredients.');
      }

      setIngredients(Array.isArray(ingredientData) ? ingredientData : []);
      setAlternatives(Array.isArray(alternativeData) ? alternativeData : []);
      setDeductions(Array.isArray(deductionData) ? deductionData.filter((deduction: InventoryDeduction) => deduction.ingredient_id) : []);
    } catch {
      setIngredients([]);
      setAlternatives([]);
      setDeductions([]);
      setMessage('Unable to load ingredient inventory. Please check if the backend server is running.');
    }
  };

  useEffect(() => {
    void load();
  }, [currentUser?.id]);

  const reset = () => {
    setEditing(null);
    setName('');
    setUnit('');
    setStock('');
    setLowStockLimit('0');
    setCostPerUnit('0');
    setIsAvailable(true);
  };

  const resetAlternative = () => {
    setEditingAlternative(null);
    setParentIngredientId('');
    setAlternativeIngredientId('');
    setAdditionalPrice('0');
    setAlternativeAvailable(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser?.id) return;

    const response = await fetch(`${getApiBaseUrl()}/admin/ingredients${editing ? `/${editing.id}` : ''}`, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_user_id: currentUser.id,
        ingredient_name: name,
        quantity_available: Number(stock),
        unit,
        low_stock_limit: Number(lowStockLimit),
        cost_per_unit: Number(costPerUnit),
        is_available: isAvailable,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data?.message ?? 'Unable to save ingredient.');
      return;
    }

    await load();
    reset();
    setMessage('Ingredient saved.');
  };

  const edit = (ingredient: Ingredient) => {
    setEditing(ingredient);
    setName(ingredient.ingredient_name);
    setUnit(ingredient.unit);
    setStock(String(ingredient.quantity_available ?? 0));
    setLowStockLimit(String(ingredient.low_stock_limit ?? 0));
    setCostPerUnit(String(ingredient.cost_per_unit ?? 0));
    setIsAvailable(ingredient.is_available);
  };

  const remove = async (ingredient: Ingredient) => {
    if (!currentUser?.id) return;
    await fetch(`${getApiBaseUrl()}/admin/ingredients/${ingredient.id}?admin_user_id=${currentUser.id}`, { method: 'DELETE' });
    await load();
    setDeletingIngredient(null);
  };

  const submitAlternative = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser?.id) return;

    if (parentIngredientId === alternativeIngredientId) {
      setMessage('Parent and alternative ingredient must be different.');
      return;
    }

    const response = await fetch(`${getApiBaseUrl()}/admin/ingredient-alternatives${editingAlternative ? `/${editingAlternative.id}` : ''}`, {
      method: editingAlternative ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_user_id: currentUser.id,
        parent_ingredient_id: Number(parentIngredientId),
        alternative_ingredient_id: Number(alternativeIngredientId),
        additional_price: Number(additionalPrice || 0),
        is_available: alternativeAvailable,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data?.message ?? 'Unable to save ingredient alternative.');
      return;
    }

    await load();
    resetAlternative();
    setMessage('Ingredient alternative saved.');
  };

  const editAlternative = (alternative: IngredientAlternative) => {
    setEditingAlternative(alternative);
    setParentIngredientId(String(alternative.parent_ingredient_id));
    setAlternativeIngredientId(String(alternative.alternative_ingredient_id));
    setAdditionalPrice(String(alternative.additional_price ?? 0));
    setAlternativeAvailable(alternative.is_available);
  };

  const removeAlternative = async (alternative: IngredientAlternative) => {
    if (!currentUser?.id) return;
    await fetch(`${getApiBaseUrl()}/admin/ingredient-alternatives/${alternative.id}?admin_user_id=${currentUser.id}`, { method: 'DELETE' });
    await load();
    setDeletingAlternative(null);
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPage="ingredient-management" onNavigate={onNavigate} onLogout={onLogout} isAdmin storeBrand={storeBrand} userName={currentUser?.full_name} storeType={currentUser?.store_type} />
      <div className="flex-1 overflow-auto bg-background">
        <main className="p-8">
          <div className="mb-6">
            <h1 className="text-primary mb-2">Ingredients</h1>
            <p className="text-muted-foreground">Create restaurant ingredient inventory before assigning ingredients to products.</p>
          </div>

          {message && <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">{message}</div>}

          <form onSubmit={submit} className="mb-6 grid gap-4 rounded-lg border border-border bg-card p-6 shadow-sm md:grid-cols-[1fr_140px_160px_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Ingredient name" className="rounded-lg border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
            <input value={unit} onChange={(event) => setUnit(event.target.value)} required placeholder="Unit" className="rounded-lg border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
            <input type="number" value={stock} onChange={(event) => setStock(event.target.value)} required placeholder="Stock" className="rounded-lg border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
            <button className="rounded-lg bg-primary px-5 py-2 text-primary-foreground hover:bg-primary/90">{editing ? 'Save' : 'Add'}</button>
            <label className="flex items-center gap-2 text-sm md:col-span-4">
              <input type="checkbox" checked={isAvailable} onChange={(event) => setIsAvailable(event.target.checked)} className="h-5 w-5 accent-primary" />
              Available for production
            </label>
          </form>

          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-4 text-left">Name</th>
                  <th className="px-6 py-4 text-left">Unit</th>
                  <th className="px-6 py-4 text-left">Stock</th>
                  <th className="px-6 py-4 text-left">Low Stock</th>
                  <th className="px-6 py-4 text-left">Status</th>
                  <th className="px-6 py-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ingredient) => (
                  <tr key={ingredient.id} className="border-t border-border">
                    <td className="px-6 py-4">{ingredient.ingredient_name}</td>
                    <td className="px-6 py-4">{ingredient.unit}</td>
                    <td className="px-6 py-4">{Number(ingredient.quantity_available).toLocaleString()}</td>
                    <td className="px-6 py-4">{Number(ingredient.low_stock_limit).toLocaleString()}</td>
                    <td className="px-6 py-4">{ingredient.is_available ? 'Available' : 'Unavailable'}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => edit(ingredient)} className="rounded-lg border border-border px-3 py-1.5 text-primary"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setDeletingIngredient(ingredient)} className="rounded-lg border border-destructive/20 px-3 py-1.5 text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8">
            <div className="mb-4">
              <h2 className="text-primary mb-2">Ingredient Deduction History</h2>
              <p className="text-muted-foreground">Recent order deductions from ingredient inventory.</p>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-4 text-left">Date</th>
                    <th className="px-6 py-4 text-left">Order</th>
                    <th className="px-6 py-4 text-left">Item</th>
                    <th className="px-6 py-4 text-left">Ingredient</th>
                    <th className="px-6 py-4 text-left">Qty Deducted</th>
                  </tr>
                </thead>
                <tbody>
                  {deductions.map((deduction) => (
                    <tr key={deduction.id} className="border-t border-border">
                      <td className="px-6 py-4">{new Date(deduction.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4">{deduction.order_number ?? '-'}</td>
                      <td className="px-6 py-4">{deduction.order_item_name ?? '-'}</td>
                      <td className="px-6 py-4">{deduction.ingredient_name ?? '-'}</td>
                      <td className="px-6 py-4">{Number(deduction.quantity_deducted).toLocaleString()} {deduction.unit ?? ''}</td>
                    </tr>
                  ))}
                  {deductions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-6 text-center text-sm text-muted-foreground">No ingredient deductions yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-4">
              <h2 className="text-primary mb-2">Ingredient Alternatives</h2>
              <p className="text-muted-foreground">Link replacement ingredients that POS staff can choose when inventory is available.</p>
            </div>

            <form onSubmit={submitAlternative} className="mb-6 grid gap-4 rounded-lg border border-border bg-card p-6 shadow-sm md:grid-cols-[1fr_1fr_160px_140px]">
              <select value={parentIngredientId} onChange={(event) => setParentIngredientId(event.target.value)} required className="rounded-lg border border-border bg-input-background px-4 py-2">
                <option value="">Original ingredient</option>
                {ingredients.map((ingredient) => (
                  <option key={ingredient.id} value={ingredient.id}>{ingredient.ingredient_name}</option>
                ))}
              </select>
              <select value={alternativeIngredientId} onChange={(event) => setAlternativeIngredientId(event.target.value)} required className="rounded-lg border border-border bg-input-background px-4 py-2">
                <option value="">Alternative ingredient</option>
                {ingredients
                  .filter((ingredient) => String(ingredient.id) !== parentIngredientId)
                  .map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.id}>{ingredient.ingredient_name}</option>
                  ))}
              </select>
              <input type="number" value={additionalPrice} onChange={(event) => setAdditionalPrice(event.target.value)} placeholder="Extra price" className="rounded-lg border border-border bg-input-background px-4 py-2" />
              <button className="rounded-lg bg-primary px-5 py-2 text-primary-foreground hover:bg-primary/90">{editingAlternative ? 'Save' : 'Add'}</button>
              <label className="flex items-center gap-2 text-sm md:col-span-4">
                <input type="checkbox" checked={alternativeAvailable} onChange={(event) => setAlternativeAvailable(event.target.checked)} className="h-5 w-5 accent-primary" />
                Show this alternative in POS when stock is available
              </label>
              {editingAlternative && (
                <button type="button" onClick={resetAlternative} className="rounded-lg border border-border px-5 py-2 md:col-span-4">Cancel alternative edit</button>
              )}
            </form>

            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-4 text-left">Original</th>
                    <th className="px-6 py-4 text-left">Alternative</th>
                    <th className="px-6 py-4 text-left">Extra Price</th>
                    <th className="px-6 py-4 text-left">Status</th>
                    <th className="px-6 py-4 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {alternatives.map((alternative) => (
                    <tr key={alternative.id} className="border-t border-border">
                      <td className="px-6 py-4">{alternative.parent_ingredient_name}</td>
                      <td className="px-6 py-4">{alternative.alternative_ingredient_name}</td>
                      <td className="px-6 py-4">PHP {Number(alternative.additional_price).toFixed(2)}</td>
                      <td className="px-6 py-4">{alternative.is_available ? 'Available' : 'Hidden'}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => editAlternative(alternative)} className="rounded-lg border border-border px-3 py-1.5 text-primary"><Pencil className="h-4 w-4" /></button>
                          <button type="button" onClick={() => setDeletingAlternative(alternative)} className="rounded-lg border border-destructive/20 px-3 py-1.5 text-destructive"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {alternatives.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-6 text-center text-sm text-muted-foreground">No alternatives configured yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
      <DeleteConfirmDialog
        isOpen={Boolean(deletingIngredient)}
        title="Confirm Delete"
        description={`Are you sure you want to delete ${deletingIngredient?.ingredient_name ?? 'this ingredient'}?`}
        onCancel={() => setDeletingIngredient(null)}
        onConfirm={() => {
          if (deletingIngredient) void remove(deletingIngredient);
        }}
      />
      <DeleteConfirmDialog
        isOpen={Boolean(deletingAlternative)}
        title="Confirm Delete"
        description={`Are you sure you want to delete ${deletingAlternative?.alternative_ingredient_name ?? 'this alternative'} as an alternative for ${deletingAlternative?.parent_ingredient_name ?? 'this ingredient'}?`}
        onCancel={() => setDeletingAlternative(null)}
        onConfirm={() => {
          if (deletingAlternative) void removeAlternative(deletingAlternative);
        }}
      />
    </div>
  );
}
