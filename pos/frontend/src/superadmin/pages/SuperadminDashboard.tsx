import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { getApiBaseUrl } from '../../auth/services/auth';
import logoImage from '../../imports/logo1.png';
import {
  CalendarDays,
  Ban,
  ChevronsRight,
  ChevronRight,
  CircleCheck,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Store,
  StoreIcon,
  Trash2,
  UserPlus,
  Utensils,
  X,
} from 'lucide-react';
import { LogoutConfirmDialog } from '../../shared/components/LogoutConfirmDialog';
import { DeleteConfirmDialog } from '../../shared/components/DeleteConfirmDialog';
import { getLocalDateKey } from '../../shared/utils/date';

interface AdminSummary {
  id: number;
  full_name: string;
  email: string;
  role: string;
  store_id: number | null;
  store_type: string | null;
  store_name: string | null;
  status?: string | null;
}

interface SuperadminDashboardProps {
  currentUser: AuthenticatedUser | null;
  onLogout: () => void;
}

type StoreFilter = 'ALL' | 'RETAIL_STORE' | 'RESTAURANT';
type DashboardSection = 'stores' | 'admins';
type SummaryModal = 'all-stores' | 'all-admins' | 'retail-stores' | 'restaurant-stores' | null;
type AdminActionPreview = 'reset-password' | 'deactivate-account';

const storeTypeLabel = (storeType: string | null | undefined) =>
  storeType === 'RETAIL_STORE' ? 'Retail Store' : storeType === 'RESTAURANT' ? 'Restaurant' : 'Unassigned';

const storeTypeStyles = (storeType: string | null | undefined) =>
  storeType === 'RETAIL_STORE'
    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
    : storeType === 'RESTAURANT'
      ? 'border-violet-100 bg-violet-50 text-[#00a7a5]'
      : 'border-slate-100 bg-slate-50 text-slate-500';

const formatStoreCount = (count: number, total: number) => (total === 0 ? '0 (0%)' : `${count} (${((count / total) * 100).toFixed(1)}%)`);

const isAdminActive = (admin: AdminSummary) => (admin.status ?? 'ACTIVE') === 'ACTIVE';

const statusBadge = (admin: AdminSummary) =>
  isAdminActive(admin)
    ? <span className="inline-flex rounded bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Active</span>
    : <span className="inline-flex rounded bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">Deactivated</span>;

