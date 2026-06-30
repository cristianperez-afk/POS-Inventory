import { apiClient } from '../../api/apiClient';

export interface SuperadminAdminSummary {
  id: number;
  full_name: string;
  email: string;
  role: string;
  store_id: number | null;
  store_type: string | null;
  store_name: string | null;
  status?: string | null;
}

export interface SaveAdminPayload {
  full_name: string;
  email: string;
  password?: string;
  store_type: 'RESTAURANT' | 'RETAIL_STORE';
}

export interface CreateAdminResponse {
  user: SuperadminAdminSummary;
  temporary_password?: string;
}

export const superadminApi = {
  listAdmins: () => apiClient<SuperadminAdminSummary[]>('/superadmin/admins'),
  createAdmin: (payload: SaveAdminPayload) => apiClient<CreateAdminResponse>('/superadmin/admins', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateAdmin: (id: number, payload: SaveAdminPayload) => apiClient<SuperadminAdminSummary>(`/superadmin/admins/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  deactivateAdmin: (id: number) => apiClient<{ message?: string }>(`/superadmin/admins/${id}`, {
    method: 'DELETE',
  }),
  activateAdmin: (id: number) => apiClient<{ message?: string }>(`/superadmin/admins/${id}/activate`, {
    method: 'PATCH',
  }),
  permanentlyDeleteAdmin: (id: number) => apiClient<{ message?: string }>(`/superadmin/admins/${id}/permanent`, {
    method: 'DELETE',
  }),
};
