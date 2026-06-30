import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsNumber, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

const STAFF_TYPES = ['POS_STAFF', 'INVENTORY_STAFF'] as const;
const STAFF_ROLES = ['STAFF', 'POS_MANAGER', 'INVENTORY_MANAGER'] as const;
type StaffType = (typeof STAFF_TYPES)[number];
type StaffRole = (typeof STAFF_ROLES)[number];

export class CreateStaffDto {
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

export class UpdateStaffDto {
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

export class VerifyRetailVoidPinDto {
  @IsString()
  @MinLength(4)
  void_pin!: string;
}

export class UpdateStoreInformationDto {
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

export class UpdateStoreSettingsDto {
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

export class ThemePreferencesDto {
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

export class DiscountSettingDto {
  @IsString()
  discount_name!: string;

  @Type(() => Number)
  @IsNumber()
  discount_rate!: number;

  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}
