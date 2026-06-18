import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { IsFutureDate } from '../../common/validators/is-future-date.validator';

export enum TargetCustomer {
  Male = 'Male',
  Female = 'Female',
  Unisex = 'Unisex',
}

export enum InventoryCondition {
  Excellent = 'Excellent',
  Good = 'Good',
  Fair = 'Fair',
  Damaged = 'Damaged',
}

export enum InventoryItemType {
  RetailItem = 'RETAIL_ITEM',
  Ingredient = 'INGREDIENT',
  MenuItem = 'MENU_ITEM',
  Supply = 'SUPPLY',
  Bundle = 'BUNDLE',
}

export class CreateInventoryDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEnum(InventoryItemType)
  itemType?: InventoryItemType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sku?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  barcode?: string;

  @IsString()
  @MinLength(2)
  category!: string;

  @IsOptional()
  @IsEnum(TargetCustomer)
  targetCustomer?: TargetCustomer;

  @IsOptional()
  @IsString()
  @MinLength(2)
  subcategory?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  size?: string;

  @IsOptional()
  @IsEnum(InventoryCondition)
  condition?: InventoryCondition;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsISO8601()
  @IsFutureDate({ message: 'expiryDate must be a future date' })
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  storageTemperature?: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
