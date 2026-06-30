import { apiClient } from '../../api/apiClient';

export type ActivityLog = {
  id: string | number;
  user_id: number | null;
  user_name: string;
  user_role: string;
  module: string;
  action: string;
  details: string;
  created_at: string;
};

export type ActivityLogScope = 'admin' | 'superadmin';

export function listActivityLogs(scope: ActivityLogScope, params: URLSearchParams) {
  const query = params.toString();
  return apiClient<ActivityLog[]>(`/${scope}/activity-logs${query ? `?${query}` : ''}`);
}
