import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';

export interface StoreSettingValues {
  store_id: number | null;
  store_type: string | null;
  enable_customer_recommendation: boolean;
  enable_table_management: boolean;
  enable_refund: boolean;
  enable_void: boolean;
  enable_service_charge: boolean;
  service_charge_rate: number;
  enable_tax: boolean;
  tax_rate: number;
  enable_discount: boolean;
  enable_estimated_prep_time: boolean;
  prep_time_strategy: 'parallel' | 'sequential';
  customization_prep_time_minutes: number;
  enabled_payment_methods: string[];
  payment_method_accounts: Record<string, PaymentMethodAccount>;
  theme_color: string;
}

export interface PaymentMethodAccount {
  account_name?: string;
  account_number?: string;
  instructions?: string;
  qr_image?: string;
}

export interface DiscountSetting {
  id: number;
  store_id: number;
  discount_name: string;
  discount_rate: number | string;
  is_enabled: boolean;
}

interface StoreSettingsContextValue {
  settings: StoreSettingValues;
  discounts: DiscountSetting[];
  loading: boolean;
  reload: () => Promise<void>;
}

export const defaultStoreSettings: StoreSettingValues = {
  store_id: null,
  store_type: null,
  enable_customer_recommendation: true,
  enable_table_management: true,
  enable_refund: true,
  enable_void: true,
  enable_service_charge: true,
  service_charge_rate: 0,
  enable_tax: true,
  tax_rate: 0,
  enable_discount: true,
  enable_estimated_prep_time: true,
  prep_time_strategy: 'parallel',
  customization_prep_time_minutes: 2,
  enabled_payment_methods: ['Cash', 'GCash', 'Maya', 'Bank Transfer'],
  payment_method_accounts: {},
  theme_color: '#008967',
};

const StoreSettingsContext = createContext<StoreSettingsContextValue>({
  settings: defaultStoreSettings,
  discounts: [],
  loading: false,
  reload: async () => undefined,
});

export function StoreSettingsProvider({ currentUser, children }: { currentUser: AuthenticatedUser | null; children: ReactNode }) {
  const [settings, setSettings] = useState<StoreSettingValues>(defaultStoreSettings);
  const [discounts, setDiscounts] = useState<DiscountSetting[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    if (!currentUser?.id || currentUser.role === 'SUPERADMIN') {
      setSettings(defaultStoreSettings);
      setDiscounts([]);
      return;
    }

    setLoading(true);
    try {
      const [settingsResponse, discountsResponse, storeInfoResponse] = await Promise.all([
        fetch(`${getApiBaseUrl()}/admin/store-settings?admin_user_id=${currentUser.id}`),
        fetch(`${getApiBaseUrl()}/admin/discount-settings?admin_user_id=${currentUser.id}`),
        fetch(`${getApiBaseUrl()}/admin/store-information?admin_user_id=${currentUser.id}`),
      ]);
      const settingsData = await settingsResponse.json();
      const discountsData = await discountsResponse.json();
      const storeInfoData = await storeInfoResponse.json();

      if (settingsResponse.ok) {
        setSettings(normalizeStoreSettings({ ...settingsData, theme_color: storeInfoResponse.ok ? storeInfoData?.theme_color : undefined }));
      }
      if (discountsResponse.ok) {
        setDiscounts(Array.isArray(discountsData) ? discountsData : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [currentUser?.id, currentUser?.role, currentUser?.store_id]);

  useEffect(() => {
    applyThemeColor(settings.theme_color);
  }, [settings.theme_color]);

  const value = useMemo(() => ({ settings, discounts, loading, reload }), [settings, discounts, loading]);

  return <StoreSettingsContext.Provider value={value}>{children}</StoreSettingsContext.Provider>;
}

export function useStoreSettings() {
  return useContext(StoreSettingsContext);
}

export function normalizeStoreSettings(data: any): StoreSettingValues {
  return {
    store_id: data?.store_id ?? null,
    store_type: data?.store_type ?? null,
    enable_customer_recommendation: data?.enable_customer_recommendation ?? true,
    enable_table_management: data?.enable_table_management ?? true,
    enable_refund: data?.enable_refund ?? true,
    enable_void: data?.enable_void ?? true,
    enable_service_charge: data?.enable_service_charge ?? true,
    service_charge_rate: Number(data?.service_charge_rate ?? data?.service_charge_percentage ?? 0),
    enable_tax: data?.enable_tax ?? true,
    tax_rate: Number(data?.tax_rate ?? 0),
    enable_discount: data?.enable_discount ?? true,
    enable_estimated_prep_time: data?.enable_estimated_prep_time ?? true,
    prep_time_strategy: data?.prep_time_strategy === 'sequential' ? 'sequential' : 'parallel',
    customization_prep_time_minutes: Number(data?.customization_prep_time_minutes ?? 2),
    enabled_payment_methods: normalizePaymentMethods(data?.enabled_payment_methods),
    payment_method_accounts: normalizePaymentMethodAccounts(data?.payment_method_accounts),
    theme_color: isHexColor(data?.theme_color) ? data.theme_color : defaultStoreSettings.theme_color,
  };
}

function applyThemeColor(color: string) {
  const root = document.documentElement;
  root.style.setProperty('--primary', color);
  root.style.setProperty('--accent', color);
  root.style.setProperty('--ring', color);
  root.style.setProperty('--chart-1', color);
  root.style.setProperty('--sidebar-primary', color);
  root.style.setProperty('--sidebar-ring', color);
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function normalizePaymentMethods(value: unknown): string[] {
  const defaults = ['Cash', 'GCash', 'Maya', 'Bank Transfer'];
  if (Array.isArray(value)) {
    const methods = value.filter((method): method is string => typeof method === 'string' && method.trim().length > 0);
    return methods.length > 0 ? methods : defaults;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const methods = parsed.filter((method): method is string => typeof method === 'string' && method.trim().length > 0);
        return methods.length > 0 ? methods : defaults;
      }
    } catch {
      const methods = value
        .replace(/[{}"]/g, '')
        .split(',')
        .map((method) => method.trim())
        .filter(Boolean);
      return methods.length > 0 ? methods : defaults;
    }
  }
  return defaults;
}

function normalizePaymentMethodAccounts(value: unknown): Record<string, PaymentMethodAccount> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([method]) => method.trim().length > 0)
      .map(([method, account]) => {
        const data = account && typeof account === 'object' && !Array.isArray(account) ? account as Record<string, unknown> : {};
        return [method, {
          account_name: typeof data.account_name === 'string' ? data.account_name : '',
          account_number: typeof data.account_number === 'string' ? data.account_number : '',
          instructions: typeof data.instructions === 'string' ? data.instructions : '',
          qr_image: typeof data.qr_image === 'string' ? data.qr_image : '',
        }];
      }),
  );
}
