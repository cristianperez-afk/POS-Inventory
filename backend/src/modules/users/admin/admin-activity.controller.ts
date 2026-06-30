import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedUser } from '../../../shared/common/types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminActivityController {
  constructor(private readonly adminService: AdminService) {}

  @Get('activity-logs')
  @Permissions('activity:read_store')
  listActivityLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('actor_user_id') actorUserId?: string,
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listActivityLogs({
      userId: user.id,
      dateFrom,
      dateTo,
      actorUserId: actorUserId ? Number(actorUserId) : undefined,
      module,
      action,
      search,
    });
  }

  @Post('activity-logs')
  @Permissions('activity:read_store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  recordActivityLog(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.recordActivityLog({
      userId: user.id,
      module: String(body.module ?? ''),
      action: String(body.action ?? ''),
      details: String(body.details ?? ''),
    });
  }
}
