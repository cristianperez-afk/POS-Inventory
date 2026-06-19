import { useEffect, useState, type FormEvent } from 'react';
import { Sidebar } from './Sidebar';
import { Ban, CircleCheck, Eye, EyeOff, KeyRound, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import { Page, type StoreBrand } from '../App';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser, StaffType } from '../../auth/types/auth';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

function getStaffTypeOptions(storeType?: string | null): Array<{ value: Exclude<StaffType, null>; label: string }> {
  const storeLabel = storeType === 'RESTAURANT' ? 'Restaurant' : 'Retail';

  return [
    { value: 'POS_STAFF', label: `${storeLabel} POS Staff` },
    { value: 'INVENTORY_STAFF', label: `${storeLabel} Inventory Staff` },
    { value: 'MANAGER', label: `${storeLabel} Manager` },
  ];
}

function getStaffTypeLabel(staffType: StaffType, storeType?: string | null) {
  return getStaffTypeOptions(storeType).find((option) => option.value === staffType)?.label ?? 'POS Staff';
}

interface StaffUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
  store_id: number | null;
  store_type: string | null;
  staff_type: StaffType;
  status?: string | null;
}

interface AdminDashboardProps {
  currentUser: AuthenticatedUser | null;
  storeBrand?: StoreBrand;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
}

