export type UserPreferenceValues = {
  compactMode: boolean;
  lowStockAlerts: boolean;
  defaultWorkspace: 'pos' | 'inventory' | 'reports';
  themeMode: 'basic' | 'advanced';
  themePreset: string | null;
  appearance: 'system' | 'light' | 'dark';
  primaryColor: string;
  secondaryColor: string;
  sidebarColor: string;
};

export type ThemePreferenceValues = Pick<
  UserPreferenceValues,
  'themeMode' | 'themePreset' | 'appearance' | 'primaryColor' | 'secondaryColor' | 'sidebarColor'
>;

export type ThemeScope = 'personal' | 'store';

export const defaultUserPreferences: UserPreferenceValues = {
  compactMode: false,
  lowStockAlerts: true,
  defaultWorkspace: 'pos',
  themeMode: 'basic',
  themePreset: 'default',
  appearance: 'light',
  primaryColor: '#008967',
  secondaryColor: '#005656',
  sidebarColor: '#0f172a',
};

export const themePresets: Array<{ id: string; label: string; values: ThemePreferenceValues }> = [
  {
    id: 'default',
    label: 'Default',
    values: {
      themeMode: 'basic',
      themePreset: 'default',
      appearance: 'light',
      primaryColor: '#008967',
      secondaryColor: '#005656',
      sidebarColor: '#0f172a',
    },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    values: {
      themeMode: 'basic',
      themePreset: 'emerald',
      appearance: 'light',
      primaryColor: '#059669',
      secondaryColor: '#047857',
      sidebarColor: '#064e3b',
    },
  },
  {
    id: 'blue',
    label: 'Blue',
    values: {
      themeMode: 'basic',
      themePreset: 'blue',
      appearance: 'light',
      primaryColor: '#2563eb',
      secondaryColor: '#0f766e',
      sidebarColor: '#172554',
    },
  },
  {
    id: 'purple',
    label: 'Purple',
    values: {
      themeMode: 'basic',
      themePreset: 'purple',
      appearance: 'light',
      primaryColor: '#7c3aed',
      secondaryColor: '#6d28d9',
      sidebarColor: '#2e1065',
    },
  },
  {
    id: 'rose',
    label: 'Rose',
    values: {
      themeMode: 'basic',
      themePreset: 'rose',
      appearance: 'light',
      primaryColor: '#e11d48',
      secondaryColor: '#be123c',
      sidebarColor: '#4c0519',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    values: {
      themeMode: 'basic',
      themePreset: 'slate',
      appearance: 'dark',
      primaryColor: '#0f766e',
      secondaryColor: '#14b8a6',
      sidebarColor: '#111827',
    },
  },
];

export type RemoteThemePreferencesResponse = {
  user_preferences: RemoteUserPreferences | null;
  store_theme: RemoteThemePreferences | null;
  effective_theme: RemoteThemePreferences;
  can_manage_store_theme: boolean;
};

type RemoteThemePreferences = {
  theme_mode?: string | null;
  theme_preset?: string | null;
  appearance?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  sidebar_color?: string | null;
};

type RemoteUserPreferences = RemoteThemePreferences & {
  compact_mode?: boolean | null;
  low_stock_alerts?: boolean | null;
  default_workspace?: string | null;
};

export function getUserPreferenceStorageKey(userId: number | string | null | undefined) {
  return userId ? `bukolabs-pos-user-settings-${userId}` : null;
}

export function loadUserPreferences(userId: number | string | null | undefined): UserPreferenceValues {
  const storageKey = getUserPreferenceStorageKey(userId);
  if (!storageKey) return defaultUserPreferences;

  try {
    const saved = window.localStorage.getItem(storageKey);
    return normalizeUserPreferences(saved ? { ...defaultUserPreferences, ...JSON.parse(saved) } : defaultUserPreferences);
  } catch {
    return defaultUserPreferences;
  }
}

export function saveUserPreferences(userId: number | string | null | undefined, preferences: UserPreferenceValues) {
  const storageKey = getUserPreferenceStorageKey(userId);
  if (!storageKey) return;
  window.localStorage.setItem(storageKey, JSON.stringify(preferences));
}

export function normalizeUserPreferences(input: Partial<UserPreferenceValues> | null | undefined): UserPreferenceValues {
  return {
    compactMode: Boolean(input?.compactMode ?? defaultUserPreferences.compactMode),
    lowStockAlerts: input?.lowStockAlerts === undefined || input?.lowStockAlerts === null ? defaultUserPreferences.lowStockAlerts : Boolean(input.lowStockAlerts),
    defaultWorkspace: input?.defaultWorkspace === 'inventory' || input?.defaultWorkspace === 'reports' ? input.defaultWorkspace : defaultUserPreferences.defaultWorkspace,
    ...normalizeThemePreferences(input),
  };
}

export function normalizeThemePreferences(input: Partial<ThemePreferenceValues> | null | undefined): ThemePreferenceValues {
  return {
    themeMode: input?.themeMode === 'advanced' ? 'advanced' : 'basic',
    themePreset: typeof input?.themePreset === 'string' && input.themePreset ? input.themePreset : defaultUserPreferences.themePreset,
    appearance: input?.appearance === 'system' || input?.appearance === 'dark' ? input.appearance : defaultUserPreferences.appearance,
    primaryColor: normalizeHexColor(input?.primaryColor, defaultUserPreferences.primaryColor),
    secondaryColor: normalizeHexColor(input?.secondaryColor, defaultUserPreferences.secondaryColor),
    sidebarColor: normalizeHexColor(input?.sidebarColor, defaultUserPreferences.sidebarColor),
  };
}

export function applyThemePreset(preferences: UserPreferenceValues, presetId: string): UserPreferenceValues {
  const preset = themePresets.find((item) => item.id === presetId) ?? themePresets[0];
  return { ...preferences, ...preset.values };
}

export function toRemoteUserPreferences(preferences: UserPreferenceValues) {
  return {
    compact_mode: preferences.compactMode,
    low_stock_alerts: preferences.lowStockAlerts,
    default_workspace: preferences.defaultWorkspace,
    ...toRemoteThemePreferences(preferences),
  };
}

export function toRemoteThemePreferences(preferences: ThemePreferenceValues) {
  return {
    theme_mode: preferences.themeMode,
    theme_preset: preferences.themePreset,
    appearance: preferences.appearance,
    primary_color: preferences.primaryColor,
    secondary_color: preferences.secondaryColor,
    sidebar_color: preferences.sidebarColor,
  };
}

export function fromRemoteUserPreferences(input: RemoteUserPreferences | null | undefined): UserPreferenceValues | null {
  if (!input) return null;

  return normalizeUserPreferences({
    compactMode: input.compact_mode ?? defaultUserPreferences.compactMode,
    lowStockAlerts: input.low_stock_alerts ?? defaultUserPreferences.lowStockAlerts,
    defaultWorkspace: input.default_workspace === 'inventory' || input.default_workspace === 'reports' ? input.default_workspace : 'pos',
    ...fromRemoteThemePreferences(input),
  });
}

export function fromRemoteThemePreferences(input: RemoteThemePreferences | null | undefined): ThemePreferenceValues {
  return normalizeThemePreferences({
    themeMode: input?.theme_mode === 'advanced' ? 'advanced' : 'basic',
    themePreset: input?.theme_preset ?? defaultUserPreferences.themePreset,
    appearance: input?.appearance === 'system' || input?.appearance === 'dark' ? input.appearance : defaultUserPreferences.appearance,
    primaryColor: input?.primary_color ?? defaultUserPreferences.primaryColor,
    secondaryColor: input?.secondary_color ?? defaultUserPreferences.secondaryColor,
    sidebarColor: input?.sidebar_color ?? defaultUserPreferences.sidebarColor,
  });
}

export function mergeUserPreferencesWithTheme(userPreferences: UserPreferenceValues, theme: ThemePreferenceValues): UserPreferenceValues {
  return { ...userPreferences, ...theme };
}

function normalizeHexColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
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
