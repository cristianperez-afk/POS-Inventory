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
  auto_deduct_inventory_on_sale: boolean;
  allow_negative_stock: boolean;
  default_low_stock_threshold: number;
  default_inventory_unit: string;
  cycle_count_interval_days: number;
  auto_reorder_threshold_percent: number;
  enable_expiry_tracking: boolean;
  default_markup_percent: number;
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
  auto_deduct_inventory_on_sale: true,
  allow_negative_stock: false,
  default_low_stock_threshold: 3,
  default_inventory_unit: 'unit',
  cycle_count_interval_days: 30,
  auto_reorder_threshold_percent: 20,
  enable_expiry_tracking: false,
  default_markup_percent: 30,
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
        fetch(`${getApiBaseUrl()}/admin/store-settings`),
        fetch(`${getApiBaseUrl()}/admin/discount-settings`),
        fetch(`${getApiBaseUrl()}/admin/store-information`),
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
    auto_deduct_inventory_on_sale: data?.auto_deduct_inventory_on_sale ?? true,
    allow_negative_stock: data?.allow_negative_stock ?? false,
    default_low_stock_threshold: Number(data?.default_low_stock_threshold ?? 3),
    default_inventory_unit: typeof data?.default_inventory_unit === 'string' && data.default_inventory_unit.trim() ? data.default_inventory_unit : 'unit',
    cycle_count_interval_days: Number(data?.cycle_count_interval_days ?? 30),
    auto_reorder_threshold_percent: Number(data?.auto_reorder_threshold_percent ?? 20),
    enable_expiry_tracking: data?.enable_expiry_tracking ?? false,
    default_markup_percent: Number(data?.default_markup_percent ?? 30),
  };
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
