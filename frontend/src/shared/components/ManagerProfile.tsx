import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Mail, ShieldCheck, Store, UserRound, type LucideIcon } from 'lucide-react';
import { Page, type StoreBrand } from '../App';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { adminApi, type ManagerProfileData } from '../api/adminApi';
import { Sidebar } from './Sidebar';

interface ManagerProfileProps {
  currentUser: AuthenticatedUser | null;
  storeBrand?: StoreBrand;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
  onUserUpdate?: (updates: Partial<AuthenticatedUser>) => void;
}

export function ManagerProfile({ currentUser, storeBrand, onLogout, onNavigate, onUserUpdate }: ManagerProfileProps) {
  const [profile, setProfile] = useState<ManagerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showVoidPin, setShowVoidPin] = useState(true);
  const [generatingPin, setGeneratingPin] = useState(false);

  const saveUniquePinToSession = (uniquePin: string) => {
    onUserUpdate?.({ void_pin: uniquePin });

    try {
      const savedUser = window.sessionStorage.getItem('bukolabs-pos-current-user');
      if (savedUser) {
        window.sessionStorage.setItem('bukolabs-pos-current-user', JSON.stringify({ ...JSON.parse(savedUser), void_pin: uniquePin }));
      }
    } catch {
      // Session refresh is best-effort; current state still updates through onUserUpdate.
    }
  };

  const generateUniquePin = async () => {
    if (!currentUser?.id) return null;

    setGeneratingPin(true);
    setError('');

    try {
      const data = await adminApi.generatePosManagerUniquePin();
      const uniquePin = String(data?.void_pin ?? '');
      if (!uniquePin) {
        throw new Error('Unable to generate Unique PIN.');
      }

      setProfile((current) => ({
        ...(current ?? currentUser),
        void_pin: uniquePin,
        void_pin_configured: true,
      }) as ManagerProfileData);
      saveUniquePinToSession(uniquePin);
      return uniquePin;
    } catch {
      setError('Cannot generate Unique PIN yet. Please try again.');
      return null;
    } finally {
      setGeneratingPin(false);
    }
  };

  useEffect(() => {
    const loadProfile = async () => {
      if (!currentUser?.id) {
        setLoading(false);
        return;
      }

      try {
        const data = await adminApi.getPosManagerProfile();
        setProfile(data);
        setError('');
        if (!data?.void_pin?.trim() && !currentUser?.void_pin?.trim()) {
          await generateUniquePin();
        }
      } catch {
        setProfile(null);
        if (!currentUser?.void_pin) {
          await generateUniquePin();
        }
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, [currentUser?.id]);

  const displayProfile = profile ?? currentUser;
  const roleLabel = getRoleLabel(displayProfile?.role);
  const voidPin = profile?.void_pin?.trim() || currentUser?.void_pin?.trim() || '';

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        currentPage="manager-profile"
        onNavigate={onNavigate}
        onLogout={onLogout}
        isAdmin={false}
        storeBrand={storeBrand}
        userName={currentUser?.full_name}
        userRole={currentUser?.role}
        storeType={currentUser?.store_type}
        staffType={currentUser?.staff_type}
      />

      <main className="min-w-0 flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-slate-950">Manager Profile</h1>
            <p className="mt-1 text-sm text-slate-500">Account details and Manager PIN.</p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <UserRound className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">{displayProfile?.full_name ?? 'Manager'}</h2>
                  <p className="text-sm text-slate-500">{roleLabel}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow icon={Mail} label="Email" value={displayProfile?.email ?? '-'} />
                <InfoRow icon={ShieldCheck} label="Role" value={roleLabel} />
                <InfoRow icon={Store} label="Store" value={displayProfile?.store_name ?? storeBrand?.name ?? '-'} />
                <InfoRow icon={UserRound} label="Status" value={profile?.status ?? 'ACTIVE'} />
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-950">Unique PIN</h2>
                  <p className="text-xs text-slate-500">Used by managers to authorize order cancellations, refunds, and voids.</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                {loading ? (
                  <p className="text-sm text-slate-500">Loading PIN...</p>
                ) : voidPin ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-2xl font-semibold tracking-[0.25em] text-slate-950">
                      {showVoidPin ? voidPin : '*'.repeat(voidPin.length)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowVoidPin((current) => !current)}
                      className="rounded-md p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"
                      aria-label={showVoidPin ? 'Hide Unique PIN' : 'Show Unique PIN'}
                      title={showVoidPin ? 'Hide Unique PIN' : 'Show Unique PIN'}
                    >
                      {showVoidPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-amber-700">Unique PIN has not been generated yet.</p>
                    <button
                      type="button"
                      onClick={generateUniquePin}
                      disabled={generatingPin}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                    >
                      {generatingPin ? 'Generating...' : 'Generate Unique PIN'}
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="break-words text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function getRoleLabel(role: string | null | undefined) {
  if (role === 'POS_ADMIN') return 'POS Manager';
  if (role === 'POS_MANAGER') return 'POS Manager';
  if (role === 'ADMIN') return 'Admin';
  return role ?? 'Manager';
}
