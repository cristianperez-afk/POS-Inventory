import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedUser } from '../../../shared/common/types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CreateStaffDto, UpdateStaffDto } from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminStaffController {
  constructor(private readonly adminService: AdminService) {}

  @Get('staff')
  @Permissions('staff:manage')
  listStaff(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.listStaff(user.id);
  }

  @Post('staff')
  @Permissions('staff:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  createStaff(@Body() body: CreateStaffDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.createStaff({
      adminUserId: user.id,
      fullName: body.full_name,
      email: body.email,
      password: body.password,
      staffType: body.staff_type,
      role: body.role,
      voidPin: body.void_pin,
    });
  }

  @Patch('staff/:id')
  @Permissions('staff:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  updateStaff(@Param('id') id: string, @Body() body: UpdateStaffDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updateStaff({
      adminUserId: user.id,
      staffUserId: Number(id),
      fullName: body.full_name,
      email: body.email,
      password: body.password,
      staffType: body.staff_type,
      role: body.role,
      voidPin: body.void_pin,
    });
  }

  @Delete('staff/:id')
  @Permissions('staff:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  deleteStaff(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.deleteStaff({
      adminUserId: user.id,
      staffUserId: Number(id),
    });
  }

  @Delete('staff/:id/permanent')
  @Permissions('staff:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  permanentlyDeleteStaff(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.permanentlyDeleteStaff({
      adminUserId: user.id,
      staffUserId: Number(id),
    });
  }

  @Patch('staff/:id/activate')
  @Permissions('staff:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  activateStaff(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.activateStaff({
      adminUserId: user.id,
      staffUserId: Number(id),
    });
  }
}
