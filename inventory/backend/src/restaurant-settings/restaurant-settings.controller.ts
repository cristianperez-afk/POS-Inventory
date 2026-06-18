import { Body, Controller, Get, Param, ParseEnumPipe, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpsertRestaurantSettingDto } from './dto/upsert-restaurant-setting.dto';
import { RestaurantSettingKey } from './restaurant-setting-key';
import { RestaurantSettingsService } from './restaurant-settings.service';

@Controller('restaurant-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Manager', 'Staff')
export class RestaurantSettingsController {
  constructor(private readonly settingsService: RestaurantSettingsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.findAll(user.businessId);
  }

  @Put(':key')
  @Roles('Admin', 'Manager')
  upsert(
    @Param('key', new ParseEnumPipe(RestaurantSettingKey)) key: RestaurantSettingKey,
    @Body() dto: UpsertRestaurantSettingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settingsService.upsert(key, dto.value, user.businessId);
  }
}
