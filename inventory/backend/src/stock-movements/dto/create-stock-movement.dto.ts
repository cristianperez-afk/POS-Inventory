import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { BusinessModule } from '@prisma/client';

export enum StockMovementType {
  StockIn = 'STOCK_IN',
  StockOut = 'STOCK_OUT',
  Adjustment = 'ADJUSTMENT',
  TransferIn = 'TRANSFER_IN',
  TransferOut = 'TRANSFER_OUT',
  Sale = 'SALE',
  RecipeConsumption = 'RECIPE_CONSUMPTION',
  Spoilage = 'SPOILAGE',
  Expiry = 'EXPIRY',
  VoidRestock = 'VOID_RESTOCK',
}

export class CreateStockMovementDto {
  @IsOptional()
  @IsEnum(BusinessModule)
  module?: BusinessModule;

  @IsUUID()
  itemId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsEnum(StockMovementType)
  type!: StockMovementType;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  referenceType?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  referenceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  notes?: string;
}
