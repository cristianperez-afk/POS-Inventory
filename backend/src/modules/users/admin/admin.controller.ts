import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsNumber, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AdminService } from './admin.service';

const STAFF_TYPES = ['POS_STAFF', 'INVENTORY_STAFF'] as const;
const STAFF_ROLES = ['STAFF', 'POS_MANAGER', 'INVENTORY_MANAGER'] as const;
type StaffType = (typeof STAFF_TYPES)[number];
type StaffRole = (typeof STAFF_ROLES)[number];

class CreateStaffDto {
  @Type(() => Number)
  @IsNumber()
  admin_user_id!: number;

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
  @Type(() => Number)
  @IsNumber()
  admin_user_id!: number;

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
  @Type(() => Number)
  @IsNumber()
  user_id!: number;

  @IsString()
  @MinLength(4)
  void_pin!: string;
}

class RetailManagerProfileDto {
  @Type(() => Number)
  @IsNumber()
  user_id!: number;
}

class UpdateStoreInformationDto {
  @Type(() => Number)
  @IsNumber()
  admin_user_id!: number;

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
  @Type(() => Number)
  @IsNumber()
  admin_user_id!: number;

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

class DiscountSettingDto {
  @Type(() => Number)
  @IsNumber()
  admin_user_id!: number;

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
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('staff')
  listStaff(@Query('admin_user_id') adminUserId: string) {
    return this.adminService.listStaff(Number(adminUserId));
  }

  @Post('staff')
  createStaff(@Body() body: CreateStaffDto) {
    return this.adminService.createStaff({
      adminUserId: Number(body.admin_user_id),
      fullName: body.full_name,
      email: body.email,
      password: body.password,
      staffType: body.staff_type,
      role: body.role,
      voidPin: body.void_pin,
    });
  }