export function AdminDashboard({ currentUser, storeBrand, onLogout, onNavigate }: AdminDashboardProps) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [statusActionUserId, setStatusActionUserId] = useState<number | null>(null);
  const [deleteActionUserId, setDeleteActionUserId] = useState<number | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<StaffUser | null>(null);
  const [activatingUser, setActivatingUser] = useState<StaffUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<StaffUser | null>(null);
  const staffTypeOptions = getStaffTypeOptions(currentUser?.store_type);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formStaffType, setFormStaffType] = useState<Exclude<StaffType, null>>('POS_STAFF');
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    const loadStaff = async () => {
      if (!currentUser?.id) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/staff?admin_user_id=${currentUser.id}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message ?? 'Unable to load staff accounts.');
        }

        setUsers(data);
        setError('');
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load staff accounts.');
      } finally {
        setLoading(false);
      }
    };

    void loadStaff();
  }, [currentUser?.id]);

  const handleAddUser = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormStaffType('POS_STAFF');
    setShowPassword(false);
    setError('');
    setShowModal(true);
  };

  const handleEditUser = (user: StaffUser) => {
    setEditingUser(user);
    setFormName(user.full_name);
    setFormEmail(user.email);
    setFormPassword('');
    setFormStaffType(user.staff_type ?? 'POS_STAFF');
    setShowPassword(false);
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentUser?.id) {
      setError('No admin session was found.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/staff${editingUser ? `/${editingUser.id}` : ''}`, {
        method: editingUser ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_user_id: currentUser.id,
          full_name: formName,
          email: formEmail,
          password: formPassword || undefined,
          staff_type: formStaffType,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? (editingUser ? 'Unable to update staff account.' : 'Unable to create staff account.'));
      }

      setUsers((current) => editingUser ? current.map((user) => (user.id === data.id ? data : user)) : [...current, data]);
      setShowModal(false);
      setShowPassword(false);
      setEditingUser(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to save staff account.');
    } finally {
      setSubmitting(false);
    }
  };

  const isStaffActive = (user: StaffUser) => (user.status ?? 'ACTIVE') === 'ACTIVE';
  const statusBadge = (user: StaffUser) =>
    isStaffActive(user)
      ? <span className="inline-flex rounded bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Active</span>
      : <span className="inline-flex rounded bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">Deactivated</span>;

  const handleDeactivateUser = async (user: StaffUser) => {
    if (!currentUser?.id) {
      return;
    }

    setStatusActionUserId(user.id);
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/staff/${user.id}?admin_user_id=${currentUser.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? 'Unable to deactivate staff account.');
      }

      setUsers((current) => current.map((staff) => (staff.id === user.id ? { ...staff, status: 'INACTIVE' } : staff)));
      setDeactivatingUser(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to deactivate staff account.');
    } finally {
      setStatusActionUserId(null);
    }
  };

  const handleActivateUser = async (user: StaffUser) => {
    if (!currentUser?.id) {
      return;
    }

    setStatusActionUserId(user.id);
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/staff/${user.id}/activate?admin_user_id=${currentUser.id}`, {
        method: 'PATCH',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? 'Unable to activate staff account.');
      }

      setUsers((current) => current.map((staff) => (staff.id === user.id ? { ...staff, status: 'ACTIVE' } : staff)));
      setActivatingUser(null);
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : 'Unable to activate staff account.');
    } finally {
      setStatusActionUserId(null);
    }
  };

  const handleDeleteUser = async (user: StaffUser) => {
    if (!currentUser?.id) {
      return;
    }

    setDeleteActionUserId(user.id);
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/staff/${user.id}/permanent?admin_user_id=${currentUser.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? 'Unable to delete staff account.');
      }

      setUsers((current) => current.filter((staff) => staff.id !== user.id));
      setDeletingUser(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete staff account.');
    } finally {
      setDeleteActionUserId(null);
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPage="admin-dashboard" onNavigate={onNavigate} onLogout={onLogout} isAdmin storeBrand={storeBrand} userName={currentUser?.full_name} storeType={currentUser?.store_type} />

      <div className="flex-1 overflow-auto bg-background">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-primary mb-2">User Management</h1>
              <p className="text-muted-foreground">Manage staff accounts for {currentUser?.store_name ?? 'this store'}</p>
            </div>
            <button
              onClick={handleAddUser}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors"
            >
              <UserPlus className="w-5 h-5" />
              Add Staff
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-4 text-left">User ID</th>
                  <th className="px-6 py-4 text-left">Full Name</th>
                  <th className="px-6 py-4 text-left">Email</th>
                  <th className="px-6 py-4 text-left">Role</th>
                  <th className="px-6 py-4 text-left">Staff Type</th>
                  <th className="px-6 py-4 text-left">Store ID</th>
                  <th className="px-6 py-4 text-left">Status</th>
                  <th className="px-6 py-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-muted-foreground">
                      Loading staff accounts...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-muted-foreground">
                      No staff accounts have been created for this store yet.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-t border-border hover:bg-muted/50">
                      <td className="px-6 py-4">{user.id}</td>
                      <td className="px-6 py-4">{user.full_name}</td>
                      <td className="px-6 py-4">{user.email}</td>
                      <td className="px-6 py-4">{user.role}</td>
                      <td className="px-6 py-4">{getStaffTypeLabel(user.staff_type, user.store_type ?? currentUser?.store_type)}</td>
                      <td className="px-6 py-4">{user.store_id}</td>
                      <td className="px-6 py-4">{statusBadge(user)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleEditUser(user)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#64748b] transition-colors hover:bg-slate-100 hover:text-[#007a5e]"
                            title="Edit staff"
                            aria-label={`Edit ${user.full_name}`}
                          >
                            <Pencil className="h-5 w-5" strokeWidth={1.9} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditUser(user)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#64748b] transition-colors hover:bg-slate-100 hover:text-[#007a5e]"
                            title="Reset password"
                            aria-label={`Reset password for ${user.full_name}`}
                          >
                            <KeyRound className="h-5 w-5" strokeWidth={1.9} />
                          </button>
                          {isStaffActive(user) ? (
                            <button
                              type="button"
                              onClick={() => setDeactivatingUser(user)}
                              disabled={statusActionUserId === user.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#64748b] transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                              title="Deactivate staff"
                              aria-label={`Deactivate ${user.full_name}`}
                            >
                              <Ban className="h-5 w-5" strokeWidth={1.9} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setActivatingUser(user)}
                              disabled={statusActionUserId === user.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-60"
                              title="Activate account"
                              aria-label={`Activate ${user.full_name}`}
                            >
                              <CircleCheck className="h-5 w-5" strokeWidth={1.9} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeletingUser(user)}
                            disabled={deleteActionUserId === user.id}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#64748b] transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                            title="Delete staff"
                            aria-label={`Delete ${user.full_name}`}
                          >
                            <Trash2 className="h-5 w-5" strokeWidth={1.9} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-primary">{editingUser ? 'Edit Staff Account' : 'Add Staff Account'}</h3>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setShowPassword(false);
                  setEditingUser(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block mb-2 font-medium">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  required
                  placeholder="Enter full name"
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                />
              </div>
              <div>
                <label className="block mb-2 font-medium">Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(event) => setFormEmail(event.target.value)}
                  required
                  placeholder="staff@example.com"
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-input-background"
                />
              </div>
              <div>
                <label className="block mb-2 font-medium">Password {!editingUser && <span className="text-red-500">*</span>}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formPassword}
                    onChange={(event) => setFormPassword(event.target.value)}
                    required={!editingUser}
                    placeholder={editingUser ? 'Leave blank to keep current password' : 'Enter password'}
                    className="w-full rounded-lg border border-border bg-input-background px-4 py-2 pr-12 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block mb-2 font-medium">Staff Type <span className="text-red-500">*</span></label>
                <select
                  value={formStaffType}
                  onChange={(event) => setFormStaffType(event.target.value as Exclude<StaffType, null>)}
                  required
                  className="w-full rounded-lg border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {staffTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setShowPassword(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : editingUser ? 'Save Changes' : 'Create Staff'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
      <DeleteConfirmDialog
        isOpen={Boolean(deactivatingUser)}
        title="Confirm Deactivation"
        description={`Are you sure you want to deactivate ${deactivatingUser?.full_name ?? 'this staff account'}? They will no longer be able to log in.`}
        onCancel={() => setDeactivatingUser(null)}
        onConfirm={() => {
          if (deactivatingUser) void handleDeactivateUser(deactivatingUser);
        }}
      />
      <DeleteConfirmDialog
        isOpen={Boolean(activatingUser)}
        title="Confirm Reactivation"
        description={`Are you sure you want to reactivate ${activatingUser?.full_name ?? 'this staff account'}? They will be able to log in again.`}
        onCancel={() => setActivatingUser(null)}
        onConfirm={() => {
          if (activatingUser) void handleActivateUser(activatingUser);
        }}
      />
      <DeleteConfirmDialog
        isOpen={Boolean(deletingUser)}
        title="Confirm Delete"
        description={`Are you sure you want to permanently delete ${deletingUser?.full_name ?? 'this staff account'}? This action cannot be undone.`}
        onCancel={() => setDeletingUser(null)}
        onConfirm={() => {
          if (deletingUser) void handleDeleteUser(deletingUser);
        }}
      />
    </div>
  );
}
