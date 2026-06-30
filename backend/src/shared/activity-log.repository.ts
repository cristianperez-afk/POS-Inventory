import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

@Injectable()
export class ActivityLogRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  listForUser(input: {
    userId: number;
    dateFrom?: string;
    dateTo?: string;
    actorUserId?: number;
    module?: string;
    action?: string;
    search?: string;
  }) {
    return this.databaseService.listActivityLogsForUser(input);
  }

  async recordForUser(userId: number, module: string, action: string, details: string) {
    await this.databaseService.recordActivityForUser(userId, module, action, details);
  }
}
