import { Module } from '@nestjs/common';
import { ActivityLogRepository } from '../../../shared/activity-log.repository';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';

@Module({
  controllers: [SuperadminController],
  providers: [SuperadminService, ActivityLogRepository],
})
export class SuperadminModule {}
