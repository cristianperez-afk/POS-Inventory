import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedUser } from '../../../shared/common/types';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UpdateStoreInformationDto, UpdateStoreSettingsDto } from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminSettingsController {
  constructor(private readonly adminService: AdminService) {}

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
}
