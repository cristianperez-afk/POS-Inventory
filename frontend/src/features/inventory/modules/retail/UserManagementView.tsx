import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Search, ChevronRight, ChevronDown, Folder, FolderOpen, AlertTriangle, Package, PackagePlus, ShoppingCart, PackageCheck, Layers, X, Eye, TrendingUp, TrendingDown, RefreshCw, CheckCircle, Users } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type {
  InventoryItem,
  PurchaseOrder,
  ProductReceived,
  Bundle,
  Transfer,
  Adjustment,
  Location,
} from '../../app/utils/generateSampleData';
import type { User } from '../../models/domain';
import { categorySubcategories, CHART_COLORS } from '../../app/utils/constants';
import { autoSortItem } from '../../app/utils/autoSortingRules';
import {
  useCreateRetailUserMutation,
  useDeleteRetailUserMutation,
  useRetailUsersQuery,
  useUpdateRetailUserMutation,
} from '../lib/retail';


// Dashboard View
export function UserManagementView({
  currentUser
}: {
  currentUser: { id?: string; name?: string; email: string; role: string } | null;
}) {
  const { data: users = [] } = useRetailUsersQuery(currentUser?.role === 'Admin') as { data?: User[] };
  const createUserMutation = useCreateRetailUserMutation();
  const updateUserMutation = useUpdateRetailUserMutation();
  const deleteUserMutation = useDeleteRetailUserMutation();
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'Staff' as 'Admin' | 'Staff' | 'Cashier' | 'KitchenStaff' | 'RetailStaff',
    password: '',
    confirmPassword: ''
  });

  // Check if current user is admin
  const isAdmin = currentUser?.role === 'Admin';

  // If not admin, show access denied
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="bg-destructive/10 size-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Eye className="size-10 text-destructive" />
          </div>
          <h3 className="text-[24px] font-bold text-foreground mb-2">Access Denied</h3>
          <p className="text-[14px] text-muted-foreground">
            You do not have permission to access User Management.<br />
            This section is restricted to administrators only.
          </p>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(user => {
    const roleMatch = filterRole === 'all' || user.role === filterRole;
    const statusMatch = filterStatus === 'all' || user.status === filterStatus;
    const searchMatch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    return roleMatch && statusMatch && searchMatch;
  });

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!userForm.name || !userForm.email || !userForm.password) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (userForm.password !== userForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (userForm.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    // Check if email already exists
    if (users.some(u => u.email.toLowerCase() === userForm.email.toLowerCase())) {
      toast.error('A user with this email already exists');
      return;
    }

    try {
      const newUser = await createUserMutation.mutateAsync({
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
        status: 'Active'
      });

      setShowAddModal(false);
      setUserForm({ name: '', email: '', role: 'Staff', password: '', confirmPassword: '' });
      toast.success(`User ${newUser.name} has been created successfully!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create user');
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser) return;

    if (!userForm.name || !userForm.email) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Check if email already exists for another user
    if (users.some(u => u.id !== selectedUser.id && u.email.toLowerCase() === userForm.email.toLowerCase())) {
      toast.error('A user with this email already exists');
      return;
    }

    try {
      await updateUserMutation.mutateAsync({
        id: selectedUser.id,
        data: {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          status: selectedUser.status
        },
      });

      setShowEditModal(false);
      setSelectedUser(null);
      setUserForm({ name: '', email: '', role: 'Staff', password: '', confirmPassword: '' });
      toast.success('User updated successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update user');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser) return;

    if (!userForm.password || !userForm.confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }

    if (userForm.password !== userForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (userForm.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      await updateUserMutation.mutateAsync({
        id: selectedUser.id,
        data: { password: userForm.password },
      });
      setShowPasswordModal(false);
      setSelectedUser(null);
      setUserForm({ name: '', email: '', role: 'Staff', password: '', confirmPassword: '' });
      toast.success(`Password for ${selectedUser.name} has been reset successfully!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset password');
    }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';

    if (user.email === currentUser?.email && newStatus === 'Inactive') {
      toast.error('You cannot deactivate your own account');
      return;
    }

    if (confirm(`Are you sure you want to ${newStatus === 'Active' ? 'activate' : 'deactivate'} ${user.name}?`)) {
      try {
        await updateUserMutation.mutateAsync({
          id: user.id,
          data: { status: newStatus },
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update user status');
      }
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.email === currentUser?.email) {
      toast.error('You cannot delete your own account');
      return;
    }

    if (confirm(`Are you sure you want to delete ${user.name}? This action cannot be undone.`)) {
      try {
        await deleteUserMutation.mutateAsync(user.id);
        toast.success(`User ${user.name} has been deleted`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete user');
      }
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setUserForm({
      name: user.name,
      email: user.email,
      role: user.role,
      password: '',
      confirmPassword: ''
    });
    setShowEditModal(true);
  };

  const openPasswordModal = (user: User) => {
    setSelectedUser(user);
    setUserForm({
      name: '',
      email: '',
      role: 'Staff',
      password: '',
      confirmPassword: ''
    });
    setShowPasswordModal(true);
  };

  const userStats = {
    total: users.length,
    active: users.filter(u => u.status === 'Active').length,
    inactive: users.filter(u => u.status === 'Inactive').length,
    admins: users.filter(u => u.role === 'Admin').length,
    staff: users.filter(u => u.role === 'Staff').length
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[30px] font-bold text-foreground">User Management</h2>
          <p className="text-muted-foreground text-[14px] mt-1">Manage user accounts and permissions</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-secondary text-white px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-secondary transition-colors"
        >
          <Plus className="size-4" />
          Add User
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-[14px] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-[12px] mb-1">Total Users</p>
              <p className="text-foreground text-[28px] font-bold">{userStats.total}</p>
              <div className="flex gap-3 mt-2">
                <span className="text-[11px] text-success">Active: {userStats.active}</span>
                <span className="text-[11px] text-destructive">Inactive: {userStats.inactive}</span>
              </div>
            </div>
            <div className="bg-secondary/10 rounded-full size-[56px] flex items-center justify-center">
              <Users className="size-7 text-secondary" />
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-6">
          <p className="text-muted-foreground text-[12px] mb-3">Users by Role</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-foreground">Admin</span>
              <span className="text-[14px] font-bold text-warning">{userStats.admins}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-foreground">Staff</span>
              <span className="text-[14px] font-bold text-secondary">{userStats.staff}</span>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-6">
          <p className="text-muted-foreground text-[12px] mb-1">Active Rate</p>
          <p className="text-foreground text-[28px] font-bold">
            {userStats.total > 0 ? Math.round((userStats.active / userStats.total) * 100) : 0}%
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">{userStats.active} out of {userStats.total} users active</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-card border border-border rounded-[14px] mb-4 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[14px] text-foreground font-medium">Role:</label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-3 py-2 border border-border rounded-[8px] text-[14px] bg-card focus:outline-none focus:border-secondary"
            >
              <option value="all">All Roles</option>
              <option value="Admin">Admin</option>
              <option value="Staff">Staff</option>
              <option value="Cashier">Cashier</option>
              <option value="RetailStaff">Retail Staff</option>
              <option value="KitchenStaff">Kitchen Staff</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[14px] text-foreground font-medium">Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-border rounded-[8px] text-[14px] bg-card focus:outline-none focus:border-secondary"
            >
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users List */}
      <div className="bg-card border border-border rounded-[14px] overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="text-left px-6 py-3 text-[13px] font-semibold text-foreground">User</th>
              <th className="text-left px-6 py-3 text-[13px] font-semibold text-foreground">Email</th>
              <th className="text-left px-6 py-3 text-[13px] font-semibold text-foreground">Role</th>
              <th className="text-left px-6 py-3 text-[13px] font-semibold text-foreground">Status</th>
              <th className="text-left px-6 py-3 text-[13px] font-semibold text-foreground">Last Login</th>
              <th className="text-left px-6 py-3 text-[13px] font-semibold text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                  No users found
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user.id} className="border-b border-border hover:bg-muted transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full size-[40px] flex items-center justify-center ${
                        user.role === 'Admin' ? 'bg-warning/10' :
                        'bg-secondary/10'
                      }`}>
                        <span className="text-[16px] font-semibold text-foreground">{user.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-[14px] font-medium text-foreground">{user.name}</p>
                        {user.email === currentUser?.email && (
                          <span className="text-[11px] text-secondary font-medium">(You)</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[14px] text-foreground">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[12px] font-semibold ${
                      user.role === 'Admin' ? 'bg-warning/10 text-warning' :
                      'bg-secondary/10 text-secondary'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleStatus(user)}
                      className={`px-2 py-1 rounded text-[12px] font-semibold transition-opacity hover:opacity-80 ${
                        user.status === 'Active' ? 'bg-secondary/10 text-secondary' : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {user.status}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-[14px] text-foreground">{user.lastLogin}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 hover:bg-secondary/10 rounded-[6px] text-secondary transition-colors"
                        title="Edit User"
                      >
                        <Edit2 className="size-4" />
                      </button>
                      <button
                        onClick={() => openPasswordModal(user)}
                        className="p-2 hover:bg-warning/10 rounded-[6px] text-warning transition-colors"
                        title="Reset Password"
                      >
                        <RefreshCw className="size-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="p-2 hover:bg-destructive/10 rounded-[6px] text-destructive transition-colors"
                        title="Delete User"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-[14px] p-6 w-[500px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[20px] font-bold text-foreground">Add New User</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setUserForm({ name: '', email: '', role: 'Staff', password: '', confirmPassword: '' });
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser}>
              <div className="space-y-4">
                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">
                    Full Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                    placeholder="Enter full name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">
                    Email Address <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                    placeholder="Enter email address"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">
                    Role <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                    className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                    required
                  >
                    <option value="Staff">Staff</option>
                    <option value="Cashier">Cashier</option>
                    <option value="RetailStaff">Retail Staff</option>
                    <option value="KitchenStaff">Kitchen Staff</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">
                    Password <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                    placeholder="Enter password (min. 6 characters)"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">
                    Confirm Password <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="password"
                    value={userForm.confirmPassword}
                    onChange={(e) => setUserForm({ ...userForm, confirmPassword: e.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                    placeholder="Confirm password"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 bg-secondary text-white py-2 rounded-[8px] text-[14px] font-medium hover:bg-secondary transition-colors"
                >
                  Create User
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setUserForm({ name: '', email: '', role: 'Staff', password: '', confirmPassword: '' });
                  }}
                  className="flex-1 border border-border py-2 rounded-[8px] text-[14px] font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-[14px] p-6 w-[500px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[20px] font-bold text-foreground">Edit User</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedUser(null);
                  setUserForm({ name: '', email: '', role: 'Staff', password: '', confirmPassword: '' });
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleEditUser}>
              <div className="space-y-4">
                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">
                    Full Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                    placeholder="Enter full name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">
                    Email Address <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                    placeholder="Enter email address"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">
                    Role <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                    className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                    required
                    disabled={selectedUser.email === currentUser?.email}
                  >
                    <option value="Staff">Staff</option>
                    <option value="Cashier">Cashier</option>
                    <option value="RetailStaff">Retail Staff</option>
                    <option value="KitchenStaff">Kitchen Staff</option>
                    <option value="Admin">Admin</option>
                  </select>
                  {selectedUser.email === currentUser?.email && (
                    <p className="text-[11px] text-muted-foreground mt-1">You cannot change your own role</p>
                  )}
                </div>

                <div className="bg-secondary/10 border border-secondary rounded-[8px] p-3">
                  <p className="text-[12px] text-secondary">
                    <strong>Note:</strong> To change the password, use the "Reset Password" button in the actions menu.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 bg-secondary text-white py-2 rounded-[8px] text-[14px] font-medium hover:bg-secondary transition-colors"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                    setUserForm({ name: '', email: '', role: 'Staff', password: '', confirmPassword: '' });
                  }}
                  className="flex-1 border border-border py-2 rounded-[8px] text-[14px] font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-[14px] p-6 w-[500px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[20px] font-bold text-foreground">Reset Password</h3>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setSelectedUser(null);
                  setUserForm({ name: '', email: '', role: 'Staff', password: '', confirmPassword: '' });
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="text-[14px] text-muted-foreground mb-4">
              Reset password for <strong className="text-foreground">{selectedUser.name}</strong>
            </p>

            <form onSubmit={handleResetPassword}>
              <div className="space-y-4">
                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">
                    New Password <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                    placeholder="Enter new password (min. 6 characters)"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[14px] font-medium text-foreground mb-2">
                    Confirm New Password <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="password"
                    value={userForm.confirmPassword}
                    onChange={(e) => setUserForm({ ...userForm, confirmPassword: e.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-[8px] text-[14px] focus:outline-none focus:border-secondary"
                    placeholder="Confirm new password"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 bg-secondary text-white py-2 rounded-[8px] text-[14px] font-medium hover:bg-secondary transition-colors"
                >
                  Reset Password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setSelectedUser(null);
                    setUserForm({ name: '', email: '', role: 'Staff', password: '', confirmPassword: '' });
                  }}
                  className="flex-1 border border-border py-2 rounded-[8px] text-[14px] font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


