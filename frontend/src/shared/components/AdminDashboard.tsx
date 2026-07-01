import { useEffect, useState, type FormEvent } from 'react';
import { Sidebar } from './Sidebar';
import { Ban, CircleCheck, Eye, EyeOff, KeyRound, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import { Page, type StoreBrand } from '../App';
import type { AuthenticatedUser, StaffType } from '../../auth/types/auth';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { adminApi, type AdminStaffUser } from '../api/adminApi';

function getStaffTypeOptions(storeType?: string | null): Array<{ value: Exclude<StaffType, null>; label: string }> {
  const storeLabel = storeType === 'RESTAURANT' ? 'Restaurant' : 'Retail';

  return [
    { value: 'POS_STAFF', label: `${storeLabel} POS Staff` },
    { value: 'INVENTORY_STAFF', label: `${storeLabel} Inventory Staff` },
    ...(storeType === 'RESTAURANT' ? [{ value: 'KITCHEN_STAFF' as const, label: 'Kitchen Account' }] : []),
  ];
}

function getStaffTypeLabel(staffType: StaffType, storeType?: string | null) {
  return getStaffTypeOptions(storeType).find((option) => option.value === staffType)?.label ?? 'POS Staff';
}

type AccessRole = 'POS_MANAGER' | 'INVENTORY_MANAGER' | 'POS_STAFF' | 'INVENTORY_STAFF' | 'KITCHEN';

function getAccessRoleOptions(storeType?: string | null): Array<{ value: AccessRole; label: string }> {
  const storeLabel = storeType === 'RESTAURANT' ? 'Restaurant' : 'Retail';

  return [
    { value: 'POS_MANAGER', label: `${storeLabel} POS Manager` },
    { value: 'INVENTORY_MANAGER', label: `${storeLabel} Inventory Manager` },
    { value: 'POS_STAFF', label: `${storeLabel} POS Staff` },
    { value: 'INVENTORY_STAFF', label: `${storeLabel} Inventory Staff` },
    ...(storeType === 'RESTAURANT' ? [{ value: 'KITCHEN' as const, label: 'Kitchen Account' }] : []),
  ];
}

function getAccessRolePayload(accessRole: AccessRole) {
  if (accessRole === 'POS_MANAGER') return { role: 'POS_MANAGER', staff_type: 'POS_STAFF' };
  if (accessRole === 'INVENTORY_MANAGER') return { role: 'INVENTORY_MANAGER', staff_type: 'INVENTORY_STAFF' };
  if (accessRole === 'KITCHEN') return { role: 'KITCHEN', staff_type: 'KITCHEN_STAFF' };
  return { role: 'STAFF', staff_type: accessRole };
}

function getAccessRoleFromUser(user: StaffUser): AccessRole {
  if (user.role === 'KITCHEN' || user.staff_type === 'KITCHEN_STAFF') return 'KITCHEN';
  if (user.role === 'POS_MANAGER' || user.role === 'INVENTORY_MANAGER') return user.role;
  if (user.role === 'POS_ADMIN') return 'POS_MANAGER';
  if (user.role === 'INVENTORY_ADMIN') return 'INVENTORY_MANAGER';
  return user.staff_type ?? 'POS_STAFF';
}

function getAccessRoleLabel(user: StaffUser, storeType?: string | null) {
  return getAccessRoleOptions(storeType).find((option) => option.value === getAccessRoleFromUser(user))?.label ?? user.role;
}

type StaffUser = AdminStaffUser;

interface AdminDashboardProps {
  currentUser: AuthenticatedUser | null;
  storeBrand?: StoreBrand;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
}

export function AdminDashboard({ currentUser, storeBrand, onLogout, onNavigate }: AdminDashboardProps) {
  const canManageStaff = currentUser?.role === 'ADMIN';
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
  const accessRoleOptions = getAccessRoleOptions(currentUser?.store_type);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formVoidPin, setFormVoidPin] = useState('');
  const [formAccessRole, setFormAccessRole] = useState<AccessRole>('POS_STAFF');
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    const loadStaff = async () => {
      if (!currentUser?.id || !canManageStaff) {
        setLoading(false);
        return;
      }

      try {
        setUsers(await adminApi.listStaff());
        setError('');
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load staff accounts.');
      } finally {
        setLoading(false);
      }
    };

    void loadStaff();
  }, [canManageStaff, currentUser?.id]);

  const closeModal = () => {
    setShowModal(false);
    setShowPassword(false);
    setFormVoidPin('');
    setEditingUser(null);
  };

  useEffect(() => {
    if (!showModal) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const handleAddUser = () => {
    if (!canManageStaff) return;

    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormVoidPin('');
    setFormAccessRole('POS_STAFF');
    setShowPassword(false);
    setError('');
    setShowModal(true);
  };

  const handleEditUser = (user: StaffUser) => {
    if (!canManageStaff) return;

    setEditingUser(user);
    setFormName(user.full_name);
    setFormEmail(user.email);
    setFormPassword('');
    setFormVoidPin('');
    setFormAccessRole(getAccessRoleFromUser(user));
    setShowPassword(false);
    setError('');
    setShowModal(true);
  };

  // Same edit modal as handleEditUser, but reveals the password field by
  // default so the "reset password" action visibly differs from "edit" and
  // doesn't look like an inert duplicate icon.
  const handleResetPassword = (user: StaffUser) => {
    handleEditUser(user);
    setShowPassword(true);
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
      const accessRolePayload = getAccessRolePayload(formAccessRole);
      const data = editingUser
        ? await adminApi.updateStaff(editingUser.id, {
          full_name: formName,
          email: formEmail,
          password: formPassword || undefined,
          void_pin: formVoidPin || undefined,
          staff_type: accessRolePayload.staff_type,
          role: accessRolePayload.role,
        })
        : await adminApi.createStaff({
          full_name: formName,
          email: formEmail,
          password: formPassword || undefined,
          void_pin: formVoidPin || undefined,
          staff_type: accessRolePayload.staff_type,
          role: accessRolePayload.role,
        });

      setUsers((current) => editingUser ? current.map((user) => (user.id === data.id ? data : user)) : [...current, data]);
      setShowModal(false);
      setShowPassword(false);
      setFormVoidPin('');
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
      await adminApi.deactivateStaff(user.id);
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
      await adminApi.activateStaff(user.id);
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
      await adminApi.permanentlyDeleteStaff(user.id);
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
      <Sidebar currentPage="admin-dashboard" onNavigate={onNavigate} onLogout={onLogout} isAdmin={canManageStaff} storeBrand={storeBrand} userName={currentUser?.full_name} userRole={currentUser?.role} storeType={currentUser?.store_type} />

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
                      <td className="px-6 py-4">{getAccessRoleLabel(user, user.store_type ?? currentUser?.store_type)}</td>
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
                            onClick={() => handleResetPassword(user)}
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
                onClick={closeModal}
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
                <label className="block mb-2 font-medium">Role <span className="text-red-500">*</span></label>
                <select
                  value={formAccessRole}
                  onChange={(event) => setFormAccessRole(event.target.value as AccessRole)}
                  required
                  className="w-full rounded-lg border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {accessRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={closeModal}
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
