import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsNumber, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthenticatedUser } from '../../../shared/common/types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AdminService } from './admin.service';

const STAFF_TYPES = ['POS_STAFF', 'INVENTORY_STAFF'] as const;
const STAFF_ROLES = ['STAFF', 'POS_MANAGER', 'INVENTORY_MANAGER'] as const;
type StaffType = (typeof STAFF_TYPES)[number];
type StaffRole = (typeof STAFF_ROLES)[number];

class CreateStaffDto {
  @IsString()
  full_name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn(STAFF_TYPES)
  staff_type!: StaffType;

  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;

  @IsOptional()
  @IsString()
  @MinLength(4)
  void_pin?: string;
}

class UpdateStaffDto {
  @IsString()
  full_name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsIn(STAFF_TYPES)
  staff_type!: StaffType;

  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;

  @IsOptional()
  @IsString()
  @MinLength(4)
  void_pin?: string;
}

class VerifyRetailVoidPinDto {
  @IsString()
  @MinLength(4)
  void_pin!: string;
}

class UpdateStoreInformationDto {
  @IsString()
  business_name!: string;

  @IsOptional()
  @IsString()
  business_description?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  contact_number?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  logo?: string | null;

  @IsOptional()
  @IsString()
  receipt_thank_you_message?: string | null;

  @IsOptional()
  @IsString()
  receipt_footer_message?: string | null;

  @IsOptional()
  @IsString()
  operating_hours?: string | null;

  @IsOptional()
  @IsString()
  currency?: string | null;

  @IsOptional()
  @IsString()
  theme_color?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tax_rate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  service_charge_rate?: number | null;
}

class UpdateStoreSettingsDto {
  @IsOptional()
  @IsBoolean()
  enable_customer_recommendation?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_table_management?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_refund?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_void?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_discount?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_estimated_prep_time?: boolean;

  @IsOptional()
  @IsString()
  prep_time_strategy?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  customization_prep_time_minutes?: number;

  @IsOptional()
  @IsBoolean()
  enable_service_charge?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  service_charge_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  service_charge_percentage?: number;

  @IsOptional()
  @IsBoolean()
  enable_tax?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tax_rate?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabled_payment_methods?: string[];

  @IsOptional()
  @IsObject()
  payment_method_accounts?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enable_dine_in?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_takeout?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_ingredient_customization?: boolean;

  @IsOptional()
  @IsBoolean()
  enable_receipt_printing?: boolean;

  @IsOptional()
  @IsBoolean()
  auto_deduct_inventory_on_sale?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_negative_stock?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  default_low_stock_threshold?: number;

  @IsOptional()
  @IsString()
  default_inventory_unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cycle_count_interval_days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  auto_reorder_threshold_percent?: number;

  @IsOptional()
  @IsBoolean()
  enable_expiry_tracking?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  default_markup_percent?: number;
}

class ThemePreferencesDto {
  @IsOptional()
  @IsBoolean()
  compact_mode?: boolean;

  @IsOptional()
  @IsBoolean()
  low_stock_alerts?: boolean;

  @IsOptional()
  @IsString()
  default_workspace?: string;

  @IsOptional()
  @IsString()
  theme_mode?: string;

  @IsOptional()
  @IsString()
  theme_preset?: string | null;

  @IsOptional()
  @IsString()
  appearance?: string;

  @IsOptional()
  @IsString()
  primary_color?: string;

  @IsOptional()
  @IsString()
  secondary_color?: string;

  @IsOptional()
  @IsString()
  sidebar_color?: string;
}

class DiscountSettingDto {
  @IsString()
  discount_name!: string;

  @Type(() => Number)
  @IsNumber()
  discount_rate!: number;

  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
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

  @Get('store-information')
  getStoreInformation(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.getStoreInformation(user.id);
  }

