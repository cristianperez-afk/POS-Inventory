import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SuperadminController],
  providers: [SuperadminService],
})
export class SuperadminModule {}
