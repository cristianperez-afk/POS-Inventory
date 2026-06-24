import { useEffect, useState } from 'react';
import { Bell, Monitor, Palette, Save, SlidersHorizontal, User } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Page, type StoreBrand } from '../App';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { normalizeStoreSettings, useStoreSettings, type StoreSettingValues } from '../context/StoreSettingsContext';

interface GeneralSettingsProps {
  currentUser: AuthenticatedUser | null;
  storeBrand?: StoreBrand;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
}

type UserPreferenceValues = {
  compactMode: boolean;
  lowStockAlerts: boolean;
  defaultWorkspace: 'pos' | 'inventory' | 'reports';
  appearance: 'system' | 'light' | 'dark';
  accentColor: string;
};

const defaultUserPreferences: UserPreferenceValues = {
  compactMode: false,
  lowStockAlerts: true,
  defaultWorkspace: 'pos',
  appearance: 'system',
  accentColor: '#008967',
};

const defaultWorkspaceOptions: Array<{ value: UserPreferenceValues['defaultWorkspace']; label: string }> = [
  { value: 'pos', label: 'POS' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'reports', label: 'Reports' },
];

const appearanceOptions: Array<{ value: UserPreferenceValues['appearance']; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const restaurantSettings: Array<[keyof StoreSettingValues, string, string]> = [
  ['enable_customer_recommendation', 'Customer Recommendations', 'Previous-customer suggestions while staff types names.'],
  ['enable_table_management', 'Table Management', 'Table selection, status, assignment, and history for dine-in orders.'],
  ['enable_refund', 'Refund Processing', 'Refund actions in paid order workflows.'],
  ['enable_void', 'Void Transactions', 'Void actions for transactions that need cancellation.'],
  ['enable_service_charge', 'Service Charge', 'Service charge line and calculation in order totals.'],
  ['enable_tax', 'VAT', 'VAT line and calculation in order totals.'],
  ['enable_discount', 'Discounts', 'Discount management and staff discount selection.'],
];

const retailSettings: Array<[keyof StoreSettingValues, string, string]> = [
  ['enable_refund', 'Refund Processing', 'Refund actions in paid order workflows.'],
  ['enable_void', 'Void Transactions', 'Void actions for transactions that need cancellation.'],
  ['enable_service_charge', 'Service Fee / Service Charge', 'Service fee line and calculation in order totals.'],
  ['enable_tax', 'VAT', 'VAT line and calculation in order totals.'],
  ['enable_discount', 'Discounts', 'Discount management and staff discount selection.'],
];

function SettingToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  );
}

