import { ShoppingBag } from 'lucide-react';
import { Sidebar } from '../../shared/components/Sidebar';
import { Page, type StoreBrand } from '../../shared/App';
import type { StaffType, StoreType } from '../../auth/types/auth';
import { useState } from 'react';
import { LogoutConfirmDialog } from '../../shared/components/LogoutConfirmDialog';

interface RetailDashboardProps {
  title?: string;
  roleLabel?: string;
  currentUser?: {
    full_name: string;
    email: string;
    role: string;
    store_type: string | null;
    staff_type?: string | null;
    store_name: string | null;
  } | null;
  onLogout: () => void;
  onNavigate?: (page: Page) => void;
  storeBrand?: StoreBrand;
  userName?: string | null;
  storeType?: StoreType;
  staffType?: StaffType;
}

export function RetailDashboard({
  title = 'Retail Dashboard',
  roleLabel = 'Retail Admin',
  currentUser,
  onLogout,
  onNavigate,
  storeBrand,
  userName,
  storeType = 'RETAIL_STORE',
  staffType,
}: RetailDashboardProps) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  if (onNavigate) {
    return (
      <div className="flex h-screen">
        <Sidebar
          currentPage="retail-pos-dashboard"
          onNavigate={onNavigate}
          onLogout={onLogout}
          storeBrand={storeBrand}
          userName={userName ?? currentUser?.full_name}
          storeType={storeType}
          staffType={staffType}
        />

        <div className="flex-1 overflow-auto bg-background">
          <main className="p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-primary">{title}</h1>
                <p className="text-sm text-muted-foreground">{roleLabel}</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm text-muted-foreground">Store</p>
              <h2 className="mt-2 text-xl text-primary">{storeBrand?.name ?? currentUser?.store_name ?? 'Retail Store'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Signed in as {userName ?? currentUser?.full_name ?? 'Retail Staff'}</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-sky-300/80">{roleLabel}</p>
            <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
            <p className="mt-2 text-xl font-semibold text-sky-200">Retail Module Coming Soon</p>
            <p className="mt-2 text-sm text-slate-300">This placeholder is shown while the retail UI is being built.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="rounded-xl border border-[#00a7a5]/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Sign Out
          </button>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-sm text-slate-400">User</p>
            <p className="mt-2 font-semibold">{currentUser?.full_name ?? 'Retail User'}</p>
            <p className="text-sm text-slate-300">{currentUser?.email ?? 'No email available'}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-sm text-slate-400">Access</p>
            <p className="mt-2 font-semibold">{currentUser?.role ?? roleLabel}</p>
            <p className="text-sm text-slate-300">{currentUser?.store_type ?? 'RETAIL_STORE'} {currentUser?.staff_type ? `- ${currentUser.staff_type}` : ''}</p>
          </div>
        </div>
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
