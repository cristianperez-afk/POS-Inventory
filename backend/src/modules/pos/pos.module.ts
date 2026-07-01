import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { PosController } from './pos.controller';
import { PosOrderRepository } from './pos-order.repository';
import { PosService } from './pos.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PosController],
  providers: [PosService, PosOrderRepository],
})
export class PosModule {}
