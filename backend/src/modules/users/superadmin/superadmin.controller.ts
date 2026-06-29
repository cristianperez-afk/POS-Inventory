import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { SuperadminService } from './superadmin.service';

class CreateAdminDto {
  @IsOptional()
  @IsString()
  full_name!: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['RESTAURANT', 'RETAIL_STORE', 'RETAIL'])
  store_type?: 'RESTAURANT' | 'RETAIL_STORE' | 'RETAIL';

  @IsOptional()
  @IsIn(['RESTAURANT', 'RETAIL_STORE', 'RETAIL'])
  storeType?: 'RESTAURANT' | 'RETAIL_STORE' | 'RETAIL';

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

class UpdateAdminDto extends CreateAdminDto {}

@Controller('superadmin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPERADMIN')
export class SuperadminController {
  constructor(private readonly superadminService: SuperadminService) {}

  @Get('admins')
  listAdmins() {
    return this.superadminService.listAdminUsers();
  }

  @Get('activity-logs')
  listActivityLogs(
    @Query('user_id') userId: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('actor_user_id') actorUserId?: string,
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('search') search?: string,
  ) {
    return this.superadminService.listActivityLogs({
      userId: Number(userId),
      dateFrom,
      dateTo,
      actorUserId: actorUserId ? Number(actorUserId) : undefined,
      module,
      action,
      search,
    });
  }

  @Post('admins')
  createAdmin(@Body() body: CreateAdminDto) {
    const fullName = body.full_name ?? body.fullName;
    const storeType = this.normalizeStoreType(body.store_type ?? body.storeType);

    if (!fullName?.trim()) {
      throw new BadRequestException('Full name is required.');
    }

    if (!body.email?.trim()) {
      throw new BadRequestException('Email is required.');
    }

    return this.superadminService.createAdminAccount({
      fullName,
      email: body.email,
      storeType,
      password: body.password,
    });
  }

  @Patch('admins/:id')
  updateAdmin(@Param('id') id: string, @Body() body: UpdateAdminDto) {
    const fullName = body.full_name ?? body.fullName;
    const storeType = this.normalizeStoreType(body.store_type ?? body.storeType);

    if (!fullName?.trim()) {
      throw new BadRequestException('Full name is required.');
    }

    if (!body.email?.trim()) {
      throw new BadRequestException('Email is required.');
    }

    return this.superadminService.updateAdminAccount({
      adminUserId: Number(id),
      fullName,
      email: body.email,
      storeType,
      password: body.password,
    });
  }

  @Delete('admins/:id')
  deleteAdmin(@Param('id') id: string) {
    return this.superadminService.deleteAdminAccount(Number(id));
  }

  @Delete('admins/:id/permanent')
  permanentlyDeleteAdmin(@Param('id') id: string) {
    return this.superadminService.permanentlyDeleteAdminAccount(Number(id));
  }

  @Patch('admins/:id/activate')
  activateAdmin(@Param('id') id: string) {
    return this.superadminService.activateAdminAccount(Number(id));
  }

  private normalizeStoreType(storeType: CreateAdminDto['store_type']) {
    if (storeType === 'RETAIL') {
      return 'RETAIL_STORE';
    }

    if (storeType === 'RESTAURANT' || storeType === 'RETAIL_STORE') {
      return storeType;
    }

    throw new BadRequestException('Store type must be RESTAURANT or RETAIL_STORE.');
  }
}
