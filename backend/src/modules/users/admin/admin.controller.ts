import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthenticatedUser } from '../../../shared/common/types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AdminService } from './admin.service';

const STAFF_TYPES = ['POS_STAFF', 'INVENTORY_STAFF', 'MANAGER'] as const;
type StaffType = (typeof STAFF_TYPES)[number];

class CreateStaffDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  admin_user_id?: number;

  @IsString()
  full_name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn(STAFF_TYPES)
  staff_type!: StaffType;
}

class UpdateStaffDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  admin_user_id?: number;

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
}

class UpdateStoreInformationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  admin_user_id?: number;

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
  @Type(() => Number)
  @IsNumber()
  admin_user_id?: number;

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
}

class DiscountSettingDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  admin_user_id?: number;

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
  listStaff(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.listStaff(user.id);
  }

  @Post('staff')
  createStaff(@Body() body: CreateStaffDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.createStaff({
      adminUserId: user.id,
      fullName: body.full_name,
      email: body.email,
      password: body.password,
      staffType: body.staff_type,
    });
  }

  @Patch('staff/:id')
  updateStaff(@Param('id') id: string, @Body() body: UpdateStaffDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updateStaff({
      adminUserId: user.id,
      staffUserId: Number(id),
      fullName: body.full_name,
      email: body.email,
      password: body.password,
      staffType: body.staff_type,
    });
  }

  @Delete('staff/:id')
  deleteStaff(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.deleteStaff({
      adminUserId: user.id,
      staffUserId: Number(id),
    });
  }

  @Delete('staff/:id/permanent')
  permanentlyDeleteStaff(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.permanentlyDeleteStaff({
      adminUserId: user.id,
      staffUserId: Number(id),
    });
  }

  @Patch('staff/:id/activate')
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
  updateStoreSettings(@Body() body: UpdateStoreSettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updateStoreSettings({
      adminUserId: user.id,
      enableCustomerRecommendation: body.enable_customer_recommendation,
      enableTableManagement: body.enable_table_management,
      enableRefund: body.enable_refund,
      enableVoid: body.enable_void,
      enableDiscount: body.enable_discount,
      enableServiceCharge: body.enable_service_charge,
      serviceChargeRate: body.service_charge_rate ?? body.service_charge_percentage,
      enableTax: body.enable_tax,
      taxRate: body.tax_rate,
      enableDineIn: body.enable_dine_in,
      enableTakeout: body.enable_takeout,
      enableIngredientCustomization: body.enable_ingredient_customization,
      enableReceiptPrinting: body.enable_receipt_printing,
      enabledPaymentMethods: body.enabled_payment_methods,
    });
  }

  @Get('discount-settings')
  listDiscountSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.listDiscountSettings(user.id);
  }

  @Post('discount-settings')
  createDiscountSetting(@Body() body: DiscountSettingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.createDiscountSetting({
      adminUserId: user.id,
      discountName: body.discount_name,
      discountRate: body.discount_rate,
      isEnabled: body.is_enabled ?? true,
    });
  }

  @Patch('discount-settings/:id')
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

  @Get('pos/next-order-number')
  getNextPosOrderNumber(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.getNextPosOrderNumber(user.id);
  }

  @Post('pos/orders')
  createPaidPosOrder(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.createPaidPosOrder({
      ...body,
      userId: user.id,
    });
  }

  @Patch('pos/orders/:orderNumber')
  updatePosOrder(@Param('orderNumber') orderNumber: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.adminService.updatePosOrder({
      ...body,
      orderNumber,
      userId: user.id,
    });
  }
}
