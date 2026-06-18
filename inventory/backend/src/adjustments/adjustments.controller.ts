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
import { AdjustmentsService } from './adjustments.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/current-user.decorator';
import { BusinessModule } from '@prisma/client';
import { resolveModule } from '../auth/assert-module-allowed';

@Controller('adjustments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Manager', 'Staff')
export class AdjustmentsController {
  constructor(private readonly adjustmentsService: AdjustmentsService) {}

  @Post()
  create(@Body() dto: CreateAdjustmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adjustmentsService.create(
      dto,
      user.businessId,
      resolveModule(user, dto.module),
      user.id,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('module') module?: BusinessModule,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adjustmentsService.findAll(
      user.businessId,
      resolveModule(user, module),
      status,
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
    return this.adjustmentsService.findOne(
      id,
      user.businessId,
      resolveModule(user, module),
    );
  }

  @Patch(':id/approve')
  @Roles('Admin', 'Manager')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('module') module?: BusinessModule,
  ) {
    return this.adjustmentsService.approve(
      id,
      user.businessId,
      resolveModule(user, module),
      user.role,
      user.id,
    );
  }

  @Patch(':id/reject')
  @Roles('Admin', 'Manager')
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('module') module?: BusinessModule,
  ) {
    return this.adjustmentsService.reject(
      id,
      user.businessId,
      resolveModule(user, module),
      user.role,
      reason,
      user.id,
    );
  }
}