  @Patch('staff/:id')
  updateStaff(@Param('id') id: string, @Body() body: UpdateStaffDto) {
    return this.adminService.updateStaff({
      adminUserId: Number(body.admin_user_id),
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
  verifyRetailVoidPin(@Body() body: VerifyRetailVoidPinDto) {
    return this.adminService.verifyRetailVoidPin({
      userId: Number(body.user_id),
      voidPin: body.void_pin,
    });
  }

  @Get('retail/manager-profile')
  getRetailManagerProfile(@Query('user_id') userId: string) {
    return this.adminService.getRetailManagerProfile(Number(userId));
  }

  @Post('retail/manager-profile/unique-pin')
  generateRetailManagerUniquePin(@Body() body: RetailManagerProfileDto) {
    return this.adminService.generateRetailManagerUniquePin(Number(body.user_id));
  }

  @Delete('staff/:id')
  deleteStaff(@Param('id') id: string, @Query('admin_user_id') adminUserId: string) {
    return this.adminService.deleteStaff({
      adminUserId: Number(adminUserId),
      staffUserId: Number(id),
    });
  }

  @Delete('staff/:id/permanent')
  permanentlyDeleteStaff(@Param('id') id: string, @Query('admin_user_id') adminUserId: string) {
    return this.adminService.permanentlyDeleteStaff({
      adminUserId: Number(adminUserId),
      staffUserId: Number(id),
    });
  }

  @Patch('staff/:id/activate')
  activateStaff(@Param('id') id: string, @Query('admin_user_id') adminUserId: string) {
    return this.adminService.activateStaff({
      adminUserId: Number(adminUserId),
      staffUserId: Number(id),
    });
  }

  @Get('store-information')
  getStoreInformation(@Query('admin_user_id') adminUserId: string) {
    return this.adminService.getStoreInformation(Number(adminUserId));
  }

  @Post('store-information')
  updateStoreInformation(@Body() body: UpdateStoreInformationDto) {
    return this.adminService.updateStoreInformation({
      adminUserId: Number(body.admin_user_id),
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
  getStoreSettings(@Query('admin_user_id') adminUserId: string) {
    return this.adminService.getStoreSettings(Number(adminUserId));
  }

  @Post('store-settings')
  updateStoreSettings(@Body() body: UpdateStoreSettingsDto) {
    return this.adminService.updateStoreSettings({
      adminUserId: Number(body.admin_user_id),
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

  @Get('discount-settings')
  listDiscountSettings(@Query('admin_user_id') adminUserId: string) {
    return this.adminService.listDiscountSettings(Number(adminUserId));
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
    return this.adminService.listActivityLogs({
      userId: Number(userId),
      dateFrom,
      dateTo,
      actorUserId: actorUserId ? Number(actorUserId) : undefined,
      module,
      action,
      search,
    });
  }

  @Post('activity-logs')
  recordActivityLog(@Body() body: any) {
    return this.adminService.recordActivityLog({
      userId: Number(body.user_id),
      module: String(body.module ?? ''),
      action: String(body.action ?? ''),
      details: String(body.details ?? ''),
    });
  }

  @Post('discount-settings')
  createDiscountSetting(@Body() body: DiscountSettingDto) {
    return this.adminService.createDiscountSetting({
      adminUserId: Number(body.admin_user_id),
      discountName: body.discount_name,
      discountRate: body.discount_rate,
      isEnabled: body.is_enabled ?? true,
    });
  }

  @Patch('discount-settings/:id')
  updateDiscountSetting(@Param('id') id: string, @Body() body: DiscountSettingDto) {
    return this.adminService.updateDiscountSetting({
      adminUserId: Number(body.admin_user_id),
      discountId: Number(id),
      discountName: body.discount_name,
      discountRate: body.discount_rate,
      isEnabled: body.is_enabled ?? true,
    });
  }

  @Delete('discount-settings/:id')
  deleteDiscountSetting(@Param('id') id: string, @Query('admin_user_id') adminUserId: string) {
    return this.adminService.deleteDiscountSetting({
      adminUserId: Number(adminUserId),
      discountId: Number(id),
    });
  }

  @Get('pos/products')
  listPosProducts(@Query('user_id') userId: string) {
    return this.adminService.listPosProducts(Number(userId));
  }

  @Get('pos/orders')
  listPosOrders(@Query('user_id') userId: string) {
    return this.adminService.listPosOrders(Number(userId));
  }

  @Get('pos/tables')
  listDiningTables(@Query('user_id') userId: string) {
    return this.adminService.listDiningTables(Number(userId));
  }

  @Post('pos/tables')
  createDiningTable(@Body() body: any) {
    return this.adminService.createDiningTable({
      userId: Number(body.user_id),
      tableNumber: String(body.table_number ?? body.table_name ?? ''),
      totalSeats: Number(body.total_seats),
      isShared: Boolean(body.is_shared),
    });
  }

  @Patch('pos/tables/:id')
  updateDiningTable(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateDiningTable({
      userId: Number(body.user_id),
      tableId: id,
      tableNumber: String(body.table_number ?? body.table_name ?? ''),
      totalSeats: Number(body.total_seats),
      isShared: Boolean(body.is_shared),
    });
  }

  @Delete('pos/tables/:id')
  deleteDiningTable(@Param('id') id: string, @Query('user_id') userId: string) {
    return this.adminService.deleteDiningTable({
      userId: Number(userId),
      tableId: id,
    });
  }

  @Patch('pos/tables/:id/occupancy')
  setDiningTableOccupancy(@Param('id') id: string, @Body() body: any) {
    return this.adminService.setDiningTableOccupancy({
      userId: Number(body.user_id),
      tableId: id,
      occupiedSeats: Number(body.occupied_seats),
    });
  }

  @Get('pos/next-order-number')
  getNextPosOrderNumber(@Query('user_id') userId: string) {
    return this.adminService.getNextPosOrderNumber(Number(userId));
  }

  @Post('pos/orders')
  createPaidPosOrder(@Body() body: any) {
    return this.adminService.createPaidPosOrder({
      ...body,
      userId: Number(body.user_id),
    });
  }

  @Patch('pos/orders/:orderNumber')
  updatePosOrder(@Param('orderNumber') orderNumber: string, @Body() body: any) {
    return this.adminService.updatePosOrder({
      ...body,
      orderNumber,
      userId: Number(body.user_id),
    });
  }
}
