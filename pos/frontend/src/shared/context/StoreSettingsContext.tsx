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
  enabled_payment_methods: string[];
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
  enabled_payment_methods: ['Cash', 'GCash', 'Maya', 'Bank Transfer'],
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
      const [settingsResponse, discountsResponse] = await Promise.all([
        fetch(`${getApiBaseUrl()}/admin/store-settings?admin_user_id=${currentUser.id}`),
        fetch(`${getApiBaseUrl()}/admin/discount-settings?admin_user_id=${currentUser.id}`),
      ]);
      const settingsData = await settingsResponse.json();
      const discountsData = await discountsResponse.json();

      if (settingsResponse.ok) {
        setSettings(normalizeStoreSettings(settingsData));
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
    enabled_payment_methods: normalizePaymentMethods(data?.enabled_payment_methods),
  };
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