export function SuperadminDashboard({ currentUser, onLogout }: SuperadminDashboardProps) {
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminSummary | null>(null);
  const [createError, setCreateError] = useState('');
  const [createdPassword, setCreatedPassword] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formStoreType, setFormStoreType] = useState<'RESTAURANT' | 'RETAIL_STORE'>('RESTAURANT');
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('ALL');
  const [adminFilter, setAdminFilter] = useState<StoreFilter>('ALL');
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<DashboardSection>('stores');
  const [activeSummaryModal, setActiveSummaryModal] = useState<SummaryModal>(null);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey());
  const [viewSummaryRecord, setViewSummaryRecord] = useState<AdminSummary | null>(null);
  const [adminActionPreview, setAdminActionPreview] = useState<{ action: AdminActionPreview; admin: AdminSummary } | null>(null);
  const [addStoreModalOpen, setAddStoreModalOpen] = useState(false);
  const [deletingAdminId, setDeletingAdminId] = useState<number | null>(null);
  const [activatingAdmin, setActivatingAdmin] = useState<AdminSummary | null>(null);
  const [permanentlyDeletingAdminId, setPermanentlyDeletingAdminId] = useState<number | null>(null);
  const [permanentlyDeletingAdmin, setPermanentlyDeletingAdmin] = useState<AdminSummary | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [adminPage, setAdminPage] = useState(1);

  useEffect(() => {
    const loadAdmins = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/superadmin/admins`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message ?? 'Unable to load admin accounts.');
        }

        setAdmins(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load admin accounts.');
      } finally {
        setLoading(false);
      }
    };

    void loadAdmins();
  }, []);

  const stores = useMemo(() => {
    const byStore = new Map<number | string, AdminSummary>();

    admins.forEach((admin) => {
      const key = admin.store_id ?? `admin-${admin.id}`;
      if (!byStore.has(key)) {
        byStore.set(key, admin);
      }
    });

    return Array.from(byStore.values());
  }, [admins]);

  const retailStores = stores.filter((store) => store.store_type === 'RETAIL_STORE');
  const restaurantStores = stores.filter((store) => store.store_type === 'RESTAURANT');
  const filteredStores = stores.filter((store) => storeFilter === 'ALL' || store.store_type === storeFilter);
  const filteredAdmins = admins.filter((admin) => adminFilter === 'ALL' || admin.store_type === adminFilter);
  const adminPageSize = 6;
  const adminPageCount = Math.max(1, Math.ceil(filteredAdmins.length / adminPageSize));
  const adminPageStartIndex = (adminPage - 1) * adminPageSize;
  const shownAdminCount = Math.min(adminPageStartIndex + adminPageSize, filteredAdmins.length);
  const paginatedAdmins = filteredAdmins.slice(adminPageStartIndex, adminPageStartIndex + adminPageSize);
  const retailPercent = stores.length === 0 ? 0 : Math.round((retailStores.length / stores.length) * 100);
  const modalStores =
    activeSummaryModal === 'retail-stores'
      ? retailStores
      : activeSummaryModal === 'restaurant-stores'
        ? restaurantStores
        : stores;
  const modalAdmins = admins;

  const handleCreateAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setCreateError('');
    setCreatedPassword('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/superadmin/admins${editingAdmin ? `/${editingAdmin.id}` : ''}`, {
        method: editingAdmin ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formFullName,
          email: formEmail,
          password: formPassword || undefined,
          store_type: formStoreType,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? 'Unable to save admin account.');
      }

      const wasEditing = Boolean(editingAdmin);

      setAdmins((current) => (wasEditing ? current.map((admin) => (admin.id === data.id ? data : admin)) : [...current, data.user]));
      if (!wasEditing) {
        setCreatedPassword(data.temporary_password || formPassword);
      }
      setEditingAdmin(null);
      setFormFullName('');
      setFormEmail('');
      setFormPassword('');
      setFormStoreType('RESTAURANT');
      setVisiblePassword(false);
      setAdminModalOpen(false);
    } catch (createAdminError) {
      setCreateError(createAdminError instanceof Error ? createAdminError.message : 'Unable to save admin account.');
    } finally {
      setCreating(false);
    }
  };

  const handleEditAdmin = (admin: AdminSummary) => {
    setEditingAdmin(admin);
    setFormFullName(admin.full_name);
    setFormEmail(admin.email);
    setFormPassword('');
    setFormStoreType(admin.store_type === 'RETAIL_STORE' ? 'RETAIL_STORE' : 'RESTAURANT');
    setCreateError('');
    setCreatedPassword('');
    setAdminModalOpen(true);
  };

  const handleOpenCreateAdmin = () => {
    setEditingAdmin(null);
    setFormFullName('');
    setFormEmail('');
    setFormPassword('');
    setFormStoreType('RESTAURANT');
    setCreateError('');
    setCreatedPassword('');
    setVisiblePassword(false);
    setAdminModalOpen(true);
  };

  const handleCancelEdit = () => {
    setEditingAdmin(null);
    setFormFullName('');
    setFormEmail('');
    setFormPassword('');
    setFormStoreType('RESTAURANT');
    setCreateError('');
    setVisiblePassword(false);
    setAdminModalOpen(false);
  };

  const handleDeactivateAdmin = async (admin: AdminSummary) => {
    setDeletingAdminId(admin.id);
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/superadmin/admins/${admin.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? 'Unable to deactivate admin account.');
      }

      setAdmins((current) => current.map((item) => (item.id === admin.id ? { ...item, status: 'INACTIVE' } : item)));
      setAdminActionPreview(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to deactivate admin account.');
    } finally {
      setDeletingAdminId(null);
    }
  };

  const handleActivateAdmin = async (admin: AdminSummary) => {
    setDeletingAdminId(admin.id);
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/superadmin/admins/${admin.id}/activate`, {
        method: 'PATCH',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? 'Unable to activate admin account.');
      }

      setAdmins((current) => current.map((item) => (item.id === admin.id ? { ...item, status: 'ACTIVE' } : item)));
      setActivatingAdmin(null);
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : 'Unable to activate admin account.');
    } finally {
      setDeletingAdminId(null);
    }
  };

  const handlePermanentlyDeleteAdmin = async (admin: AdminSummary) => {
    setPermanentlyDeletingAdminId(admin.id);
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/superadmin/admins/${admin.id}/permanent`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? 'Unable to delete admin account.');
      }

      setAdmins((current) => current.filter((item) => item.id !== admin.id));
      setPermanentlyDeletingAdmin(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete admin account.');
    } finally {
      setPermanentlyDeletingAdminId(null);
    }
  };

  const summaryCards = [
    {
      title: 'Total Stores',
      value: stores.length,
      link: 'View all stores',
      icon: StoreIcon,
      tone: 'blue',
      onClick: () => setActiveSummaryModal('all-stores'),
    },
    {
      title: 'Total Admin Accounts',
      value: admins.length,
      link: 'View all admin accounts',
      icon: UserPlus,
      tone: 'green',
      onClick: () => setActiveSummaryModal('all-admins'),
    },
    {
      title: 'Retail Stores',
      value: retailStores.length,
      detail: ' ',
      link: 'View retail stores',
      icon: Store,
      tone: 'violet',
      onClick: () => setActiveSummaryModal('retail-stores'),
    },
    {
      title: 'Restaurant Stores',
      value: restaurantStores.length,
      detail: ' ',
      link: 'View restaurant stores',
      icon: Utensils,
      tone: 'orange',
      onClick: () => setActiveSummaryModal('restaurant-stores'),
    },
  ];

  const summaryModalTitle =
    activeSummaryModal === 'all-admins'
      ? 'Admin Accounts'
      : activeSummaryModal === 'retail-stores'
        ? 'Retail Stores'
        : activeSummaryModal === 'restaurant-stores'
          ? 'Restaurant Stores'
          : 'All Stores';
  const summaryModalSubtitle =
    activeSummaryModal === 'all-admins'
      ? 'Manage all admin accounts in the system.'
      : activeSummaryModal === 'retail-stores'
        ? 'View and manage all retail stores.'
        : activeSummaryModal === 'restaurant-stores'
          ? 'View and manage all restaurant stores.'
          : 'View and manage all stores in the system.';
  const summaryModalBadge =
    activeSummaryModal === 'all-admins'
      ? 'View All Admin Accounts'
      : activeSummaryModal === 'retail-stores'
        ? 'View Retail Stores'
        : activeSummaryModal === 'restaurant-stores'
          ? 'View Restaurant Stores'
          : 'View All Stores';
  const summaryModalBadgeClass =
    activeSummaryModal === 'all-admins'
      ? 'bg-emerald-700'
      : activeSummaryModal === 'retail-stores'
        ? 'bg-amber-600'
        : activeSummaryModal === 'restaurant-stores'
          ? 'bg-red-600'
          : 'bg-[#00a7a5]';
  const isStoreSummaryModal = activeSummaryModal && activeSummaryModal !== 'all-admins';
  const isFilteredStoreSummaryModal = activeSummaryModal === 'retail-stores' || activeSummaryModal === 'restaurant-stores';

  useEffect(() => {
    setAdminPage(1);
  }, [adminFilter]);

  useEffect(() => {
    setAdminPage((page) => Math.min(page, adminPageCount));
  }, [adminPageCount]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#007a5e]">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex flex-col text-white transition-[width] duration-300 ease-in-out ${isSidebarCollapsed ? 'w-20 overflow-visible' : 'w-80 overflow-y-auto'}`}
        style={{ background: 'linear-gradient(180deg, #003534 0%, #007a5e 100%)' }}
      >
        <div className={`relative border-b border-white/10 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'px-3 py-4' : 'px-4 pb-4 pt-5'}`}>
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            className={`z-10 inline-flex items-center justify-center text-slate-300 transition hover:text-slate-100 ${
              isSidebarCollapsed ? 'group relative left-1/2 h-10 w-10 -translate-x-1/2' : 'absolute right-3 top-3 h-9 w-9'
            }`}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? (
              <>
                <img src={logoImage} alt="N&Ns logo" className="h-full w-full object-contain transition-opacity duration-150 group-hover:opacity-0" />
                <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <PanelLeftOpen className="h-5 w-5" strokeWidth={1.8} />
                </span>
              </>
            ) : (
              <PanelLeftClose className="h-5 w-5" strokeWidth={1.8} />
            )}
          </button>
          <div className="text-center">
            {!isSidebarCollapsed && (
              <div className="mx-auto mb-1 flex h-24 w-24 items-center justify-center transition-all duration-300 ease-in-out">
                <img src={logoImage} alt="N&Ns logo" className="h-20 w-20 object-contain transition-all duration-300 ease-in-out" />
              </div>
            )}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'max-h-0 opacity-0' : 'max-h-16 opacity-100'}`}>
              <h1 className="truncate text-xl font-semibold tracking-tight text-white">Unified POS</h1>
              <p className="mt-1 text-lg leading-tight text-slate-200">Super Admin</p>
            </div>
          </div>
        </div>

        <nav className={`flex-1 py-7 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'px-3' : 'px-5'}`}>
          <button
            type="button"
            onClick={() => {
              setActiveSection('stores');
              setStoreFilter('ALL');
            }}
            className={`mb-4 flex h-[52px] w-full items-center rounded-lg border transition ${
              isSidebarCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
            } ${
              activeSection === 'stores'
                ? 'border-[#00a7a5]/25 text-white'
                : 'border-transparent text-white hover:bg-[#007a5e]/15 hover:text-slate-100'
            }`}
            style={
              activeSection === 'stores'
                ? { background: 'linear-gradient(135deg, #008967 0%, #007a5e 100%)', boxShadow: '0 0 18px rgba(0,167,165,0.16)' }
                : undefined
            }
          >
            <StoreIcon className="h-6 w-6 shrink-0" strokeWidth={1.8} />
            <span className={`overflow-hidden whitespace-nowrap text-base transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'} ${activeSection === 'stores' ? 'font-semibold' : 'font-medium'}`}>
              {!isSidebarCollapsed && 'Stores'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSection('admins');
              setAdminFilter('ALL');
            }}
            className={`flex h-[52px] w-full items-center rounded-lg border transition ${
              isSidebarCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
            } ${
              activeSection === 'admins'
                ? 'border-[#00a7a5]/25 text-white'
                : 'border-transparent text-white hover:bg-[#007a5e]/15 hover:text-slate-100'
            }`}
            style={
              activeSection === 'admins'
                ? { background: 'linear-gradient(135deg, #008967 0%, #007a5e 100%)', boxShadow: '0 0 18px rgba(0,167,165,0.16)' }
                : undefined
            }
          >
            <UserPlus className="h-6 w-6 shrink-0" strokeWidth={1.8} />
            <span className={`overflow-hidden whitespace-nowrap text-base transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'} ${activeSection === 'admins' ? 'font-semibold' : 'font-medium'}`}>
              {!isSidebarCollapsed && 'Admin Accounts'}
            </span>
          </button>
        </nav>

        <div className={`border-t border-white/10 py-2 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'px-3' : 'px-5'}`}>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className={`flex h-11 w-full items-center rounded-lg border border-transparent text-white transition hover:bg-red-500/10 hover:text-red-400 ${
              isSidebarCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
            }`}
          >
            <LogOut className="h-6 w-6 shrink-0" strokeWidth={1.8} />
            <span className={`overflow-hidden whitespace-nowrap text-base font-medium transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'}`}>
              {!isSidebarCollapsed && 'Logout'}
            </span>
          </button>
        </div>
      </aside>

      <LogoutConfirmDialog
        isOpen={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          onLogout();
        }}
      />
      <DeleteConfirmDialog
        isOpen={Boolean(permanentlyDeletingAdmin)}
        title="Confirm Delete"
        description={`Are you sure you want to permanently delete ${permanentlyDeletingAdmin?.full_name ?? 'this admin account'}? This action cannot be undone.`}
        onCancel={() => setPermanentlyDeletingAdmin(null)}
        onConfirm={() => {
          if (permanentlyDeletingAdmin) void handlePermanentlyDeleteAdmin(permanentlyDeletingAdmin);
        }}
      />
      <DeleteConfirmDialog
        isOpen={Boolean(activatingAdmin)}
        title="Confirm Reactivation"
        description={`Are you sure you want to reactivate ${activatingAdmin?.full_name ?? 'this admin account'}? They will be able to log in again.`}
        onCancel={() => setActivatingAdmin(null)}
        onConfirm={() => {
          if (activatingAdmin) void handleActivateAdmin(activatingAdmin);
        }}
      />

      <main className={`min-h-screen min-w-0 transition-[margin-left] duration-300 ease-in-out ${isSidebarCollapsed ? 'ml-20' : 'ml-80'}`}>
        {activeSection === 'stores' && (
          <header className="flex min-h-[96px] items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
            <div>
              <h2 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#007a5e]">Store Management</h2>
              <p className="mt-1 text-base text-[#64748b]">Manage stores and admin accounts for the system.</p>
            </div>
            <div className="flex items-center gap-5">
              <div className="relative">
                <button type="button" className="flex h-10 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 text-base text-[#007a5e]">
                  {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Select date"
                />
              </div>
            </div>
          </header>
        )}

        <div className={`space-y-6 ${activeSection === 'admins' ? 'p-10' : 'p-8'}`}>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {createdPassword && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Admin created. Login password: {createdPassword}
            </div>
          )}

          {activeSection === 'stores' && (
            <>
              <section className="grid gap-5 xl:grid-cols-4">
                {summaryCards.map((card) => {
                  const Icon = card.icon;
                  const tone =
                    card.tone === 'blue'
                      ? 'bg-blue-50 text-blue-600'
                      : card.tone === 'green'
                        ? 'bg-emerald-50 text-emerald-600'
                        : card.tone === 'violet'
                          ? 'bg-violet-50 text-violet-600'
                          : 'bg-orange-50 text-orange-500';

                  return (
                    <article key={card.title} className="relative flex min-h-[178px] flex-col rounded-lg border border-slate-200 bg-white p-6 pb-12 shadow-md">
                      <div className="flex items-start gap-5">
                        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                          <Icon className="h-7 w-7" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-bold text-[#007a5e]">{card.title}</p>
                          <p className="mt-2 text-[32px] font-extrabold leading-none text-[#007a5e]">{card.value}</p>
                          {card.detail !== undefined && (
                            <p className="mt-2 min-h-5 text-base text-[#64748b]">{card.detail}</p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={card.onClick}
                        className="absolute bottom-4 right-4 inline-flex h-8 w-8 items-center justify-center text-[#0b5cff] transition hover:text-blue-700"
                        aria-label={card.link}
                        title={card.link}
                      >
                        <ChevronsRight className="h-7 w-7" strokeWidth={3} />
                      </button>
                    </article>
                  );
                })}
              </section>

              <section className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(360px,1fr)]">
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-md">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 className="text-xl font-extrabold text-[#007a5e]">Stores Overview</h3>
                    <select
                      value={storeFilter}
                      onChange={(event) => setStoreFilter(event.target.value as StoreFilter)}
                      className="h-10 rounded-md border border-slate-200 bg-white px-4 text-base font-medium text-[#007a5e] outline-none focus:border-blue-400"
                    >
                      <option value="ALL">All Store Types</option>
                      <option value="RETAIL_STORE">Retail Store</option>
                      <option value="RESTAURANT">Restaurant</option>
                    </select>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="border-y border-slate-200 bg-slate-50 text-xs font-bold text-[#475569]">
                        <tr>
                          <th className="px-3 py-3">Store Name</th>
                          <th className="px-3 py-3">Store Type</th>
                          <th className="px-3 py-3">Admin Name</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Date Created</th>
                          <th className="px-3 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loading ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-slate-500">Loading stores...</td>
                          </tr>
                        ) : filteredStores.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-slate-500">No stores match this filter.</td>
                          </tr>
                        ) : (
                          filteredStores.slice(0, 6).map((store) => (
                            <tr key={`${store.store_id ?? store.id}-store`} className="text-slate-700">
                              <td className="px-3 py-3 font-medium text-[#007a5e]">{store.store_name ?? `${store.full_name}'s Store`}</td>
                              <td className="px-3 py-3">
                                <span className={`inline-flex rounded px-2.5 py-1 text-xs font-medium ${storeTypeStyles(store.store_type)}`}>
                                  {storeTypeLabel(store.store_type)}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-[#475569]">{store.full_name}</td>
                              <td className="px-3 py-3">
                                {statusBadge(store)}
                              </td>
                              <td className="px-3 py-3 text-[#64748b]">May 31, 2026</td>
                              <td className="px-3 py-3">
                                <div className="flex justify-end">
                                  <button type="button" onClick={() => handleEditAdmin(store)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="View or edit admin">
                                    <Eye className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm text-[#64748b]">
                    <span>Showing {filteredStores.length === 0 ? 0 : 1} to {Math.min(6, filteredStores.length)} of {stores.length} stores</span>
                    <div className="flex items-center gap-2">
                      <button type="button" className="h-8 w-8 rounded-md bg-blue-600 text-sm font-semibold text-white">1</button>
                      <button type="button" className="h-8 w-8 rounded-md text-sm font-semibold text-slate-600 hover:bg-slate-100">2</button>
                      <button type="button" className="h-8 w-8 rounded-md text-slate-600 hover:bg-slate-100">
                        <ChevronRight className="mx-auto h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-md">
                  <h3 className="text-xl font-extrabold text-[#007a5e]">Store Type Distribution</h3>
                  <div className="mt-8 flex items-center justify-center gap-8">
                    <div
                      className="relative aspect-square w-56 rounded-full overflow-hidden"
                      style={{ background: `conic-gradient(#008967 0 ${retailPercent}%, #00a7a5 ${retailPercent}% 100%)` }}
                    >
                      <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-white">
                        <span className="text-3xl font-bold text-slate-900">{stores.length}</span>
                        <span className="text-sm text-slate-500">Total Stores</span>
                      </div>
                    </div>
                    <div className="space-y-5 text-sm">
                      <div>
                        <div className="flex items-center gap-3 font-semibold text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#008967]" />
                          Retail Store
                        </div>
                        <p className="mt-2 pl-6 text-slate-600">{formatStoreCount(retailStores.length, stores.length)}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-3 font-semibold text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#00a7a5]" />
                          Restaurant
                        </div>
                        <p className="mt-2 pl-6 text-slate-600">{formatStoreCount(restaurantStores.length, stores.length)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeSection === 'admins' && (
            <section className="w-full">
              <div className="w-full rounded-lg border border-slate-200 bg-white p-7 shadow-md">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-2xl font-extrabold text-slate-900">Admin Accounts</h3>
                  <div className="flex items-center gap-3">
                    <select
                      value={adminFilter}
                      onChange={(event) => setAdminFilter(event.target.value as StoreFilter)}
                      className="h-12 rounded-md border border-slate-200 bg-white px-5 text-base font-medium text-slate-700 outline-none focus:border-blue-400"
                    >
                      <option value="ALL">All Store Types</option>
                      <option value="RETAIL_STORE">Retail Store</option>
                      <option value="RESTAURANT">Restaurant</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleOpenCreateAdmin}
                      className="inline-flex h-12 items-center gap-2 rounded-md bg-gradient-to-r from-[#008967] to-[#005656] px-6 text-base font-bold text-white"
                    >
                      <Plus className="h-5 w-5" />
                      Create Admin Account
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden">
                  <table className="w-full table-fixed text-left text-sm">
                    <thead className="border-y border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                      <tr>
                        <th className="w-[18%] px-3 py-4">Admin Name</th>
                        <th className="w-[18%] px-3 py-4">Store Type</th>
                        <th className="w-[22%] px-3 py-4">Store Name</th>
                        <th className="w-[13%] px-3 py-4">Status</th>
                        <th className="w-[17%] px-3 py-4">Date Created</th>
                        <th className="w-[12%] px-3 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading admin accounts...</td>
                        </tr>
                      ) : filteredAdmins.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-slate-500">No admin accounts match this filter.</td>
                        </tr>
                      ) : (
                        paginatedAdmins.map((admin) => (
                          <tr key={admin.id} className="text-slate-700">
                            <td className="truncate px-3 py-4 font-medium text-slate-900">{admin.full_name}</td>
                            <td className="px-3 py-4">
                              <span className={`inline-flex max-w-full rounded px-2 py-1 text-xs font-medium ${storeTypeStyles(admin.store_type)}`}>
                                {storeTypeLabel(admin.store_type)}
                              </span>
                            </td>
                            <td className="truncate px-3 py-4">{admin.store_name ?? 'Unassigned'}</td>
                            <td className="px-3 py-4">
                              {statusBadge(admin)}
                            </td>
                            <td className="px-3 py-4 text-slate-500">May 31, 2026</td>
                            <td className="px-3 py-4">
                              <div className="flex justify-end gap-1">
                                <button type="button" onClick={() => handleEditAdmin(admin)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Edit admin" aria-label={`Edit ${admin.full_name}`}>
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAdminActionPreview({ action: 'reset-password', admin })}
                                  className="rounded-md p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                                  title="Reset password"
                                  aria-label={`Reset password for ${admin.full_name}`}
                                >
                                  <KeyRound className="h-4 w-4" />
                                </button>
                                {isAdminActive(admin) ? (
                                  <button
                                    type="button"
                                    onClick={() => setAdminActionPreview({ action: 'deactivate-account', admin })}
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                    title="Deactivate account"
                                    aria-label={`Deactivate ${admin.full_name}`}
                                  >
                                    <Ban className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setActivatingAdmin(admin)}
                                    disabled={deletingAdminId === admin.id}
                                    className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-60"
                                    title="Activate account"
                                    aria-label={`Activate ${admin.full_name}`}
                                  >
                                    <CircleCheck className="h-4 w-4" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setPermanentlyDeletingAdmin(admin)}
                                  disabled={permanentlyDeletingAdminId === admin.id}
                                  className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                                  title="Delete admin"
                                  aria-label={`Delete ${admin.full_name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-5 flex items-center justify-between text-base text-slate-500">
                  <span>
                    {filteredAdmins.length <= adminPageSize
                      ? `Showing all ${filteredAdmins.length} admin account${filteredAdmins.length === 1 ? '' : 's'}`
                      : `Showing ${filteredAdmins.length === 0 ? 0 : adminPageStartIndex + 1} to ${shownAdminCount} of ${filteredAdmins.length} admin accounts`}
                  </span>
                  <div className="flex items-center gap-2">
                    {Array.from({ length: adminPageCount }, (_, index) => {
                      const page = index + 1;
                      return (
                        <button
                          key={`admin-page-${page}`}
                          type="button"
                          onClick={() => setAdminPage(page)}
                          className={`h-8 w-8 rounded-md text-sm font-semibold ${
                            adminPage === page ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setAdminPage((page) => Math.min(adminPageCount, page + 1))}
                      disabled={adminPage === adminPageCount}
                      className="h-8 w-8 rounded-md text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          <footer className="text-sm text-slate-500">© 2026 Unified POS System. All rights reserved.</footer>
        </div>
      </main>

      {activeSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-5 py-8 backdrop-blur-sm">
          <section className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className={`flex min-h-12 items-center gap-3 px-5 text-white ${summaryModalBadgeClass}`}>
              <p className="text-base font-extrabold uppercase tracking-wide">{summaryModalBadge}</p>
              <button
                type="button"
                onClick={() => {
                  setActiveSummaryModal(null);
                  setViewSummaryRecord(null);
                }}
                className="ml-auto rounded-md p-1.5 text-white/80 hover:bg-white/15 hover:text-white"
                aria-label="Close summary popup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-7">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-extrabold text-slate-900">{summaryModalTitle}</h3>
                  <p className="mt-1 text-sm text-slate-500">{summaryModalSubtitle}</p>
                </div>
                <button type="button" className="flex h-10 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900">
                  May 31, 2026
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                </button>
              </div>

              <div className="mb-5 flex flex-wrap items-center gap-3">
                <label className="relative min-w-[260px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    placeholder={activeSummaryModal === 'all-admins' ? 'Search admin name or email...' : 'Search store name or admin...'}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400"
                  />
                </label>
                {(activeSummaryModal === 'all-stores' || activeSummaryModal === 'all-admins') && (
                  <select className="h-11 min-w-40 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-400">
                    <option>All Store Types</option>
                    <option>Retail Store</option>
                    <option>Restaurant</option>
                  </select>
                )}
                <select className="h-11 min-w-36 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-400">
                  <option>All Statuses</option>
                  <option>Active</option>
                </select>
                {activeSummaryModal === 'all-stores' && (
                  <button
                    type="button"
                    onClick={() => setAddStoreModalOpen(true)}
                    className="ml-auto inline-flex h-11 items-center gap-2 rounded-md bg-[#00a7a5] px-5 text-sm font-bold text-white hover:bg-violet-800"
                  >
                    <Plus className="h-4 w-4" />
                    Add Store
                  </button>
                )}
                {activeSummaryModal === 'all-admins' && (
                  <button type="button" onClick={handleOpenCreateAdmin} className="ml-auto inline-flex h-11 items-center gap-2 rounded-md bg-emerald-700 px-5 text-sm font-bold text-white hover:bg-emerald-800">
                    <Plus className="h-4 w-4" />
                    Create Admin
                  </button>
                )}
              </div>

              {isStoreSummaryModal && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Store Name</th>
                        {!isFilteredStoreSummaryModal && <th className="px-4 py-3">Store Type</th>}
                        <th className="px-4 py-3">Admin Name</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Date Created</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={isFilteredStoreSummaryModal ? 5 : 6} className="px-4 py-10 text-center text-slate-500">Loading stores...</td>
                        </tr>
                      ) : modalStores.length === 0 ? (
                        <tr>
                          <td colSpan={isFilteredStoreSummaryModal ? 5 : 6} className="px-4 py-10 text-center text-slate-500">No stores to display.</td>
                        </tr>
                      ) : (
                        modalStores.map((store) => (
                          <tr key={`${store.store_id ?? store.id}-summary-store`} className="text-slate-700">
                            <td className="px-4 py-4 font-medium text-slate-900">{store.store_name ?? `${store.full_name}'s Store`}</td>
                            {!isFilteredStoreSummaryModal && (
                              <td className="px-4 py-4">
                                <span className={`inline-flex rounded px-2.5 py-1 text-xs font-medium ${storeTypeStyles(store.store_type)}`}>
                                  {storeTypeLabel(store.store_type)}
                                </span>
                              </td>
                            )}
                            <td className="px-4 py-4">
                              <p className="font-medium text-slate-800">{store.full_name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{store.email}</p>
                            </td>
                            <td className="px-4 py-4">
                              {statusBadge(store)}
                            </td>
                            <td className="px-4 py-4 text-slate-500">May 31, 2026</td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setViewSummaryRecord(store)}
                                  className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                                  title="View store"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeSummaryModal === 'all-admins' && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Full Name</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Store Type</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Date Created</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading admin accounts...</td>
                        </tr>
                      ) : modalAdmins.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-slate-500">No admin accounts to display.</td>
                        </tr>
                      ) : (
                        modalAdmins.map((admin) => (
                          <tr key={`${admin.id}-summary-admin`} className="text-slate-700">
                            <td className="px-4 py-4 font-medium text-slate-900">{admin.full_name}</td>
                            <td className="px-4 py-4 text-slate-600">{admin.email}</td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex rounded px-2.5 py-1 text-xs font-medium ${storeTypeStyles(admin.store_type)}`}>
                                {storeTypeLabel(admin.store_type)}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              {statusBadge(admin)}
                            </td>
                            <td className="px-4 py-4 text-slate-500">May 31, 2026</td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setViewSummaryRecord(admin)}
                                  className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                                  title="View admin"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Showing {activeSummaryModal === 'all-admins' ? (modalAdmins.length === 0 ? 0 : 1) : modalStores.length === 0 ? 0 : 1} to{' '}
                  {activeSummaryModal === 'all-admins' ? modalAdmins.length : modalStores.length} of{' '}
                  {activeSummaryModal === 'all-admins' ? modalAdmins.length : modalStores.length}{' '}
                  {activeSummaryModal === 'all-admins' ? 'admins' : 'stores'}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" className="h-8 w-8 rounded-md border border-slate-200 text-slate-400">
                    <ChevronRight className="mx-auto h-4 w-4 rotate-180" />
                  </button>
                  <button type="button" className="h-8 w-8 rounded-md border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700">1</button>
                  <button type="button" className="h-8 w-8 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50">
                    <ChevronRight className="mx-auto h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {viewSummaryRecord && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <section className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">
                  {activeSummaryModal === 'all-admins' ? 'Admin Details' : 'Store Details'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {activeSummaryModal === 'all-admins' ? 'View admin account information.' : 'View store information.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewSummaryRecord(null)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close details popup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
              <div className={`flex h-20 w-20 items-center justify-center rounded-full ${viewSummaryRecord.store_type === 'RESTAURANT' ? 'bg-violet-50 text-[#00a7a5]' : 'bg-emerald-50 text-emerald-700'}`}>
                {activeSummaryModal === 'all-admins' ? (
                  <UserPlus className="h-10 w-10" />
                ) : viewSummaryRecord.store_type === 'RESTAURANT' ? (
                  <Utensils className="h-10 w-10" />
                ) : (
                  <Store className="h-10 w-10" />
                )}
              </div>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Full Name</p>
                  <p className="mt-1 font-semibold text-slate-900">{viewSummaryRecord.full_name}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Email</p>
                  <p className="mt-1 font-semibold text-slate-900">{viewSummaryRecord.email}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Store Name</p>
                  <p className="mt-1 font-semibold text-slate-900">{viewSummaryRecord.store_name ?? `${viewSummaryRecord.full_name}'s Store`}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Store Type</p>
                  <p className="mt-1 font-semibold text-slate-900">{storeTypeLabel(viewSummaryRecord.store_type)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Status</p>
                  <span className="mt-1 inline-flex">{statusBadge(viewSummaryRecord)}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Date Created</p>
                  <p className="mt-1 font-semibold text-slate-900">May 31, 2026</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {addStoreModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <form className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">Add Store</h3>
                <p className="mt-1 text-sm text-slate-500">Create a store profile and assign its store type.</p>
              </div>
              <button
                type="button"
                onClick={() => setAddStoreModalOpen(false)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close add store popup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4">
              <label className="block text-xs font-semibold text-slate-600">
                Store Name
                <input placeholder="Enter store name" className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400" />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Store Type
                <select className="mt-1 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400">
                  <option>Retail Store</option>
                  <option>Restaurant</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Assigned Admin
                <select className="mt-1 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400">
                  <option>Select admin account</option>
                  {admins.map((admin) => (
                    <option key={`store-admin-${admin.id}`}>{admin.full_name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Address
                <input placeholder="Enter store address" className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400" />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setAddStoreModalOpen(false)} className="h-11 rounded-md border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={() => setAddStoreModalOpen(false)} className="h-11 rounded-md bg-[#00a7a5] px-5 text-sm font-bold text-white hover:bg-violet-800">
                Save Store
              </button>
            </div>
          </form>
        </div>
      )}

      {adminActionPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">
                  {adminActionPreview.action === 'reset-password' ? 'Reset Password' : 'Deactivate Account'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {adminActionPreview.action === 'reset-password'
                    ? `Set a new temporary password for ${adminActionPreview.admin.full_name}.`
                    : `Review this action for ${adminActionPreview.admin.full_name}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdminActionPreview(null)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close admin action popup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {adminActionPreview.action === 'reset-password' ? (
              <div className="space-y-4">
                <label className="block text-xs font-semibold text-slate-600">
                  Temporary Password
                  <input placeholder="Enter new temporary password" className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400" />
                </label>
                <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                  The admin should change this password after logging in.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  Deactivating prevents this admin from accessing the system, but the account remains visible here and can be activated again.
                </div>
                <div className="rounded-md border border-slate-200 p-3 text-sm">
                  <p className="font-semibold text-slate-900">{adminActionPreview.admin.full_name}</p>
                  <p className="mt-1 text-slate-500">{adminActionPreview.admin.email}</p>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setAdminActionPreview(null)} className="h-11 rounded-md border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              {adminActionPreview.action === 'reset-password' ? (
                <button type="button" onClick={() => setAdminActionPreview(null)} className="h-11 rounded-md bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">
                  Reset Password
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleDeactivateAdmin(adminActionPreview.admin)}
                  disabled={deletingAdminId === adminActionPreview.admin.id}
                  className="h-11 rounded-md bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingAdminId === adminActionPreview.admin.id ? 'Deactivating...' : 'Deactivate Account'}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {adminModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8 backdrop-blur-sm">
          <form onSubmit={handleCreateAdmin} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{editingAdmin ? 'Edit Admin Account' : 'Create Admin Account'}</h3>
                <p className="mt-1 text-xs text-slate-500">Superadmin can only create admin accounts and assign store type.</p>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-md px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close admin account form"
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block text-xs font-semibold text-slate-600">
                Full Name
                <input
                  value={formFullName}
                  onChange={(event) => setFormFullName(event.target.value)}
                  required
                  placeholder="Enter full name"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Email Address
                <input
                  type="email"
                  value={formEmail}
                  onChange={(event) => setFormEmail(event.target.value)}
                  required
                  placeholder="Enter email address"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Username
                <input
                  value={formEmail.split('@')[0] ?? ''}
                  readOnly
                  placeholder="Enter username"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-500 outline-none"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Password
                <div className="relative mt-1">
                  <input
                    type={visiblePassword ? 'text' : 'password'}
                    value={formPassword}
                    onChange={(event) => setFormPassword(event.target.value)}
                    placeholder={editingAdmin ? 'Leave blank to keep current password' : 'Enter password'}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 pr-10 text-sm font-normal text-slate-900 outline-none focus:border-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => setVisiblePassword((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"
                    title={visiblePassword ? 'Hide password' : 'Show password'}
                  >
                    {visiblePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            </div>

            <fieldset className="mt-4">
              <legend className="text-xs font-semibold text-slate-600">Store Type</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormStoreType('RESTAURANT')}
                  className={`flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-semibold ${
                    formStoreType === 'RESTAURANT'
                      ? 'border-[#00a7a5] bg-[#00a7a5]/10 text-[#00a7a5]'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Utensils className="h-5 w-5" />
                  Restaurant
                </button>
                <button
                  type="button"
                  onClick={() => setFormStoreType('RETAIL_STORE')}
                  className={`flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-semibold ${
                    formStoreType === 'RETAIL_STORE'
                      ? 'border-[#00a7a5] bg-[#00a7a5]/10 text-[#00a7a5]'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Store className="h-5 w-5" />
                  Retail Store
                </button>
              </div>
            </fieldset>

            {createError && <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{createError}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="h-11 flex-1 rounded-md bg-gradient-to-r from-[#008967] to-[#005656] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? 'Saving...' : editingAdmin ? 'Save Changes' : 'Create Admin Account'}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="h-11 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
