import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Bell, History, LogOut, Palette, PanelLeftClose, PanelLeftOpen, Save, Settings, StoreIcon, User, UserPlus } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Page, type StoreBrand } from '../App';
import type { AuthenticatedUser } from '../../auth/types/auth';
import logoImage from '../../imports/logo1.png';
import { LogoutConfirmDialog } from './LogoutConfirmDialog';
import { getApiBaseUrl } from '../../auth/services/auth';
import {
  applyUserPreferences,
  applyThemePreset,
  defaultUserPreferences,
  fromRemoteThemePreferences,
  fromRemoteUserPreferences,
  loadUserPreferences,
  mergeUserPreferencesWithTheme,
  normalizeUserPreferences,
  saveUserPreferences,
  themePresets,
  toRemoteThemePreferences,
  toRemoteUserPreferences,
  type ThemeScope,
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
  const [userPreferences, setUserPreferences] = useState<UserPreferenceValues>(defaultUserPreferences);
  const [personalPreferences, setPersonalPreferences] = useState<UserPreferenceValues>(defaultUserPreferences);
  const [storePreferences, setStorePreferences] = useState<UserPreferenceValues>(defaultUserPreferences);
  const [themeScope, setThemeScope] = useState<ThemeScope>('personal');
  const [canManageStoreTheme, setCanManageStoreTheme] = useState(false);
  // Last saved preferences (what's persisted to localStorage / shown on every
  // other page). userPreferences is the live-edited draft -- it's applied to
  // THIS document immediately for live preview, but only written to
  // localStorage (and kept) once Save is clicked. Undoing/leaving without
  // saving re-applies appliedPreferences so the preview doesn't stick.
  const [appliedPreferences, setAppliedPreferences] = useState<UserPreferenceValues>(defaultUserPreferences);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const canChooseDefaultWorkspace = currentUser?.role === 'ADMIN';
  const canUseInventoryPreferences = currentUser?.role !== 'SUPERADMIN';
  const canEditStoreTheme = canManageStoreTheme && currentUser?.role !== 'STAFF';
  const hasPreferenceChanges = JSON.stringify(userPreferences) !== JSON.stringify(appliedPreferences);
  const hasUnsavedChanges = hasPreferenceChanges;

  useEffect(() => {
    if (!currentUser?.id) return;

    const cached = loadUserPreferences(currentUser.id);
    setUserPreferences(cached);
    setAppliedPreferences(cached);
    setPersonalPreferences(cached);
    setStorePreferences(cached);

    let cancelled = false;
    const loadSettings = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/theme-preferences`);
        if (!response.ok) throw new Error('Unable to load settings.');
        const data = await response.json();
        if (cancelled) return;

        const storeTheme = fromRemoteThemePreferences(data.store_theme);
        const effectiveTheme = fromRemoteThemePreferences(data.effective_theme);
        const personal = fromRemoteUserPreferences(data.user_preferences) ?? mergeUserPreferencesWithTheme(cached, effectiveTheme);
        const store = mergeUserPreferencesWithTheme(personal, storeTheme);

        setCanManageStoreTheme(Boolean(data.can_manage_store_theme));
        setPersonalPreferences(personal);
        setStorePreferences(store);
        setThemeScope('personal');
        setUserPreferences(personal);
        setAppliedPreferences(personal);
        applyUserPreferences(personal);
        saveUserPreferences(currentUser.id, personal);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Unable to load settings.');
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
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

  const saveSettings = async () => {
    if (!currentUser?.id) return false;
    setSaving(true);
    setMessage('');

    try {
      applyUserPreferences(userPreferences);
      const endpoint = themeScope === 'store' ? 'store' : 'personal';
      const body = themeScope === 'store'
        ? toRemoteThemePreferences(userPreferences)
        : toRemoteUserPreferences(userPreferences);
      const response = await fetch(`${getApiBaseUrl()}/admin/theme-preferences/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'Unable to save settings.');

      if (themeScope === 'store') {
        const nextStore = mergeUserPreferencesWithTheme(personalPreferences, fromRemoteThemePreferences(data));
        setStorePreferences(nextStore);
      } else {
        const nextPersonal = fromRemoteUserPreferences(data) ?? normalizeUserPreferences(userPreferences);
        setPersonalPreferences(nextPersonal);
        saveUserPreferences(currentUser.id, nextPersonal);
      }
      setAppliedPreferences(userPreferences);

      setMessage(themeScope === 'store' ? 'Store theme saved for this store.' : 'Personal settings saved.');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save settings.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const resetTheme = async () => {
    if (!currentUser?.id) return;
    setSaving(true);
    setMessage('');

    try {
      const endpoint = themeScope === 'store' ? 'store' : 'personal';
      const response = await fetch(`${getApiBaseUrl()}/admin/theme-preferences/${endpoint}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'Unable to reset theme.');

      const storeTheme = fromRemoteThemePreferences(data.store_theme);
      const effectiveTheme = fromRemoteThemePreferences(data.effective_theme);
      const personal = fromRemoteUserPreferences(data.user_preferences) ?? mergeUserPreferencesWithTheme(personalPreferences, effectiveTheme);
      const store = mergeUserPreferencesWithTheme(personal, storeTheme);

      setPersonalPreferences(personal);
      setStorePreferences(store);
      const next = themeScope === 'store' ? store : personal;
      setUserPreferences(next);
      setAppliedPreferences(next);
      applyUserPreferences(next);
      saveUserPreferences(currentUser.id, personal);

      setMessage(
        themeScope === 'store'
          ? 'Store theme reset to default for every account without a personal override.'
          : 'Personal theme reset. Now using the store theme.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reset theme.');
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => {
    setUserPreferences(appliedPreferences);
    // setUserPreferences above triggers the live-preview effect on next
    // render, but apply synchronously too so the revert is instant even if
    // discardChanges is immediately followed by navigating away.
    applyUserPreferences(appliedPreferences);
  };

  const changeThemeScope = (scope: ThemeScope) => {
    const next = scope === 'store' ? storePreferences : personalPreferences;
    setThemeScope(scope);
    setUserPreferences(next);
    setAppliedPreferences(next);
    applyUserPreferences(next);
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

  const content = (
    <SettingsContent
      canChooseDefaultWorkspace={canChooseDefaultWorkspace}
      canUseInventoryPreferences={canUseInventoryPreferences}
      currentUser={currentUser}
      discardChanges={discardChanges}
      handleSaveAndProceed={handleSaveAndProceed}
      handleUndoAndProceed={handleUndoAndProceed}
      hasUnsavedChanges={hasUnsavedChanges}
      message={message}
      pendingAction={pendingAction}
      resetTheme={resetTheme}
      saveSettings={saveSettings}
      saving={saving}
      setPendingAction={setPendingAction}
      setUserPreferences={setUserPreferences}
      themeScope={themeScope}
      canEditStoreTheme={canEditStoreTheme}
      changeThemeScope={changeThemeScope}
      userPreferences={userPreferences}
    />
  );

  if (currentUser?.role === 'SUPERADMIN') {
    return (
      <SuperadminSettingsLayout
        onLogout={() => requestAction({ type: 'logout' })}
        onNavigate={(page) => requestAction({ type: 'navigate', page })}
      >
        {content}
      </SuperadminSettingsLayout>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        currentPage="general-settings"
        onNavigate={(page) => requestAction({ type: 'navigate', page })}
        onLogout={() => requestAction({ type: 'logout' })}
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

function SettingsContent({
  canChooseDefaultWorkspace,
  canUseInventoryPreferences,
  currentUser,
  discardChanges,
  handleSaveAndProceed,
  handleUndoAndProceed,
  hasUnsavedChanges,
  message,
  pendingAction,
  resetTheme,
  saveSettings,
  saving,
  setPendingAction,
  setUserPreferences,
  themeScope,
  canEditStoreTheme,
  changeThemeScope,
  userPreferences,
}: {
  canChooseDefaultWorkspace: boolean;
  canUseInventoryPreferences: boolean;
  currentUser: AuthenticatedUser | null;
  discardChanges: () => void;
  handleSaveAndProceed: () => void;
  handleUndoAndProceed: () => void;
  hasUnsavedChanges: boolean;
  message: string;
  pendingAction: PendingAction | null;
  resetTheme: () => Promise<void>;
  saveSettings: () => Promise<boolean>;
  saving: boolean;
  setPendingAction: (action: PendingAction | null) => void;
  setUserPreferences: Dispatch<SetStateAction<UserPreferenceValues>>;
  themeScope: ThemeScope;
  canEditStoreTheme: boolean;
  changeThemeScope: (scope: ThemeScope) => void;
  userPreferences: UserPreferenceValues;
}) {
  const isSuperadmin = currentUser?.role === 'SUPERADMIN';

  return (
    <>
      <div className="flex-1 overflow-auto bg-background">
      <main className="min-h-full p-6 lg:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-primary mb-2">Settings</h1>
              <p className="text-muted-foreground">Account details, preferences, and theme.</p>
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
                  <p className="text-sm text-muted-foreground">Personal settings saved for this account.</p>
                </div>
              </div>
              {themeScope === 'store' && (
                <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  Switch to Personal scope to edit compact mode, stock alerts, and default workspace.
                </div>
              )}
              <div className={`divide-y divide-border ${themeScope === 'store' ? 'pointer-events-none opacity-50' : ''}`}>
                <SettingRow label="Compact Mode" description="Use tighter spacing for dense work screens.">
                  <SettingToggle checked={userPreferences.compactMode} onChange={(checked) => setUserPreferences((current) => ({ ...current, compactMode: checked }))} />
                </SettingRow>
                {canUseInventoryPreferences && (
                  <SettingRow label="Low Stock Alerts" description="Keep inventory warning indicators visible.">
                    <SettingToggle checked={userPreferences.lowStockAlerts} onChange={(checked) => setUserPreferences((current) => ({ ...current, lowStockAlerts: checked }))} />
                  </SettingRow>
                )}
                {canChooseDefaultWorkspace && (
                  <SettingRow label="Default Workspace" description="Admin landing page shown right after login.">
                    <select
                      value={userPreferences.defaultWorkspace}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, defaultWorkspace: event.target.value as UserPreferenceValues['defaultWorkspace'] }))}
                      className="rounded-lg border border-border bg-input-background px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {defaultWorkspaceOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </SettingRow>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Palette className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Theme Options</h2>
                  <p className="text-sm text-muted-foreground">{themeScope === 'store' ? 'Shared appearance for every account in this store.' : 'Your personal appearance preference for this account.'}</p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={resetTheme}
                  className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                >
                  {themeScope === 'store' ? 'Reset Store Theme' : 'Reset Personal Theme'}
                </button>
              </div>
              <div className="divide-y divide-border">
                <SettingRow label="Theme Scope" description={canEditStoreTheme ? "Personal affects only you. Store applies to every account in this store unless they use a personal override." : "Staff and cashier accounts can only change their own personal preference."}>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => changeThemeScope('personal')}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        themeScope === 'personal' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                      }`}
                    >
                      Personal
                    </button>
                    <button
                      type="button"
                      onClick={() => changeThemeScope('store')}
                      disabled={!canEditStoreTheme}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        themeScope === 'store' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                      }`}
                    >
                      Store
                    </button>
                  </div>
                </SettingRow>
                <SettingRow label="Customization Level" description="Basic uses preset themes. Advanced lets you choose exact colors.">
                  <div className="grid grid-cols-2 gap-2">
                    {(['basic', 'advanced'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setUserPreferences((current) => ({ ...current, themeMode: mode }))}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${
                          userPreferences.themeMode === mode ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </SettingRow>
                {userPreferences.themeMode === 'basic' && (
                  <SettingRow label="Theme Preset" description="Choose a complete color set.">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {themePresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setUserPreferences((current) => applyThemePreset(current, preset.id))}
                          className={`overflow-hidden rounded-lg border text-sm font-medium transition ${
                            userPreferences.themePreset === preset.id ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <span className="flex h-10 w-full">
                            <span className="flex-1" style={{ backgroundColor: preset.values.primaryColor }} />
                            <span className="flex-1" style={{ backgroundColor: preset.values.secondaryColor }} />
                            <span className="flex-1" style={{ backgroundColor: preset.values.sidebarColor }} />
                          </span>
                          <span className={`block px-3 py-2 ${userPreferences.themePreset === preset.id ? 'text-primary' : 'text-foreground'}`}>
                            {preset.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </SettingRow>
                )}
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
                {userPreferences.themeMode === 'advanced' && (
                <>
                <SettingRow label="Primary Color" description={isSuperadmin ? "Buttons, links, highlights, and the sidebar." : "Buttons, links, highlights, and the sidebar across POS and Inventory (retail and restaurant)."}>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={userPreferences.primaryColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, themeMode: 'advanced', themePreset: 'custom', primaryColor: event.target.value }))}
                      className="h-10 w-12 rounded border border-border bg-input-background p-1"
                    />
                    <input
                      value={userPreferences.primaryColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, themeMode: 'advanced', themePreset: 'custom', primaryColor: event.target.value }))}
                      className="w-32 rounded-lg border border-border bg-input-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </SettingRow>
                <SettingRow label="Secondary Color" description={isSuperadmin ? "The second color used in primary button and active navigation gradients." : "The second color used in primary button and active navigation gradients. Doesn't affect unrelated secondary buttons/badges elsewhere."}>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={userPreferences.secondaryColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, themeMode: 'advanced', themePreset: 'custom', secondaryColor: event.target.value }))}
                      className="h-10 w-12 rounded border border-border bg-input-background p-1"
                    />
                    <input
                      value={userPreferences.secondaryColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, themeMode: 'advanced', themePreset: 'custom', secondaryColor: event.target.value }))}
                      className="w-32 rounded-lg border border-border bg-input-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </SettingRow>
                <SettingRow label="Sidebar Color" description="The base color at the top of the sidebar gradient. Reset restores the original dark navy.">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={userPreferences.sidebarColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, themeMode: 'advanced', themePreset: 'custom', sidebarColor: event.target.value }))}
                      className="h-10 w-12 rounded border border-border bg-input-background p-1"
                    />
                    <input
                      value={userPreferences.sidebarColor}
                      onChange={(event) => setUserPreferences((current) => ({ ...current, themeMode: 'advanced', themePreset: 'custom', sidebarColor: event.target.value }))}
                      className="w-32 rounded-lg border border-border bg-input-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </SettingRow>
                </>
                )}
              </div>
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
    </>
  );
}

