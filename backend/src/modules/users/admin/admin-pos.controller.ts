import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedUser } from '../../../shared/common/types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminPosController {
  constructor(private readonly adminService: AdminService) {}

  @Get('pos/products')
  @Permissions('pos:read')
  listPosProducts(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.listPosProducts(user.id);
  }

  @Get('pos/orders')
  @Permissions('pos:read')
  listPosOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.listPosOrders(user.id);
  }

  @Get('pos/tables')
  @Permissions('pos:read')
  listDiningTables(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.listDiningTables(user.id);
  }

  @Post('pos/tables')
  @Permissions('pos:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  createDiningTable(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.createDiningTable({
      userId: user.id,
      tableNumber: String(body.table_number ?? body.table_name ?? ''),
      totalSeats: Number(body.total_seats),
      isShared: Boolean(body.is_shared),
    });
  }

  @Patch('pos/tables/:id')
  @Permissions('pos:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  updateDiningTable(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updateDiningTable({
      userId: user.id,
      tableId: id,
      tableNumber: String(body.table_number ?? body.table_name ?? ''),
      totalSeats: Number(body.total_seats),
      isShared: Boolean(body.is_shared),
    });
  }

  @Delete('pos/tables/:id')
  @Permissions('pos:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  deleteDiningTable(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.deleteDiningTable({
      userId: user.id,
      tableId: id,
    });
  }

  @Patch('pos/tables/:id/occupancy')
  @Permissions('pos:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  setDiningTableOccupancy(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.setDiningTableOccupancy({
      userId: user.id,
      tableId: id,
      occupiedSeats: Number(body.occupied_seats),
    });
  }

  @Get('pos/next-order-number')
  @Permissions('pos:read')
  getNextPosOrderNumber(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.getNextPosOrderNumber(user.id);
  }

  @Post('pos/orders')
  @Permissions('pos:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  createPaidPosOrder(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.createPaidPosOrder({
      ...body,
      userId: user.id,
    });
  }

  @Patch('pos/orders/:orderNumber')
  @Permissions('pos:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  updatePosOrder(@Param('orderNumber') orderNumber: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updatePosOrder({
      ...body,
      orderNumber,
      userId: user.id,
    });
  }
}
