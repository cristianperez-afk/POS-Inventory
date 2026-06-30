import { Module } from '@nestjs/common';
import { InventoryApiController } from './inventory-api.controller';
import { InventoryApiService } from './inventory-api.service';
import { InventoryIdentityService } from './inventory-identity.service';

@Module({
  controllers: [InventoryApiController],
  providers: [InventoryApiService, InventoryIdentityService],
})
export class InventoryApiModule {}
