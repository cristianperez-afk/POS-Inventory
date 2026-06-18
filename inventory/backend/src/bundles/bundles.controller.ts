import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BundlesService } from './bundles.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';
import { RejectBundleDto } from './dto/reject-bundle.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessModulesGuard } from '../auth/business-modules.guard';
import { RequiredBusinessModules } from '../auth/business-modules.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/current-user.decorator';

@Controller('bundles')
@UseGuards(JwtAuthGuard, RolesGuard, BusinessModulesGuard)
@Roles('Admin', 'Manager', 'Staff')
@RequiredBusinessModules('RETAIL')
export class BundlesController {
  constructor(private readonly bundlesService: BundlesService) {}

  @Post()
  create(@Body() dto: CreateBundleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bundlesService.create(dto, user.businessId, user.id, user.role);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('locationId') locationId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bundlesService.findAll(
      user.businessId,
      status,
      locationId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bundlesService.findOne(id, user.businessId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBundleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bundlesService.update(id, dto, user.businessId);
  }

  @Patch(':id/approve')
  @Roles('Admin', 'Manager')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bundlesService.approve(id, user.businessId, user.id, user.role);
  }

  @Patch(':id/reject')
  @Roles('Admin', 'Manager')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectBundleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bundlesService.reject(id, dto.rejectionReason, user.businessId, user.role);
  }

  @Patch(':id/activate')
  @Roles('Admin', 'Manager')
  activate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bundlesService.activate(id, user.businessId, user.role);
  }

  @Patch(':id/deactivate')
  @Roles('Admin', 'Manager')
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bundlesService.deactivate(id, user.businessId, user.role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('Admin', 'Manager')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bundlesService.remove(id, user.businessId, user.role);
  }
}
