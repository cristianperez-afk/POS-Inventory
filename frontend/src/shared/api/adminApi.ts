import { apiClient } from '../../api/apiClient';
import type { AuthenticatedUser, StaffType } from '../../auth/types/auth';
import type { DiscountSetting, StoreSettingValues } from '../context/StoreSettingsContext';

export interface AdminStaffUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
  store_id: number | null;
  store_type: string | null;
  staff_type: StaffType;
  status?: string | null;
  void_pin_configured?: boolean;
}

export interface AdminStaffPayload {
  full_name: string;
  email: string;
  password?: string;
  void_pin?: string;
  staff_type: StaffType;
  role: string;
}

export interface StoreInformationData {
  id: number;
  store_id: number;
  business_name: string;
  business_description: string | null;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  logo: string | null;
  receipt_thank_you_message: string | null;
  receipt_footer_message: string | null;
  operating_hours: string | null;
  currency: string | null;
  theme_color: string | null;
}

export interface ThemePreferencesResponse {
  can_manage_store_theme: boolean;
  user_preferences: unknown;
  store_theme: unknown;
  effective_theme: unknown;
}

export type ManagerProfileData = AuthenticatedUser & {
  void_pin?: string | null;
  void_pin_configured?: boolean;
  status?: string | null;
};

export interface RetailVoidPinVerification {
  authorized?: boolean;
  manager?: {
    id?: number;
    full_name?: string;
    email?: string;
  };
}

export const adminApi = {
  listStaff: () => apiClient<AdminStaffUser[]>('/admin/staff'),
  createStaff: (payload: AdminStaffPayload) => apiClient<AdminStaffUser>('/admin/staff', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateStaff: (id: number, payload: AdminStaffPayload) => apiClient<AdminStaffUser>(`/admin/staff/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  deactivateStaff: (id: number) => apiClient<{ message?: string }>(`/admin/staff/${id}`, {
    method: 'DELETE',
  }),
  activateStaff: (id: number) => apiClient<{ message?: string }>(`/admin/staff/${id}/activate`, {
    method: 'PATCH',
  }),
  permanentlyDeleteStaff: (id: number) => apiClient<{ message?: string }>(`/admin/staff/${id}/permanent`, {
    method: 'DELETE',
  }),
  getThemePreferences: () => apiClient<ThemePreferencesResponse>('/admin/theme-preferences'),
  saveThemePreferences: (scope: 'personal' | 'store', payload: unknown) => apiClient<unknown>(`/admin/theme-preferences/${scope}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  resetThemePreferences: (scope: 'personal' | 'store') => apiClient<ThemePreferencesResponse>(`/admin/theme-preferences/${scope}`, {
    method: 'DELETE',
  }),
  getStoreInformation: () => apiClient<StoreInformationData>('/admin/store-information'),
  saveStoreInformation: (payload: Partial<StoreInformationData>) => apiClient<StoreInformationData>('/admin/store-information', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getStoreSettings: () => apiClient<StoreSettingValues>('/admin/store-settings'),
  saveStoreSettings: (payload: Partial<StoreSettingValues>) => apiClient<StoreSettingValues>('/admin/store-settings', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  listDiscountSettings: () => apiClient<DiscountSetting[]>('/admin/discount-settings'),
  createDiscountSetting: (payload: Partial<DiscountSetting>) => apiClient<DiscountSetting>('/admin/discount-settings', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateDiscountSetting: (id: number, payload: Partial<DiscountSetting>) => apiClient<DiscountSetting>(`/admin/discount-settings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  deleteDiscountSetting: (id: number) => apiClient<{ message?: string }>(`/admin/discount-settings/${id}`, {
    method: 'DELETE',
  }),
  getRetailManagerProfile: () => apiClient<ManagerProfileData>('/admin/retail/manager-profile'),
  generateRetailManagerUniquePin: () => apiClient<{ void_pin?: string }>('/admin/retail/manager-profile/unique-pin', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  getPosManagerProfile: () => apiClient<ManagerProfileData>('/admin/pos/manager-profile'),
  generatePosManagerUniquePin: () => apiClient<{ void_pin?: string }>('/admin/pos/manager-profile/unique-pin', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  verifyRetailVoidPin: (voidPin: string) => apiClient<RetailVoidPinVerification>('/admin/retail/void-pin/verify', {
    method: 'POST',
    body: JSON.stringify({ void_pin: voidPin }),
  }),
  verifyPosManagerPin: (voidPin: string) => apiClient<RetailVoidPinVerification>('/admin/pos/manager-pin/verify', {
    method: 'POST',
    body: JSON.stringify({ void_pin: voidPin }),
  }),
};