  @Post('store-information')
  @Permissions('settings:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  updateStoreInformation(@Body() body: UpdateStoreInformationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updateStoreInformation({
      adminUserId: user.id,
      businessName: body.business_name,
      businessDescription: body.business_description ?? null,
      address: body.address ?? null,
      contactNumber: body.contact_number ?? null,
      email: body.email ?? null,
      logo: body.logo ?? null,
      receiptThankYouMessage: body.receipt_thank_you_message ?? null,
      receiptFooterMessage: body.receipt_footer_message ?? null,
      operatingHours: body.operating_hours ?? null,
      currency: body.currency ?? null,
      themeColor: body.theme_color ?? null,
      taxRate: body.tax_rate ?? null,
      serviceChargeRate: body.service_charge_rate ?? null,
    });
  }

  @Get('store-settings')
  getStoreSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.getStoreSettings(user.id);
  }

  @Post('store-settings')
  @Permissions('settings:manage')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  updateStoreSettings(@Body() body: UpdateStoreSettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updateStoreSettings({
      adminUserId: user.id,
      enableCustomerRecommendation: body.enable_customer_recommendation,
      enableTableManagement: body.enable_table_management,
      enableRefund: body.enable_refund,
      enableVoid: body.enable_void,
      enableDiscount: body.enable_discount,
      enableEstimatedPrepTime: body.enable_estimated_prep_time,
      prepTimeStrategy: body.prep_time_strategy,
      customizationPrepTimeMinutes: body.customization_prep_time_minutes,
      enableServiceCharge: body.enable_service_charge,
      serviceChargeRate: body.service_charge_rate ?? body.service_charge_percentage,
      enableTax: body.enable_tax,
      taxRate: body.tax_rate,
      enableDineIn: body.enable_dine_in,
      enableTakeout: body.enable_takeout,
      enableIngredientCustomization: body.enable_ingredient_customization,
      enableReceiptPrinting: body.enable_receipt_printing,
      enabledPaymentMethods: body.enabled_payment_methods,
      paymentMethodAccounts: body.payment_method_accounts,
      autoDeductInventoryOnSale: body.auto_deduct_inventory_on_sale,
      allowNegativeStock: body.allow_negative_stock,
      defaultLowStockThreshold: body.default_low_stock_threshold,
      defaultInventoryUnit: body.default_inventory_unit,
      cycleCountIntervalDays: body.cycle_count_interval_days,
      autoReorderThresholdPercent: body.auto_reorder_threshold_percent,
      enableExpiryTracking: body.enable_expiry_tracking,
      defaultMarkupPercent: body.default_markup_percent,
    });
  }

  @Get('theme-preferences')
  getThemePreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.getThemePreferences(user.id);
  }

  @Post('theme-preferences/personal')
  @Permissions('theme:manage_personal')
  updatePersonalThemePreferences(@Body() preferences: ThemePreferencesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updatePersonalThemePreferences({
      userId: user.id,
      preferences: preferences as unknown as Record<string, unknown>,
    });
  }

  @Delete('theme-preferences/personal')
  @Permissions('theme:manage_personal')
  clearPersonalThemePreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.clearPersonalThemePreferences(user.id);
  }

  @Post('theme-preferences/store')
  @Permissions('theme:manage_store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  updateStoreThemePreferences(@Body() preferences: ThemePreferencesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updateStoreThemePreferences({
      userId: user.id,
      preferences: preferences as unknown as Record<string, unknown>,
    });
  }

  @Delete('theme-preferences/store')
  @Permissions('theme:manage_store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  clearStoreThemePreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.clearStoreThemePreferences(user.id);
  }

  @Get('discount-settings')
  listDiscountSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.listDiscountSettings(user.id);
  }

  @Get('activity-logs')
  @Permissions('activity:read_store')
  listActivityLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('actor_user_id') actorUserId?: string,
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listActivityLogs({
      userId: user.id,
      dateFrom,
      dateTo,
      actorUserId: actorUserId ? Number(actorUserId) : undefined,
      module,
      action,
      search,
    });
  }

  @Post('activity-logs')
  @Permissions('activity:read_store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  recordActivityLog(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.recordActivityLog({
      userId: user.id,
      module: String(body.module ?? ''),
      action: String(body.action ?? ''),
      details: String(body.details ?? ''),
    });
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

  @Get('pos/products')
  listPosProducts(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.listPosProducts(user.id);
  }

  @Get('pos/orders')
  listPosOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.listPosOrders(user.id);
  }

  @Get('pos/tables')
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
