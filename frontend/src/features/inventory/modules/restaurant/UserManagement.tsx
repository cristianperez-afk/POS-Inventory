import { useState } from "react";
import { Plus, Search, Edit, Trash2, Shield, Mail, Phone, MoreVertical, X, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateRestaurantUserMutation,
  useDeleteRestaurantUserMutation,
  useRestaurantUsersQuery,
  useUpdateRestaurantUserMutation,
} from "../lib/restaurant";

type User = {
  id: number;
  backendId?: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  lastLogin: string;
  avatar: string;
};

export function UserManagement() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "staff",
    status: "active",
  });

  const { data: users = [] } = useRestaurantUsersQuery();
  const createUser = useCreateRestaurantUserMutation();
  const updateUser = useUpdateRestaurantUserMutation();
  const deleteUser = useDeleteRestaurantUserMutation();

  const roles = ["all", "admin", "manager", "staff"];

  const filteredUsers = users.filter(user => {
    const matchesSearch = (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (user.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: string) => {
    const styles = {
      admin: { bg: "#E0F7F7", text: "#009BA5", border: "#00A7A5" },
      manager: { bg: "#D1F2E8", text: "#007A5E", border: "#008967" },
      staff: { bg: "#F3F4F6", text: "#6B7280", border: "#D1D5DB" },
    };
    const style = styles[role as keyof typeof styles];

    if (!style) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: "#E5E7EB", color: "#374151", borderColor: "#9CA3AF" }}>
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </span>
      );
    }

    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: style.bg, color: style.text, borderColor: style.border }}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    return status === "active" ? (
      <span className="px-3 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: "#D1F2E8", color: "#007A5E", borderColor: "#008967" }}>
        Active
      </span>
    ) : (
      <span className="px-3 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: "#F3F4F6", color: "#6B7280", borderColor: "#D1D5DB" }}>
        Inactive
      </span>
    );
  };

  const stats = [
    { label: "Total Users", value: users.length, color: "#009BA5" },
    { label: "Admins", value: users.filter(u => u.role === "admin").length, color: "#009BA5" },
    { label: "Managers", value: users.filter(u => u.role === "manager").length, color: "#007A5E" },
    { label: "Staff", value: users.filter(u => u.role === "staff").length, color: "#6B7280" },
  ];

  const toBackendRole = (role: string) =>
    ({ admin: "Admin", manager: "Manager", staff: "Staff" }[role] ?? "Staff");
  const toBackendStatus = (status: string) =>
    status === "inactive" ? "Inactive" : "Active";

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await createUser.mutateAsync({
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        role: toBackendRole(newUser.role),
        status: toBackendStatus(newUser.status),
      });
      setNewUser({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "staff",
        status: "active",
      });
      setShowAddModal(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create user");
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser) return;

    if (!newUser.name.trim() || !newUser.email.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await updateUser.mutateAsync({
        id: selectedUser.backendId ?? String(selectedUser.id),
        data: {
          name: newUser.name.trim(),
          email: newUser.email.trim(),
          role: toBackendRole(newUser.role),
          status: toBackendStatus(newUser.status),
        },
      });
      setShowEditModal(false);
      setSelectedUser(null);
      setNewUser({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "staff",
        status: "active",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      await deleteUser.mutateAsync(selectedUser.backendId ?? String(selectedUser.id));
      setShowDeleteModal(false);
      setSelectedUser(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete user");
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setNewUser({
      name: user.name,
      email: user.email,
      password: "",
      phone: user.phone,
      role: user.role,
      status: user.status,
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (user: User) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setNewUser({
      ...newUser,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">User Management</h1>
          <p className="text-muted-foreground">Manage user accounts, roles, and permissions</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="mt-4 md:mt-0 px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-2xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add New User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="bg-card rounded-2xl p-6 shadow-sm border border-border">
            <p className="text-muted-foreground text-sm mb-2">{stat.label}</p>
            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search and Filter */}
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-border mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
          <div className="relative">
            <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="pl-12 pr-8 py-3 bg-input-background border border-input rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer min-w-[200px]"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role === "all" ? "All Roles" : role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.map((user) => (
          <div key={user.id} className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-all duration-200">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {user.avatar}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{user.name}</h3>
                  <div className="flex gap-2 mt-1">
                    {getRoleBadge(user.role)}
                    {getStatusBadge(user.status)}
                  </div>
                </div>
              </div>
              <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="w-4 h-4" />
                <span className="truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span>{user.phone}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-3">
                Last login: {user.lastLogin}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(user)}
                  className="flex-1 px-4 py-2 bg-primary/10 text-primary rounded-2xl hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => openDeleteModal(user)}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Role Permissions Info */}
      <div className="mt-8 bg-card rounded-2xl p-6 shadow-sm border border-border">
        <h2 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Role Permissions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
            <h3 className="font-semibold text-purple-900 mb-3">Admin</h3>
            <ul className="space-y-2 text-sm text-purple-700">
              <li>• Full system access</li>
              <li>• User management</li>
              <li>• System configuration</li>
              <li>• All reports and analytics</li>
            </ul>
          </div>
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3">Manager</h3>
            <ul className="space-y-2 text-sm text-blue-700">
              <li>• Inventory management</li>
              <li>• Purchase orders</li>
              <li>• Reports access</li>
              <li>• Team oversight</li>
            </ul>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3">Staff</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• View inventory</li>
              <li>• Add products</li>
              <li>• Receive goods</li>
              <li>• Basic reports</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Add New User</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div>
                <label htmlFor="add-name" className="block text-sm mb-2 text-foreground font-medium">
                  Full Name *
                </label>
                <input
                  id="add-name"
                  name="name"
                  type="text"
                  value={newUser.name}
                  onChange={handleInputChange}
                  placeholder="e.g., John Smith"
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  required
                />
              </div>

              <div>
                <label htmlFor="add-email" className="block text-sm mb-2 text-foreground font-medium">
                  Email Address *
                </label>
                <input
                  id="add-email"
                  name="email"
                  type="email"
                  value={newUser.email}
                  onChange={handleInputChange}
                  placeholder="e.g., john.smith@bukolabs.io"
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  required
                />
              </div>

              <div>
                <label htmlFor="add-password" className="block text-sm mb-2 text-foreground font-medium">
                  Password *
                </label>
                <input
                  id="add-password"
                  name="password"
                  type="password"
                  value={newUser.password}
                  onChange={handleInputChange}
                  placeholder="Minimum 6 characters"
                  minLength={6}
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  required
                />
              </div>

              <div>
                <label htmlFor="add-phone" className="block text-sm mb-2 text-foreground font-medium">
                  Phone Number
                </label>
                <input
                  id="add-phone"
                  name="phone"
                  type="tel"
                  value={newUser.phone}
                  onChange={handleInputChange}
                  placeholder="e.g., +1 (555) 123-4567"
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>

              <div>
                <label htmlFor="add-role" className="block text-sm mb-2 text-foreground font-medium">
                  Role *
                </label>
                <select
                  id="add-role"
                  name="role"
                  value={newUser.role}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                  required
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label htmlFor="add-status" className="block text-sm mb-2 text-foreground font-medium">
                  Status *
                </label>
                <select
                  id="add-status"
                  name="status"
                  value={newUser.status}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                  required
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  Add User
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Edit User</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditUser} className="p-6 space-y-4">
              <div>
                <label htmlFor="edit-name" className="block text-sm mb-2 text-foreground font-medium">
                  Full Name *
                </label>
                <input
                  id="edit-name"
                  name="name"
                  type="text"
                  value={newUser.name}
                  onChange={handleInputChange}
                  placeholder="e.g., John Smith"
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  required
                />
              </div>

              <div>
                <label htmlFor="edit-email" className="block text-sm mb-2 text-foreground font-medium">
                  Email Address *
                </label>
                <input
                  id="edit-email"
                  name="email"
                  type="email"
                  value={newUser.email}
                  onChange={handleInputChange}
                  placeholder="e.g., john.smith@bukolabs.io"
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  required
                />
              </div>

              <div>
                <label htmlFor="edit-phone" className="block text-sm mb-2 text-foreground font-medium">
                  Phone Number
                </label>
                <input
                  id="edit-phone"
                  name="phone"
                  type="tel"
                  value={newUser.phone}
                  onChange={handleInputChange}
                  placeholder="e.g., +1 (555) 123-4567"
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>

              <div>
                <label htmlFor="edit-role" className="block text-sm mb-2 text-foreground font-medium">
                  Role *
                </label>
                <select
                  id="edit-role"
                  name="role"
                  value={newUser.role}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                  required
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit-status" className="block text-sm mb-2 text-foreground font-medium">
                  Status *
                </label>
                <select
                  id="edit-status"
                  name="status"
                  value={newUser.status}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                  required
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-red-600" />
                Confirm Delete
              </h2>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-foreground mb-4">
                Are you sure you want to delete the user <strong>{selectedUser.name}</strong>?
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                This action cannot be undone. All user data and access will be permanently removed.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleDeleteUser}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  Delete User
                </button>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
