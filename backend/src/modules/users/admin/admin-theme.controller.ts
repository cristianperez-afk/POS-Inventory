import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedUser } from '../../../shared/common/types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { ThemePreferencesDto } from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminThemeController {
  constructor(private readonly adminService: AdminService) {}

  @Get('theme-preferences')
  getThemePreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.getThemePreferences(user.id);
  }

  @Post('theme-preferences/personal')
  @Permissions('theme:manage_personal')
  updatePersonalThemePreferences(@Body() preferences: ThemePreferencesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updatePersonalThemePreferences({
      userId: user.id,
      preferences: preferences as unknown as Record<string, unknown>,
    });
  }

  @Delete('theme-preferences/personal')
  @Permissions('theme:manage_personal')
  clearPersonalThemePreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.clearPersonalThemePreferences(user.id);
  }

  @Post('theme-preferences/store')
  @Permissions('theme:manage_store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  updateStoreThemePreferences(@Body() preferences: ThemePreferencesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updateStoreThemePreferences({
      userId: user.id,
      preferences: preferences as unknown as Record<string, unknown>,
    });
  }

  @Delete('theme-preferences/store')
  @Permissions('theme:manage_store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  clearStoreThemePreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.clearStoreThemePreferences(user.id);
  }
}
