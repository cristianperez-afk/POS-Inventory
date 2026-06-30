import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedUser } from '../../../shared/common/types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { DiscountSettingDto } from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminDiscountController {
  constructor(private readonly adminService: AdminService) {}

  @Get('discount-settings')
  listDiscountSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.listDiscountSettings(user.id);
  }

  @Post('discount-settings')
  @Permissions('discounts:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  createDiscountSetting(@Body() body: DiscountSettingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.createDiscountSetting({
      adminUserId: user.id,
      discountName: body.discount_name,
      discountRate: body.discount_rate,
      isEnabled: body.is_enabled ?? true,
    });
  }

  @Patch('discount-settings/:id')
  @Permissions('discounts:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  updateDiscountSetting(@Param('id') id: string, @Body() body: DiscountSettingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updateDiscountSetting({
      adminUserId: user.id,
      discountId: Number(id),
      discountName: body.discount_name,
      discountRate: body.discount_rate,
      isEnabled: body.is_enabled ?? true,
    });
  }

  @Delete('discount-settings/:id')
  @Permissions('discounts:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  deleteDiscountSetting(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.deleteDiscountSetting({
      adminUserId: user.id,
      discountId: Number(id),
    });
  }
}
