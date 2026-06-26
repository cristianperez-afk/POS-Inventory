import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { History, LogOut, PanelLeftClose, PanelLeftOpen, Search, StoreIcon, UserPlus } from 'lucide-react';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import type { Page, StoreBrand } from '../App';
import { Sidebar } from './Sidebar';
import { formatManilaFullDateTime } from '../utils/date';
import logoImage from '../../imports/logo1.png';
import { LogoutConfirmDialog } from './LogoutConfirmDialog';

type ActivityLog = {
  id: string | number;
  user_id: number | null;
  user_name: string;
  user_role: string;
  module: string;
  action: string;
  details: string;
  created_at: string;
};

type Props = {
  currentUser: AuthenticatedUser | null;
  storeBrand?: StoreBrand;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
};

const sharedModules = ['All', 'Authentication', 'Staff Accounts', 'Transactions', 'Payments', 'Void & Refund', 'Store Settings'];
const restaurantModules = [...sharedModules.slice(0, -1), 'Restaurant Table Management', 'Store Settings'];
const superadminModules = Array.from(new Set([...sharedModules, ...restaurantModules]));

function roleLabel(role: string | null | undefined, storeType?: string | null) {
  const prefix = storeType === 'RETAIL_STORE' ? 'Retail ' : storeType === 'RESTAURANT' ? 'Restaurant ' : '';
  if (role === 'ADMIN') return `${prefix}Admin`;
  if (role === 'POS_MANAGER' || role === 'POS_ADMIN') return `${prefix}POS Manager`;
  if (role === 'STAFF') return `${prefix}POS Staff`;
  if (role === 'SUPERADMIN') return 'Superadmin';
  return role ?? 'Unknown';
}

function formatDateTime(value: string) {
  const formatted = formatManilaFullDateTime(value);
  return formatted === '-' ? value : formatted;
}

