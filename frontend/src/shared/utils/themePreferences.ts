export type UserPreferenceValues = {
  compactMode: boolean;
  lowStockAlerts: boolean;
  defaultWorkspace: 'pos' | 'inventory' | 'reports';
  appearance: 'system' | 'light' | 'dark';
  primaryColor: string;
  secondaryColor: string;
  sidebarColor: string;
};

export const defaultUserPreferences: UserPreferenceValues = {
  compactMode: false,
  lowStockAlerts: true,
  defaultWorkspace: 'pos',
  appearance: 'light',
  primaryColor: '#008967',
  secondaryColor: '#005656',
  sidebarColor: '#0f172a',
};

export function getUserPreferenceStorageKey(userId: number | string | null | undefined) {
  return userId ? `bukolabs-pos-user-settings-${userId}` : null;
}

export function loadUserPreferences(userId: number | string | null | undefined): UserPreferenceValues {
  const storageKey = getUserPreferenceStorageKey(userId);
  if (!storageKey) return defaultUserPreferences;

  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved ? { ...defaultUserPreferences, ...JSON.parse(saved) } : defaultUserPreferences;
  } catch {
    return defaultUserPreferences;
  }
}

export function saveUserPreferences(userId: number | string | null | undefined, preferences: UserPreferenceValues) {
  const storageKey = getUserPreferenceStorageKey(userId);
  if (!storageKey) return;
  window.localStorage.setItem(storageKey, JSON.stringify(preferences));
}

function prefersDarkSystemTheme() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function applyUserPreferences(preferences: UserPreferenceValues) {
  if (typeof document === 'undefined') return;

  document.documentElement.style.setProperty('--primary', preferences.primaryColor);
  document.documentElement.style.setProperty('--accent', preferences.primaryColor);
  document.documentElement.style.setProperty('--ring', preferences.primaryColor);
  /*
   * Deliberately NOT writing to --secondary here. --secondary is the
   * original design-system token used by secondary buttons/badges
   * (#64748b light / dark-mode gray) and is left untouched. The gradient
   * on primary buttons and the sidebar was always a separate, hardcoded
   * #008967->#005656 pairing unrelated to --secondary -- --secondary-accent
   * is its theme-aware equivalent, customizable here without recoloring
   * unrelated secondary badges/buttons.
   */
  document.documentElement.style.setProperty('--secondary-accent', preferences.secondaryColor);
  document.documentElement.style.setProperty('--sidebar', preferences.sidebarColor);
  document.documentElement.style.setProperty('--sidebar-primary', preferences.primaryColor);
  document.documentElement.style.setProperty('--sidebar-ring', preferences.primaryColor);

  const isDark = preferences.appearance === 'dark' || (preferences.appearance === 'system' && prefersDarkSystemTheme());
  document.documentElement.classList.toggle('dark', isDark);
}