export function GeneralSettings({ currentUser, storeBrand, onLogout, onNavigate }: GeneralSettingsProps) {
  const { settings: loadedSettings, reload } = useStoreSettings();
  const [settings, setSettings] = useState<StoreSettingValues>(loadedSettings);
  const [userPreferences, setUserPreferences] = useState<UserPreferenceValues>(defaultUserPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const isRestaurant = currentUser?.store_type === 'RESTAURANT';
  const visibleSettings = isRestaurant ? restaurantSettings : retailSettings;
  const userPreferenceStorageKey = currentUser?.id ? `bukolabs-pos-user-settings-${currentUser.id}` : null;

  useEffect(() => {
    setSettings(loadedSettings);
  }, [loadedSettings]);

  useEffect(() => {
    if (!userPreferenceStorageKey) {
      setUserPreferences(defaultUserPreferences);
      return;
    }

    try {
      const savedPreferences = window.localStorage.getItem(userPreferenceStorageKey);
      setUserPreferences(savedPreferences ? { ...defaultUserPreferences, ...JSON.parse(savedPreferences) } : defaultUserPreferences);
    } catch {
      setUserPreferences(defaultUserPreferences);
    }
  }, [userPreferenceStorageKey]);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary', userPreferences.accentColor);
    document.documentElement.style.setProperty('--accent', userPreferences.accentColor);
    document.documentElement.style.setProperty('--ring', userPreferences.accentColor);
    document.documentElement.classList.toggle('dark', userPreferences.appearance === 'dark');

    if (userPreferenceStorageKey) {
      window.localStorage.setItem(userPreferenceStorageKey, JSON.stringify(userPreferences));
    }
  }, [userPreferences, userPreferenceStorageKey]);

  useEffect(() => {
    const load = async () => {
      if (!currentUser?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await reload();
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [currentUser?.id]);

  const saveSettings = async () => {
    if (!currentUser?.id) return;
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/store-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_user_id: currentUser.id,
          enable_customer_recommendation: settings.enable_customer_recommendation,
          enable_table_management: settings.enable_table_management,
          enable_refund: settings.enable_refund,
          enable_void: settings.enable_void,
          enable_service_charge: settings.enable_service_charge,
          service_charge_rate: settings.service_charge_rate,
          enable_tax: settings.enable_tax,
          tax_rate: settings.tax_rate,
          enable_discount: settings.enable_discount,
          enabled_payment_methods: settings.enabled_payment_methods.length > 0 ? settings.enabled_payment_methods : ['Cash'],
        }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data?.message ?? 'Unable to save system configuration.');
      setSettings(normalizeStoreSettings(data));
      await reload();
      setMessage('System configuration saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save system configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPage="general-settings" onNavigate={onNavigate} onLogout={onLogout} isAdmin storeBrand={storeBrand} userName={currentUser?.full_name} storeType={currentUser?.store_type} />
      <div className="flex-1 overflow-auto bg-background">
        <main className="min-h-full p-6 lg:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-primary mb-2">Settings</h1>
              <p className="text-muted-foreground">Account details, preferences, theme, and system configuration.</p>
            </div>
            <button onClick={saveSettings} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              <Save className="h-5 w-5" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {message && <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">{message}</div>}

          <div className="mb-6 grid gap-6 xl:grid-cols-3">
            <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Profile Settings</h2>
                  <p className="text-sm text-muted-foreground">Account details for this session.</p>
                </div>
              </div>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Full Name</span>
                  <input value={currentUser?.full_name ?? ''} readOnly className="w-full rounded-lg border border-border bg-muted px-4 py-2 text-sm text-muted-foreground" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Email</span>
                  <input value={currentUser?.email ?? ''} readOnly className="w-full rounded-lg border border-border bg-muted px-4 py-2 text-sm text-muted-foreground" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Role</span>
                  <input value={currentUser?.role ?? ''} readOnly className="w-full rounded-lg border border-border bg-muted px-4 py-2 text-sm text-muted-foreground" />
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bell className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">User Preferences</h2>
                  <p className="text-sm text-muted-foreground">Saved locally for this user.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
                  <span>
                    <span className="block font-medium">Compact Mode</span>
                    <span className="mt-1 block text-sm text-muted-foreground">Use tighter spacing for dense work screens.</span>
                  </span>
                  <SettingToggle checked={userPreferences.compactMode} onChange={(checked) => setUserPreferences((current) => ({ ...current, compactMode: checked }))} />
                </div>
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
                  <span>
                    <span className="block font-medium">Low Stock Alerts</span>
                    <span className="mt-1 block text-sm text-muted-foreground">Keep inventory warning indicators visible.</span>
                  </span>
                  <SettingToggle checked={userPreferences.lowStockAlerts} onChange={(checked) => setUserPreferences((current) => ({ ...current, lowStockAlerts: checked }))} />
                </div>
                <label className="block rounded-lg border border-border p-4">
                  <span className="mb-2 block font-medium">Default Workspace</span>
                  <select
                    value={userPreferences.defaultWorkspace}
                    onChange={(event) => setUserPreferences((current) => ({ ...current, defaultWorkspace: event.target.value as UserPreferenceValues['defaultWorkspace'] }))}
                    className="w-full rounded-lg border border-border bg-input-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {defaultWorkspaceOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Palette className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Theme Options</h2>
                  <p className="text-sm text-muted-foreground">Appearance settings for this browser.</p>
                </div>
              </div>
              <div className="space-y-4">
                <label className="block rounded-lg border border-border p-4">
                  <span className="mb-2 block font-medium">Appearance</span>
                  <div className="grid grid-cols-3 gap-2">
                    {appearanceOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setUserPreferences((current) => ({ ...current, appearance: option.value }))}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                          userPreferences.appearance === option.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block rounded-lg border border-border p-4">
                  <span className="mb-2 flex items-center gap-2 font-medium">
                    <Monitor className="h-4 w-4" />
                    Accent Color
                  </span>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={userPreferences.accentColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, accentColor: event.target.value }))}
                      className="h-10 w-12 rounded border border-border bg-input-background p-1"
                    />
                    <input
                      value={userPreferences.accentColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, accentColor: event.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-input-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </label>
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <SlidersHorizontal className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">System Configuration</h2>
                <p className="text-sm text-muted-foreground">These {isRestaurant ? 'restaurant POS' : 'retail store'} settings are saved per store and applied to staff POS pages.</p>
              </div>
            </div>

            {loading ? (
              <p className="text-muted-foreground">Loading settings...</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {visibleSettings.map(([key, label, description]) => (
                  <div key={key} className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
                    <span>
                      <span className="block font-medium">{label}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
                    </span>
                    <SettingToggle
                      checked={Boolean(settings[key])}
                      onChange={(checked) => setSettings((current) => ({ ...current, [key]: checked }))}
                    />
                  </div>
                ))}

                {(settings.enable_service_charge || settings.enable_tax) && (
                  <div className="grid gap-4 md:grid-cols-2 lg:col-span-2">
                    {settings.enable_service_charge && (
                      <label className="block rounded-lg border border-border p-4">
                        <span className="mb-2 block font-medium">Service Charge Rate (%)</span>
                        <input
                          type="number"
                          value={settings.service_charge_rate}
                          onChange={(event) => setSettings((current) => ({ ...current, service_charge_rate: Number(event.target.value) }))}
                          className="w-full rounded-lg border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                          min="0"
                          max="100"
                        />
                      </label>
                    )}
                    {settings.enable_tax && (
                      <label className="block rounded-lg border border-border p-4">
                        <span className="mb-2 block font-medium">VAT Rate (%)</span>
                        <input
                          type="number"
                          value={settings.tax_rate}
                          onChange={(event) => setSettings((current) => ({ ...current, tax_rate: Number(event.target.value) }))}
                          className="w-full rounded-lg border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                          min="0"
                          max="100"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
