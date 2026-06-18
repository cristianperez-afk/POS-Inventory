import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { KitchenOrderStatus } from '@prisma/client';

export class CreateKitchenOrderDto {
  @IsString()
  @MinLength(1)
  receiptNo!: string;

  @IsUUID()
  recipeId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @IsIn([KitchenOrderStatus.PENDING, KitchenOrderStatus.COMPLETED])
  status?: KitchenOrderStatus;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  excludedIngredientIds?: string[];
}
