import { Module } from '@nestjs/common';
import { KitchenOrdersController } from './kitchen-orders.controller';
import { KitchenOrdersService } from './kitchen-orders.service';

@Module({
  controllers: [KitchenOrdersController],
  providers: [KitchenOrdersService],
  exports: [KitchenOrdersService],
})
export class KitchenOrdersModule {}
