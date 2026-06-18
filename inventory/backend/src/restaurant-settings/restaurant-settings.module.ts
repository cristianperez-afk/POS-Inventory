import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RestaurantSettingsController } from './restaurant-settings.controller';
import { RestaurantSettingsService } from './restaurant-settings.service';

@Module({
  imports: [PrismaModule],
  controllers: [RestaurantSettingsController],
  providers: [RestaurantSettingsService],
})
export class RestaurantSettingsModule {}
