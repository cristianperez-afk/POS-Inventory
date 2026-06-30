import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

type ActivityLogInput = {
  userId?: number | null;
  storeId?: number | null;
  userName?: string | null;
  userRole?: string | null;
  module: string;
  action: string;
  details: string;
};

@Injectable()
export class ActivityLogRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listForUser(input: {
    userId: number;
    dateFrom?: string;
    dateTo?: string;
    actorUserId?: number;
    module?: string;
    action?: string;
    search?: string;
  }) {
    const requester = await this.databaseService.getUserStoreScope(input.userId);
    const role = String(requester.role ?? '');
    const canViewAll = role === 'SUPERADMIN';
    const canViewStore = role === 'ADMIN' || role === 'POS_MANAGER' || role === 'POS_ADMIN';

    if (!canViewAll && (!canViewStore || !requester.store_id || !['RESTAURANT', 'RETAIL_STORE'].includes(String(requester.store_type)))) {
      throw new ForbiddenException('Only Superadmin, Store Admin, and POS Manager accounts can view activity logs.');
    }

    await this.databaseService.ensureActivityLogSchema();

    const conditions: string[] = [];
    const values: unknown[] = [];
    const addValue = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (!canViewAll) {
      conditions.push(`store_id = ${addValue(requester.store_id)}`);
    }
    if (input.dateFrom?.trim()) {
      conditions.push(`created_at >= (${addValue(input.dateFrom.trim())}::date::timestamp - INTERVAL '8 hours')`);
    }
    if (input.dateTo?.trim()) {
      conditions.push(`created_at < (${addValue(input.dateTo.trim())}::date::timestamp + INTERVAL '1 day' - INTERVAL '8 hours')`);
    }
    if (Number.isFinite(input.actorUserId) && Number(input.actorUserId) > 0) {
      conditions.push(`user_id = ${addValue(Number(input.actorUserId))}`);
    }
    if (input.module?.trim()) {
      conditions.push(`module = ${addValue(input.module.trim())}`);
    }
    if (input.action?.trim()) {
      conditions.push(`action = ${addValue(input.action.trim())}`);
    }
    if (input.search?.trim()) {
      const param = addValue(`%${input.search.trim()}%`);
      conditions.push(`(user_name ILIKE ${param} OR user_role ILIKE ${param} OR module ILIKE ${param} OR action ILIKE ${param} OR details ILIKE ${param})`);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.databaseService.query(
      `
        SELECT id, store_id, user_id, user_name, user_role, module, action, details, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
        FROM activity_logs
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT 500
      `,
      values,
    );
  }

  async recordForUser(userId: number, module: string, action: string, details: string) {
    try {
      const user = await this.databaseService.getUserStoreScope(userId);
      await this.record({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module,
        action,
        details,
      });
    } catch {
      return;
    }
  }

  async record(input: ActivityLogInput) {
    try {
      await this.databaseService.ensureActivityLogSchema();
      await this.databaseService.query(
        `
          INSERT INTO activity_logs (store_id, user_id, user_name, user_role, module, action, details, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        `,
        [
          input.storeId ?? null,
          input.userId ?? null,
          input.userName ?? 'System',
          input.userRole ?? 'System',
          input.module,
          input.action,
          input.details,
        ],
      );
    } catch {
      return;
    }
  }
}
