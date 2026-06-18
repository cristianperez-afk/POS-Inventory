import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/current-user.decorator';
import { BusinessModulesGuard } from '../auth/business-modules.guard';
import { RequiredBusinessModules } from '../auth/business-modules.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateKitchenOrderDto } from './dto/create-kitchen-order.dto';
import { UpdateKitchenOrderStatusDto } from './dto/update-kitchen-order-status.dto';
import { VoidKitchenOrderDto } from './dto/void-kitchen-order.dto';
import { KitchenOrdersService } from './kitchen-orders.service';

@Controller('kitchen-orders')
@UseGuards(JwtAuthGuard, RolesGuard, BusinessModulesGuard)
@Roles('Admin', 'Manager', 'Staff')
@RequiredBusinessModules('RESTAURANT')
export class KitchenOrdersController {
  constructor(private readonly kitchenOrdersService: KitchenOrdersService) {}

  @Post()
  complete(
    @Body() createKitchenOrderDto: CreateKitchenOrderDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.kitchenOrdersService.complete(
      createKitchenOrderDto,
      currentUser.businessId,
      currentUser.id,
    );
  }

  @Get()
  findAll(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('locationId') locationId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.kitchenOrdersService.findAll(
      currentUser.businessId,
      status,
      locationId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.kitchenOrdersService.findOne(id, currentUser.businessId);
  }

  @Patch(':id/void')
  void(
    @Param('id') id: string,
    @Body() voidKitchenOrderDto: VoidKitchenOrderDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.kitchenOrdersService.void(
      id,
      voidKitchenOrderDto,
      currentUser.businessId,
    );
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateKitchenOrderStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.kitchenOrdersService.updateStatus(
      id,
      dto.status,
      currentUser.businessId,
      currentUser.id,
    );
  }
}