function SuperadminSettingsLayout({
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex flex-col text-white transition-[width] duration-300 ease-in-out ${isSidebarCollapsed ? 'w-20 overflow-visible' : 'w-80 overflow-y-auto no-scrollbar'}`}
        style={{ background: 'linear-gradient(180deg, var(--sidebar) 0%, var(--primary) 100%)' }}
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
          {[
            { icon: StoreIcon, label: 'Stores', page: 'superadmin-dashboard' as Page },
            { icon: UserPlus, label: 'Admin Accounts', page: 'superadmin-dashboard' as Page },
            { icon: History, label: 'Activity Log', page: 'activity-log' as Page },
            { icon: Settings, label: 'Settings', page: 'general-settings' as Page, active: true },
          ].map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              onClick={() => onNavigate(item.page)}
              className={`flex h-[52px] w-full items-center rounded-lg border transition ${index > 0 ? 'mt-4' : ''} ${
                isSidebarCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
              } ${item.active ? 'border-primary/25 text-white' : 'border-transparent text-white hover:bg-primary/15 hover:text-slate-100'}`}
              style={item.active ? { background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary-accent) 100%)', boxShadow: '0 0 18px color-mix(in srgb, var(--primary) 35%, transparent)' } : undefined}
            >
              <item.icon className="h-6 w-6 shrink-0" strokeWidth={1.8} />
              <span className={`overflow-hidden whitespace-nowrap text-base transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'} ${item.active ? 'font-semibold' : 'font-medium'}`}>
                {!isSidebarCollapsed && item.label}
              </span>
            </button>
          ))}
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
