import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import type { Page, StoreBrand } from '../App';
import { Sidebar } from './Sidebar';
import { formatManilaFullDateTime } from '../utils/date';

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
  const modules = currentUser?.store_type === 'RESTAURANT' ? restaurantModules : sharedModules;

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

        const response = await fetch(`${getApiBaseUrl()}/admin/activity-logs?${params.toString()}`);
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
  }, [actionFilter, currentUser?.id, dateFrom, dateTo, moduleFilter, search, userFilter]);

  const users = useMemo(() => {
    const unique = new Map<string, { id: string; name: string }>();
    logs.forEach((log) => {
      if (log.user_id) unique.set(String(log.user_id), { id: String(log.user_id), name: log.user_name });
    });
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [logs]);

  const actions = useMemo(() => ['All', ...Array.from(new Set(logs.map((log) => log.action))).sort()], [logs]);

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
                  <td className="px-4 py-3">{roleLabel(log.user_role, currentUser?.store_type)}</td>
                  <td className="px-4 py-3">{log.module}</td>
                  <td className="px-4 py-3">{log.action}</td>
                  <td className="whitespace-pre-line px-4 py-3 text-slate-700">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
