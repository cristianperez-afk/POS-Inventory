import { Module } from '@nestjs/common';
import { InventoryApiController, KitchenApiAccessGuard } from './inventory-api.controller';
import { InventoryApiService } from './inventory-api.service';

@Module({
  controllers: [InventoryApiController],
  providers: [InventoryApiService, KitchenApiAccessGuard],
})
export class InventoryApiModule {}