export function ActivityLogPage({ currentUser, storeBrand, onLogout, onNavigate }: Props) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userFilter, setUserFilter] = useState('All');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [actionFilter, setActionFilter] = useState('All');
  const [search, setSearch] = useState('');
  const isSuperadmin = currentUser?.role === 'SUPERADMIN';
  const modules = isSuperadmin ? superadminModules : currentUser?.store_type === 'RESTAURANT' ? restaurantModules : sharedModules;

  useEffect(() => {
    const loadLogs = async () => {
      if (!currentUser?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({ user_id: String(currentUser.id) });
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        if (userFilter !== 'All') params.set('actor_user_id', userFilter);
        if (moduleFilter !== 'All') params.set('module', moduleFilter);
        if (actionFilter !== 'All') params.set('action', actionFilter);
        if (search.trim()) params.set('search', search.trim());

        const routePrefix = isSuperadmin ? 'superadmin' : 'admin';
        const response = await fetch(`${getApiBaseUrl()}/${routePrefix}/activity-logs?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message ?? 'Unable to load activity logs.');
        }

        setLogs(data);
        setError('');
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load activity logs.');
      } finally {
        setLoading(false);
      }
    };

    void loadLogs();
  }, [actionFilter, currentUser?.id, dateFrom, dateTo, isSuperadmin, moduleFilter, search, userFilter]);

  const users = useMemo(() => {
    const unique = new Map<string, { id: string; name: string }>();
    logs.forEach((log) => {
      if (log.user_id) unique.set(String(log.user_id), { id: String(log.user_id), name: log.user_name });
    });
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [logs]);

  const actions = useMemo(() => ['All', ...Array.from(new Set(logs.map((log) => log.action))).sort()], [logs]);

  const content = (
    <ActivityLogContent
      actions={actions}
      actionFilter={actionFilter}
      dateFrom={dateFrom}
      dateTo={dateTo}
      error={error}
      loading={loading}
      logs={logs}
      moduleFilter={moduleFilter}
      modules={modules}
      search={search}
      setActionFilter={setActionFilter}
      setDateFrom={setDateFrom}
      setDateTo={setDateTo}
      setModuleFilter={setModuleFilter}
      setSearch={setSearch}
      setUserFilter={setUserFilter}
      storeType={currentUser?.store_type}
      userFilter={userFilter}
      users={users}
    />
  );

  if (isSuperadmin) {
    return (
      <SuperadminActivityLogLayout onLogout={onLogout} onNavigate={onNavigate}>
        {content}
      </SuperadminActivityLogLayout>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        currentPage="activity-log"
        onNavigate={onNavigate}
        onLogout={onLogout}
        isAdmin={currentUser?.role === 'ADMIN'}
        storeBrand={storeBrand}
        userName={currentUser?.full_name}
        userRole={currentUser?.role}
        storeType={currentUser?.store_type}
        staffType={currentUser?.staff_type}
      />

      {content}
    </div>
  );
}

function ActivityLogContent({
  actions,
  actionFilter,
  dateFrom,
  dateTo,
  error,
  loading,
  logs,
  moduleFilter,
  modules,
  search,
  setActionFilter,
  setDateFrom,
  setDateTo,
  setModuleFilter,
  setSearch,
  setUserFilter,
  storeType,
  userFilter,
  users,
}: {
  actions: string[];
  actionFilter: string;
  dateFrom: string;
  dateTo: string;
  error: string;
  loading: boolean;
  logs: ActivityLog[];
  moduleFilter: string;
  modules: string[];
  search: string;
  setActionFilter: (value: string) => void;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  setModuleFilter: (value: string) => void;
  setSearch: (value: string) => void;
  setUserFilter: (value: string) => void;
  storeType?: string | null;
  userFilter: string;
  users: Array<{ id: string; name: string }>;
}) {
  return (
    <main className="flex-1 overflow-auto p-8">
      <div className="mb-6">
        <h1 className="text-primary mb-2">Activity Log</h1>
        <p className="text-sm text-muted-foreground">Review important POS actions and staff activity.</p>
      </div>

      <div className="mb-5 grid gap-3 rounded-lg border border-border bg-white p-4 md:grid-cols-5">
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm" />
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm" />
        <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm">
          <option value="All">All Users</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm">
          {modules.map((module) => <option key={module} value={module}>{module === 'All' ? 'All Modules' : module}</option>)}
        </select>
        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm">
          {actions.map((action) => <option key={action} value={action}>{action === 'All' ? 'All Actions' : action}</option>)}
        </select>
        <div className="relative md:col-span-5">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity details..." className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm" />
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left">Date & Time</th>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Module</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-muted-foreground">Loading activity logs...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-muted-foreground">No activity logs found.</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-4 py-3">{formatDateTime(log.created_at)}</td>
                <td className="px-4 py-3">{log.user_name}</td>
                <td className="px-4 py-3">{roleLabel(log.user_role, storeType)}</td>
                <td className="px-4 py-3">{log.module}</td>
                <td className="px-4 py-3">{log.action}</td>
                <td className="whitespace-pre-line px-4 py-3 text-slate-700">{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function SuperadminActivityLogLayout({
  children,
  onLogout,
  onNavigate,
}: {
  children: ReactNode;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const goToDashboard = () => onNavigate('superadmin-dashboard');

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#007a5e]">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex flex-col text-white transition-[width] duration-300 ease-in-out ${isSidebarCollapsed ? 'w-20 overflow-visible' : 'w-80 overflow-y-auto no-scrollbar'}`}
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
            onClick={goToDashboard}
            className={`mb-4 flex h-[52px] w-full items-center rounded-lg border border-transparent text-white transition hover:bg-[#007a5e]/15 hover:text-slate-100 ${
              isSidebarCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
            }`}
          >
            <StoreIcon className="h-6 w-6 shrink-0" strokeWidth={1.8} />
            <span className={`overflow-hidden whitespace-nowrap text-base font-medium transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'}`}>
              {!isSidebarCollapsed && 'Stores'}
            </span>
          </button>
          <button
            type="button"
            onClick={goToDashboard}
            className={`flex h-[52px] w-full items-center rounded-lg border border-transparent text-white transition hover:bg-[#007a5e]/15 hover:text-slate-100 ${
              isSidebarCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
            }`}
          >
            <UserPlus className="h-6 w-6 shrink-0" strokeWidth={1.8} />
            <span className={`overflow-hidden whitespace-nowrap text-base font-medium transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'}`}>
              {!isSidebarCollapsed && 'Admin Accounts'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('activity-log')}
            className={`mt-4 flex h-[52px] w-full items-center rounded-lg border border-[#00a7a5]/25 text-white transition ${
              isSidebarCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
            }`}
            style={{ background: 'linear-gradient(135deg, #008967 0%, #007a5e 100%)', boxShadow: '0 0 18px rgba(0,167,165,0.16)' }}
          >
            <History className="h-6 w-6 shrink-0" strokeWidth={1.8} />
            <span className={`overflow-hidden whitespace-nowrap text-base font-semibold transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'}`}>
              {!isSidebarCollapsed && 'Activity Log'}
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

      <div className={`min-h-screen transition-[padding] duration-300 ease-in-out ${isSidebarCollapsed ? 'pl-20' : 'pl-80'}`}>
        {children}
      </div>

      <LogoutConfirmDialog
        isOpen={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          onLogout();
        }}
      />
    </div>
  );
}
