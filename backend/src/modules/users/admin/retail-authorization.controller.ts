import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedUser } from '../../../shared/common/types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { VerifyRetailVoidPinDto } from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RetailAuthorizationController {
  constructor(private readonly adminService: AdminService) {}

  @Post('retail/void-pin/verify')
  @Permissions('retail:void_authorize')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  verifyRetailVoidPin(@Body() body: VerifyRetailVoidPinDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.verifyRetailVoidPin({
      userId: user.id,
      voidPin: body.void_pin,
    });
  }

  @Get('retail/manager-profile')
  @Permissions('retail:void_authorize')
  getRetailManagerProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.getRetailManagerProfile(user.id);
  }

  @Post('retail/manager-profile/unique-pin')
  @Permissions('retail:void_authorize')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  generateRetailManagerUniquePin(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.generateRetailManagerUniquePin(user.id);
  }
}
