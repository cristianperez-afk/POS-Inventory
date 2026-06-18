import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { AdminService } from './admin.service';

const STAFF_TYPES = ['POS_STAFF', 'INVENTORY_STAFF', 'MANAGER'] as const;
type StaffType = (typeof STAFF_TYPES)[number];

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

class CategoryDto {
  @Type(() => Number)
  @IsNumber()
  admin_user_id!: number;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

class ProductDto {
  @Type(() => Number)
  @IsNumber()
  admin_user_id!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  category_id?: number | null;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  brand?: string | null;

  @IsOptional()
  @IsString()
  material?: string | null;

  @Type(() => Number)
  @IsNumber()
  price!: number;

  @IsOptional()
  @IsString()
  image_url?: string | null;

  @IsOptional()
  @IsString()
  meal_type?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  preparation_time_minutes?: number | null;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsOptional()
  @IsString()
  unit?: string | null;

  @IsOptional()
  @IsString()
  size?: string | null;

  @IsOptional()
  @IsString()
  color?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stock_quantity?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  low_stock_limit?: number | null;

  @IsOptional()
  @IsBoolean()
  is_available?: boolean;

  @IsOptional()
  ingredients?: any[];

  @IsOptional()
  variants?: any[];
}

class IngredientDto {
  @Type(() => Number)
  @IsNumber()
  admin_user_id!: number;

  @IsString()
  ingredient_name!: string;

  @Type(() => Number)
  @IsNumber()
  quantity_available!: number;

  @IsString()
  unit!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  low_stock_limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cost_per_unit?: number;

  @IsOptional()
  @IsBoolean()
  is_available?: boolean;
}

class IngredientAlternativeDto {
  @Type(() => Number)
  @IsNumber()
  admin_user_id!: number;

  @Type(() => Number)
  @IsNumber()
  parent_ingredient_id!: number;

  @Type(() => Number)
  @IsNumber()
  alternative_ingredient_id!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  additional_price?: number;

  @IsOptional()
  @IsBoolean()
  is_available?: boolean;
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
    });
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
  listDiscountSettings(@Query('admin_user_id') adminUserId: string) {
    return this.adminService.listDiscountSettings(Number(adminUserId));
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

  @Get('categories')
  listCategories(@Query('admin_user_id') adminUserId: string) {
    return this.adminService.listCategories(Number(adminUserId));
  }

  @Post('categories')
  createCategory(@Body() body: CategoryDto) {
    return this.adminService.createCategory({
      adminUserId: Number(body.admin_user_id),
      name: body.name,
      description: body.description ?? null,
    });
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: CategoryDto) {
    return this.adminService.updateCategory({
      adminUserId: Number(body.admin_user_id),
      categoryId: Number(id),
      name: body.name,
      description: body.description ?? null,
    });
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string, @Query('admin_user_id') adminUserId: string) {
    return this.adminService.deleteCategory({
      adminUserId: Number(adminUserId),
      categoryId: Number(id),
    });
  }

  @Get('products')
  listProducts(@Query('admin_user_id') adminUserId: string) {
    return this.adminService.listProducts(Number(adminUserId));
  }

  @Post('products')
  createProduct(@Body() body: ProductDto) {
    return this.adminService.createProduct({
      ...body,
      adminUserId: Number(body.admin_user_id),
      categoryId: body.category_id ?? null,
    });
  }

  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() body: ProductDto) {
    return this.adminService.updateProduct({
      ...body,
      adminUserId: Number(body.admin_user_id),
      productId: Number(id),
      categoryId: body.category_id ?? null,
    });
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string, @Query('admin_user_id') adminUserId: string) {
    return this.adminService.deleteProduct({
      adminUserId: Number(adminUserId),
      productId: Number(id),
    });
  }

  @Get('ingredients')
  listIngredients(@Query('admin_user_id') adminUserId: string) {
    return this.adminService.listIngredients(Number(adminUserId));
  }

  @Post('ingredients')
  createIngredient(@Body() body: IngredientDto) {
    return this.adminService.createIngredient({
      adminUserId: Number(body.admin_user_id),
      ingredientName: body.ingredient_name,
      quantityAvailable: body.quantity_available,
      unit: body.unit,
      lowStockLimit: body.low_stock_limit ?? 0,
      costPerUnit: body.cost_per_unit ?? 0,
      isAvailable: body.is_available ?? true,
    });
  }

  @Patch('ingredients/:id')
  updateIngredient(@Param('id') id: string, @Body() body: IngredientDto) {
    return this.adminService.updateIngredient({
      adminUserId: Number(body.admin_user_id),
      ingredientId: Number(id),
      ingredientName: body.ingredient_name,
      quantityAvailable: body.quantity_available,
      unit: body.unit,
      lowStockLimit: body.low_stock_limit ?? 0,
      costPerUnit: body.cost_per_unit ?? 0,
      isAvailable: body.is_available ?? true,
    });
  }

  @Delete('ingredients/:id')
  deleteIngredient(@Param('id') id: string, @Query('admin_user_id') adminUserId: string) {
    return this.adminService.deleteIngredient({
      adminUserId: Number(adminUserId),
      ingredientId: Number(id),
    });
  }

  @Get('ingredient-alternatives')
  listIngredientAlternatives(@Query('admin_user_id') adminUserId: string) {
    return this.adminService.listIngredientAlternatives(Number(adminUserId));
  }

  @Post('ingredient-alternatives')
  createIngredientAlternative(@Body() body: IngredientAlternativeDto) {
    return this.adminService.createIngredientAlternative({
      adminUserId: Number(body.admin_user_id),
      parentIngredientId: body.parent_ingredient_id,
      alternativeIngredientId: body.alternative_ingredient_id,
      additionalPrice: body.additional_price ?? 0,
      isAvailable: body.is_available ?? true,
    });
  }

  @Patch('ingredient-alternatives/:id')
  updateIngredientAlternative(@Param('id') id: string, @Body() body: IngredientAlternativeDto) {
    return this.adminService.updateIngredientAlternative({
      adminUserId: Number(body.admin_user_id),
      alternativeId: Number(id),
      parentIngredientId: body.parent_ingredient_id,
      alternativeIngredientId: body.alternative_ingredient_id,
      additionalPrice: body.additional_price ?? 0,
      isAvailable: body.is_available ?? true,
    });
  }

  @Delete('ingredient-alternatives/:id')
  deleteIngredientAlternative(@Param('id') id: string, @Query('admin_user_id') adminUserId: string) {
    return this.adminService.deleteIngredientAlternative({
      adminUserId: Number(adminUserId),
      alternativeId: Number(id),
    });
  }

  @Get('inventory-deductions')
  listInventoryDeductions(@Query('admin_user_id') adminUserId: string) {
    return this.adminService.listInventoryDeductions(Number(adminUserId));
  }

  @Get('products/:id/ingredients')
  listProductIngredients(@Param('id') id: string, @Query('admin_user_id') adminUserId: string) {
    return this.adminService.listProductIngredients({
      adminUserId: Number(adminUserId),
      productId: Number(id),
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
