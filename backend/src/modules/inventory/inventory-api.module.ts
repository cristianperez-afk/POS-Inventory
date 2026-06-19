import { Module } from '@nestjs/common';
import { InventoryApiController } from './inventory-api.controller';
import { InventoryApiService } from './inventory-api.service';

@Module({
  controllers: [InventoryApiController],
  providers: [InventoryApiService],
})
export class InventoryApiModule {}
