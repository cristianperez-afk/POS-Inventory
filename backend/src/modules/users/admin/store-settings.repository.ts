import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ActivityLogRepository } from '../../../shared/activity-log.repository';
import { DatabaseService } from '../../../shared/database/database.service';

type StoreInformation = {
  id: number;
  store_id: number;
  business_name: string;
  business_description: string | null;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  logo: string | null;
  receipt_thank_you_message: string | null;
  receipt_footer_message: string | null;
  operating_hours: string | null;
  currency: string | null;
  theme_color: string | null;
  tax_rate: string | number | null;
  service_charge_rate: string | number | null;
  updated_at: Date | string | null;
};

const STORE_ADMIN_ROLES = ['ADMIN', 'STAFF', 'POS_MANAGER', 'INVENTORY_MANAGER', 'POS_ADMIN', 'INVENTORY_ADMIN'];

@Injectable()
export class StoreSettingsRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activityLogRepository: ActivityLogRepository,
  ) {}

  async getInformation(adminUserId: number): Promise<StoreInformation> {
    const user = await this.databaseService.getUserStoreScope(adminUserId);

    if (!STORE_ADMIN_ROLES.includes(String(user.role)) || !user.store_id) {
      throw new InternalServerErrorException('Only store users can view store information.');
    }

    await this.databaseService.ensureStoreInformationRow(user.store_id, user.store_name);

    const rows = await this.databaseService.query<StoreInformation>(
      `
        SELECT
          id,
          store_id,
          business_name,
          business_description,
          address,
          contact_number,
          email,
          logo,
          receipt_thank_you_message,
          receipt_footer_message,
          operating_hours,
          currency,
          theme_color,
          tax_rate,
          service_charge_rate,
          updated_at
        FROM store_information
        WHERE store_id = $1
        LIMIT 1
      `,
      [user.store_id],
    );

    if (rows.length === 0) {
      throw new InternalServerErrorException('Store information was not found.');
    }

    return rows[0];
  }

  async updateInformation(input: {
    adminUserId: number;
    businessName: string;
    businessDescription: string | null;
    address: string | null;
    contactNumber: string | null;
    email: string | null;
    logo: string | null;
    receiptThankYouMessage: string | null;
    receiptFooterMessage: string | null;
    operatingHours: string | null;
    currency: string | null;
    themeColor: string | null;
    taxRate: number | null;
    serviceChargeRate: number | null;
  }): Promise<StoreInformation> {
    const admin = await this.databaseService.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can update store information.');
    }

    await this.databaseService.ensureStoreInformationRow(admin.store_id, admin.store_name);

    const rows = await this.databaseService.query<StoreInformation>(
      `
        UPDATE store_information
        SET
          business_name = $1,
          business_description = $2,
          address = $3,
          contact_number = $4,
          email = $5,
          logo = $6,
          receipt_thank_you_message = $7,
          receipt_footer_message = $8,
          operating_hours = $9,
          currency = $10,
          theme_color = $11,
          tax_rate = $12,
          service_charge_rate = $13,
          updated_at = CURRENT_TIMESTAMP
        WHERE store_id = $14
        RETURNING
          id,
          store_id,
          business_name,
          business_description,
          address,
          contact_number,
          email,
          logo,
          receipt_thank_you_message,
          receipt_footer_message,
          operating_hours,
          currency,
          theme_color,
          tax_rate,
          service_charge_rate,
          updated_at
      `,
      [
        input.businessName,
        input.businessDescription,
        input.address,
        input.contactNumber,
        input.email,
        input.logo,
        input.receiptThankYouMessage,
        input.receiptFooterMessage,
        input.operatingHours,
        input.currency,
        input.themeColor,
        input.taxRate,
        input.serviceChargeRate,
        admin.store_id,
      ],
    );

    await this.activityLogRepository.record({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Store Settings',
      action: 'Store Information Updated',
      details: `Store information updated\nBusiness Name: ${rows[0].business_name}`,
    });

    return rows[0];
  }

  async getSettings(adminUserId: number) {
    const admin = await this.databaseService.getUserStoreScope(adminUserId);

    if (!admin.store_id) {
      throw new InternalServerErrorException('Only store-linked accounts can view store settings.');
    }

    await this.databaseService.ensureStoreSettingsRow(admin.store_id, admin.store_type);

    const rows = await this.databaseService.query(
      `
        SELECT *
        FROM store_settings
        WHERE store_id = $1
          AND (store_type = $2 OR store_type IS NULL)
        LIMIT 1
      `,
      [admin.store_id, admin.store_type],
    );

    return rows[0];
  }

  async updateSettings(input: {
    adminUserId: number;
    enableCustomerRecommendation?: boolean;
    enableTableManagement?: boolean;
    enableRefund?: boolean;
    enableVoid?: boolean;
    enableDiscount?: boolean;
    enableEstimatedPrepTime?: boolean;
    prepTimeStrategy?: string;
    customizationPrepTimeMinutes?: number;
    enableServiceCharge?: boolean;
    serviceChargeRate?: number;
    enableTax?: boolean;
    taxRate?: number;
    enableDineIn?: boolean;
    enableTakeout?: boolean;
    enableIngredientCustomization?: boolean;
    enableReceiptPrinting?: boolean;
    enabledPaymentMethods?: string[];
    paymentMethodAccounts?: Record<string, unknown>;
    autoDeductInventoryOnSale?: boolean;
    allowNegativeStock?: boolean;
    defaultLowStockThreshold?: number;
    defaultInventoryUnit?: string;
    cycleCountIntervalDays?: number;
    autoReorderThresholdPercent?: number;
    enableExpiryTracking?: boolean;
    defaultMarkupPercent?: number;
  }) {
    const admin = await this.databaseService.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can update store settings.');
    }

    await this.databaseService.ensureStoreSettingsRow(admin.store_id, admin.store_type);

    const rows = await this.databaseService.query(
      `
        UPDATE store_settings
        SET
          enable_customer_recommendation = COALESCE($1, enable_customer_recommendation),
          enable_table_management = COALESCE($2, enable_table_management),
          enable_refund = COALESCE($3, enable_refund),
          enable_void = COALESCE($4, enable_void),
          enable_discount = COALESCE($5, enable_discount),
          enable_estimated_prep_time = COALESCE($6, enable_estimated_prep_time),
          prep_time_strategy = COALESCE($7, prep_time_strategy),
          customization_prep_time_minutes = COALESCE($8, customization_prep_time_minutes),
          enable_service_charge = COALESCE($9, enable_service_charge),
          service_charge_rate = COALESCE($10, service_charge_rate),
          service_charge_percentage = COALESCE($10, service_charge_percentage),
          enable_tax = COALESCE($11, enable_tax),
          tax_rate = COALESCE($12, tax_rate),
          enable_dine_in = COALESCE($13, enable_dine_in),
          enable_takeout = COALESCE($14, enable_takeout),
          enable_ingredient_customization = COALESCE($15, enable_ingredient_customization),
          enable_receipt_printing = COALESCE($16, enable_receipt_printing),
          enabled_payment_methods = COALESCE($17, enabled_payment_methods),
          payment_method_accounts = COALESCE($18, payment_method_accounts),
          auto_deduct_inventory_on_sale = COALESCE($19, auto_deduct_inventory_on_sale),
          allow_negative_stock = COALESCE($20, allow_negative_stock),
          default_low_stock_threshold = COALESCE($21, default_low_stock_threshold),
          default_inventory_unit = COALESCE($22, default_inventory_unit),
          cycle_count_interval_days = COALESCE($23, cycle_count_interval_days),
          auto_reorder_threshold_percent = COALESCE($24, auto_reorder_threshold_percent),
          enable_expiry_tracking = COALESCE($25, enable_expiry_tracking),
          default_markup_percent = COALESCE($26, default_markup_percent),
          store_type = COALESCE(store_type, $27),
          updated_at = CURRENT_TIMESTAMP
        WHERE store_id = $28
          AND (store_type = $27 OR store_type IS NULL)
        RETURNING *
      `,
      [
        input.enableCustomerRecommendation,
        input.enableTableManagement,
        input.enableRefund,
        input.enableVoid,
        input.enableDiscount,
        input.enableEstimatedPrepTime,
        input.prepTimeStrategy === 'sequential' ? 'sequential' : input.prepTimeStrategy === 'parallel' ? 'parallel' : null,
        input.customizationPrepTimeMinutes,
        input.enableServiceCharge,
        input.serviceChargeRate,
        input.enableTax,
        input.taxRate,
        input.enableDineIn,
        input.enableTakeout,
        input.enableIngredientCustomization,
        input.enableReceiptPrinting,
        input.enabledPaymentMethods ?? null,
        input.paymentMethodAccounts ? JSON.stringify(input.paymentMethodAccounts) : null,
        input.autoDeductInventoryOnSale,
        input.allowNegativeStock,
        input.defaultLowStockThreshold,
        input.defaultInventoryUnit,
        input.cycleCountIntervalDays,
        input.autoReorderThresholdPercent,
        input.enableExpiryTracking,
        input.defaultMarkupPercent,
        admin.store_type,
        admin.store_id,
      ],
    );

    await this.activityLogRepository.record({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Store Settings',
      action: 'Store Settings Updated',
      details: `Store settings updated\nRefunds: ${rows[0].enable_refund ? 'Enabled' : 'Disabled'}\nVoids: ${rows[0].enable_void ? 'Enabled' : 'Disabled'}`,
    });

    return rows[0];
  }

  private isStoreManagerRole(role: unknown) {
    return role === 'POS_MANAGER' || role === 'INVENTORY_MANAGER' || role === 'POS_ADMIN' || role === 'INVENTORY_ADMIN' || role === 'ADMIN';
  }
}
