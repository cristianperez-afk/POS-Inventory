import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Palette, Save, SlidersHorizontal, User } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Page, type StoreBrand } from '../App';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { normalizeStoreSettings, useStoreSettings, type StoreSettingValues } from '../context/StoreSettingsContext';
import {
  applyUserPreferences,
  defaultUserPreferences,
  loadUserPreferences,
  saveUserPreferences,
  type UserPreferenceValues,
} from '../utils/themePreferences';

interface GeneralSettingsProps {
  currentUser: AuthenticatedUser | null;
  storeBrand?: StoreBrand;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
}

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

export function SettingToggle({
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

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border py-4 last:border-b-0">
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="mt-1 block text-sm text-muted-foreground">{description}</span>}
      </span>
      {children}
    </div>
  );
}

type PendingAction = { type: 'navigate'; page: Page } | { type: 'logout' };

export function GeneralSettings({ currentUser, storeBrand, onLogout, onNavigate }: GeneralSettingsProps) {
  const { settings: loadedSettings, reload } = useStoreSettings();
  const [settings, setSettings] = useState<StoreSettingValues>(loadedSettings);
  const [userPreferences, setUserPreferences] = useState<UserPreferenceValues>(defaultUserPreferences);
  // Last saved preferences (what's persisted to localStorage / shown on every
  // other page). userPreferences is the live-edited draft -- it's applied to
  // THIS document immediately for live preview, but only written to
  // localStorage (and kept) once Save is clicked. Undoing/leaving without
  // saving re-applies appliedPreferences so the preview doesn't stick.
  const [appliedPreferences, setAppliedPreferences] = useState<UserPreferenceValues>(defaultUserPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const isRestaurant = currentUser?.store_type === 'RESTAURANT';
  const visibleSettings = isRestaurant ? restaurantSettings : retailSettings;
  const hasUnsavedChanges =
    JSON.stringify(settings) !== JSON.stringify(loadedSettings) || JSON.stringify(userPreferences) !== JSON.stringify(appliedPreferences);

  useEffect(() => {
    setSettings(loadedSettings);
  }, [loadedSettings]);

  useEffect(() => {
    const loaded = loadUserPreferences(currentUser?.id);
    setUserPreferences(loaded);
    setAppliedPreferences(loaded);
  }, [currentUser?.id]);

  // Live preview: every edit (color picker, appearance, Reset to Default)
  // repaints the app immediately. Nothing here writes to localStorage --
  // that only happens in saveSettings(), once the user confirms.
  useEffect(() => {
    applyUserPreferences(userPreferences);
  }, [userPreferences]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

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
    if (!currentUser?.id) return false;
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

      if (!response.ok) throw new Error(data?.message ?? 'Unable to save settings.');
      setSettings(normalizeStoreSettings(data));
      await reload();

      applyUserPreferences(userPreferences);
      saveUserPreferences(currentUser.id, userPreferences);
      setAppliedPreferences(userPreferences);

      setMessage('Settings saved.');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save settings.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => {
    setSettings(loadedSettings);
    setUserPreferences(appliedPreferences);
    // setUserPreferences above triggers the live-preview effect on next
    // render, but apply synchronously too so the revert is instant even if
    // discardChanges is immediately followed by navigating away.
    applyUserPreferences(appliedPreferences);
  };

  const runPendingAction = (action: PendingAction) => {
    if (action.type === 'navigate') onNavigate(action.page);
    else onLogout();
  };

  const requestAction = (action: PendingAction) => {
    if (hasUnsavedChanges) {
      setPendingAction(action);
    } else {
      runPendingAction(action);
    }
  };

  const handleUndoAndProceed = () => {
    discardChanges();
    if (pendingAction) runPendingAction(pendingAction);
    setPendingAction(null);
  };

  const handleSaveAndProceed = async () => {
    const ok = await saveSettings();
    if (ok && pendingAction) runPendingAction(pendingAction);
    if (ok) setPendingAction(null);
  };

  return (
    <div className="flex h-screen">
      <Sidebar
        currentPage="general-settings"
        onNavigate={(page) => requestAction({ type: 'navigate', page })}
        onLogout={() => requestAction({ type: 'logout' })}
        isAdmin
        storeBrand={storeBrand}
        userName={currentUser?.full_name}
        storeType={currentUser?.store_type}
      />
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

          {hasUnsavedChanges && !pendingAction && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <span className="font-medium">You have unsaved changes.</span>
              <div className="flex gap-2">
                <button onClick={discardChanges} className="rounded-lg border border-amber-300 px-3 py-1.5 font-medium hover:bg-amber-100">
                  Undo
                </button>
                <button onClick={saveSettings} disabled={saving} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {message && <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">{message}</div>}

          <div className="flex flex-col gap-6">
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
              <div className="divide-y divide-border">
                <SettingRow label="Full Name" description="">
                  <input value={currentUser?.full_name ?? ''} readOnly className="w-full max-w-sm rounded-lg border border-border bg-muted px-4 py-2 text-sm text-muted-foreground" />
                </SettingRow>
                <SettingRow label="Email" description="">
                  <input value={currentUser?.email ?? ''} readOnly className="w-full max-w-sm rounded-lg border border-border bg-muted px-4 py-2 text-sm text-muted-foreground" />
                </SettingRow>
                <SettingRow label="Role" description="">
                  <input value={currentUser?.role ?? ''} readOnly className="w-full max-w-sm rounded-lg border border-border bg-muted px-4 py-2 text-sm text-muted-foreground" />
                </SettingRow>
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
              <div className="divide-y divide-border">
                <SettingRow label="Compact Mode" description="Use tighter spacing for dense work screens.">
                  <SettingToggle checked={userPreferences.compactMode} onChange={(checked) => setUserPreferences((current) => ({ ...current, compactMode: checked }))} />
                </SettingRow>
                <SettingRow label="Low Stock Alerts" description="Keep inventory warning indicators visible.">
                  <SettingToggle checked={userPreferences.lowStockAlerts} onChange={(checked) => setUserPreferences((current) => ({ ...current, lowStockAlerts: checked }))} />
                </SettingRow>
                <SettingRow label="Default Workspace" description="Page shown right after login.">
                  <select
                    value={userPreferences.defaultWorkspace}
                    onChange={(event) => setUserPreferences((current) => ({ ...current, defaultWorkspace: event.target.value as UserPreferenceValues['defaultWorkspace'] }))}
                    className="rounded-lg border border-border bg-input-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {defaultWorkspaceOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </SettingRow>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Palette className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Theme Options</h2>
                  <p className="text-sm text-muted-foreground">Appearance and brand colors for this browser.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUserPreferences((current) => ({
                    ...current,
                    appearance: defaultUserPreferences.appearance,
                    primaryColor: defaultUserPreferences.primaryColor,
                    secondaryColor: defaultUserPreferences.secondaryColor,
                  }))}
                  className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Reset to Default
                </button>
              </div>
              <div className="divide-y divide-border">
                <SettingRow label="Appearance" description="System follows your device's light/dark setting.">
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
                </SettingRow>
                <SettingRow label="Primary Color" description="Buttons, links, highlights, and the sidebar across POS and Inventory (retail and restaurant).">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={userPreferences.primaryColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, primaryColor: event.target.value }))}
                      className="h-10 w-12 rounded border border-border bg-input-background p-1"
                    />
                    <input
                      value={userPreferences.primaryColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, primaryColor: event.target.value }))}
                      className="w-32 rounded-lg border border-border bg-input-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </SettingRow>
                <SettingRow label="Secondary Color" description="The gradient pairing on primary buttons and the sidebar across POS and Inventory. Doesn't affect unrelated secondary buttons/badges elsewhere.">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={userPreferences.secondaryColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, secondaryColor: event.target.value }))}
                      className="h-10 w-12 rounded border border-border bg-input-background p-1"
                    />
                    <input
                      value={userPreferences.secondaryColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, secondaryColor: event.target.value }))}
                      className="w-32 rounded-lg border border-border bg-input-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </SettingRow>
              </div>
            </section>

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
                <div className="divide-y divide-border">
                  {visibleSettings.map(([key, label, description]) => (
                    <SettingRow key={key} label={label} description={description}>
                      <SettingToggle
                        checked={Boolean(settings[key])}
                        onChange={(checked) => setSettings((current) => ({ ...current, [key]: checked }))}
                      />
                    </SettingRow>
                  ))}

                  {settings.enable_service_charge && (
                    <SettingRow label="Service Charge Rate (%)" description="Applied to every order total.">
                      <input
                        type="number"
                        value={settings.service_charge_rate}
                        onChange={(event) => setSettings((current) => ({ ...current, service_charge_rate: Number(event.target.value) }))}
                        className="w-32 rounded-lg border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                        min="0"
                        max="100"
                      />
                    </SettingRow>
                  )}

                  {settings.enable_tax && (
                    <SettingRow label="VAT Rate (%)" description="Applied to every order total.">
                      <input
                        type="number"
                        value={settings.tax_rate}
                        onChange={(event) => setSettings((current) => ({ ...current, tax_rate: Number(event.target.value) }))}
                        className="w-32 rounded-lg border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                        min="0"
                        max="100"
                      />
                    </SettingRow>
                  )}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Unsaved changes</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You have unsaved settings changes. Save them, undo them, or continue editing before leaving this page.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setPendingAction(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Continue Editing
              </button>
              <button
                onClick={handleUndoAndProceed}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                Undo Changes
              </button>
              <button
                onClick={handleSaveAndProceed}
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
