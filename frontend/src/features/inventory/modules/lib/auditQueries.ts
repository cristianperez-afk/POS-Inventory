import { useQuery } from '@tanstack/react-query';
import { getAuditLogs, type ApiAuditLog } from '../../app/api/client';
import type { BusinessModule } from '../../app/api/domainTypes';
import { domainQueryKeys } from './domainQueries';

// Normalized audit-trail row shape consumed by the Reports "Audit Trail" tab in
// both the retail and restaurant modules. It mirrors the columns those tables
// render (date / module / action / item / qty / by / reference / details), so the
// real backend audit log can drop straight into the existing UI.
export interface AuditTrailEntry {
  id: string;
  date: string;
  module: string;
  action: string;
  item: string;
  quantity: string;
  performedBy: string;
  performedByName: string;
  performedByRole: string;
  reference: string;
  details: string;
  status: string;
}

export function mapAuditLogs(logs: ApiAuditLog[]): AuditTrailEntry[] {
  return logs.map((log) => ({
    id: log.id,
    date: log.createdAt,
    module: log.category,
    action: log.action,
    item: log.entityName ?? '',
    quantity: log.quantity ?? '',
    performedBy: log.performedByEmail || log.performedByName || '',
    performedByName: log.performedByName || log.performedByEmail || '',
    performedByRole: log.performedByRole || '',
    reference: log.entityId ?? log.id,
    details: log.summary ?? '',
    status: log.status ?? 'recorded',
  }));
}

function useAuditLogsQuery(module: BusinessModule) {
  return useQuery({
    queryKey: [...domainQueryKeys.auditLogs, { module }],
    queryFn: () => getAuditLogs({ module, limit: 1000 }),
    select: mapAuditLogs,
  });
}

export function useRetailAuditLogsQuery() {
  return useAuditLogsQuery('RETAIL');
}

export function useRestaurantAuditLogsQuery() {
  return useAuditLogsQuery('RESTAURANT');
}
