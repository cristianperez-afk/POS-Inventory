import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Page, type StoreBrand } from '../App';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface CategoryManagementProps {
  currentUser: AuthenticatedUser | null;
  storeBrand?: StoreBrand;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
}

interface Category {
  id: number;
  name: string;
  description: string | null;
  store_type: string;
}

export function CategoryManagement({ currentUser, storeBrand, onLogout, onNavigate }: CategoryManagementProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  const load = async () => {
    if (!currentUser?.id) return;
    const response = await fetch(`${getApiBaseUrl()}/admin/categories?admin_user_id=${currentUser.id}`);
    setCategories(await response.json());
  };

  useEffect(() => {
    void load();
  }, [currentUser?.id]);

  const reset = () => {
    setEditing(null);
    setName('');
    setDescription('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser?.id) return;

    const response = await fetch(`${getApiBaseUrl()}/admin/categories${editing ? `/${editing.id}` : ''}`, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_user_id: currentUser.id, name, description }),
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data?.message ?? 'Unable to save category.');
      return;
    }

    await load();
    reset();
    setMessage('Category saved.');
  };

  const remove = async (category: Category) => {
    if (!currentUser?.id) return;
    await fetch(`${getApiBaseUrl()}/admin/categories/${category.id}?admin_user_id=${currentUser.id}`, { method: 'DELETE' });
    await load();
    setDeletingCategory(null);
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPage="category-management" onNavigate={onNavigate} onLogout={onLogout} isAdmin storeBrand={storeBrand} userName={currentUser?.full_name} storeType={currentUser?.store_type} />
      <div className="flex-1 overflow-auto bg-background">
        <main className="p-8">
          <div className="mb-6">
            <h1 className="text-primary mb-2">Categories</h1>
            <p className="text-muted-foreground">Manage categories for the current {currentUser?.store_type === 'RESTAURANT' ? 'restaurant' : 'retail'} store.</p>
          </div>

          {message && <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">{message}</div>}

          <form onSubmit={submit} className="mb-6 grid gap-4 rounded-lg border border-border bg-card p-6 shadow-sm md:grid-cols-[1fr_2fr_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Category name" className="rounded-lg border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="rounded-lg border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
            <button className="rounded-lg bg-primary px-5 py-2 text-primary-foreground hover:bg-primary/90">{editing ? 'Save' : 'Add'}</button>
          </form>

          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-4 text-left">Name</th>
                  <th className="px-6 py-4 text-left">Description</th>
                  <th className="px-6 py-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-t border-border">
                    <td className="px-6 py-4">{category.name}</td>
                    <td className="px-6 py-4">{category.description}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setEditing(category); setName(category.name); setDescription(category.description ?? ''); }} className="rounded-lg border border-border px-3 py-1.5 text-primary"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setDeletingCategory(category)} className="rounded-lg border border-destructive/20 px-3 py-1.5 text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
      <DeleteConfirmDialog
        isOpen={Boolean(deletingCategory)}
        title="Confirm Delete"
        description={`Are you sure you want to delete ${deletingCategory?.name ?? 'this category'}?`}
        onCancel={() => setDeletingCategory(null)}
        onConfirm={() => {
          if (deletingCategory) void remove(deletingCategory);
        }}
      />
    </div>
  );
}
