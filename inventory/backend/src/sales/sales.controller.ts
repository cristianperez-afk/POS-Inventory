import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { RefundSaleDto } from './dto/refund-sale.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessModulesGuard } from '../auth/business-modules.guard';
import { RequiredBusinessModules } from '../auth/business-modules.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/current-user.decorator';
import { BusinessModule } from '@prisma/client';
import { resolveModule } from '../auth/assert-module-allowed';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard, BusinessModulesGuard)
@Roles('Admin', 'Manager', 'Staff')
@RequiredBusinessModules()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthenticatedUser) {
    const module = dto.kitchenOrderId
      ? BusinessModule.RESTAURANT
      : BusinessModule.RETAIL;
    return this.salesService.create(
      dto,
      user.businessId,
      resolveModule(user, module),
      user.id,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('module') module?: BusinessModule,
    @Query('locationId') locationId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.salesService.findAll(
      user.businessId,
      resolveModule(user, module),
      locationId,
      status,
      dateFrom,
      dateTo,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('module') module?: BusinessModule,
  ) {
    return this.salesService.findOne(
      id,
      user.businessId,
      resolveModule(user, module),
    );
  }

  @Patch(':id/refund')
  @Roles('Admin', 'Manager')
  refund(
    @Param('id') id: string,
    @Body() dto: RefundSaleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('module') module?: BusinessModule,
  ) {
    return this.salesService.refund(
      id,
      dto.refundReason,
      user.businessId,
      resolveModule(user, module),
      user.id,
    );
  }
}
