import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/current-user.decorator';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StockMovementsService } from './stock-movements.service';
import { BusinessModule } from '@prisma/client';
import { resolveModule } from '../auth/assert-module-allowed';

@Controller('stock-movements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Manager', 'Staff')
export class StockMovementsController {
  constructor(private readonly stockMovementsService: StockMovementsService) {}

  @Post()
  create(
    @Body() createStockMovementDto: CreateStockMovementDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.stockMovementsService.create(
      createStockMovementDto,
      currentUser.businessId,
      resolveModule(currentUser, createStockMovementDto.module),
      currentUser.id,
      currentUser.modules,
    );
  }

  @Get()
  findAll(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query('module') module?: BusinessModule,
    @Query('itemId') itemId?: string,
    @Query('locationId') locationId?: string,
    @Query('type') type?: string,
    @Query('referenceType') referenceType?: string,
    @Query('referenceId') referenceId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockMovementsService.findAll(
      currentUser.businessId,
      {
        module: resolveModule(currentUser, module),
        itemId,
        locationId,
        type,
        referenceType,
        referenceId,
      },
      currentUser.modules,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query('module') module?: BusinessModule,
  ) {
    return this.stockMovementsService.findOne(
      id,
      currentUser.businessId,
      resolveModule(currentUser, module),
    );
  }
}
