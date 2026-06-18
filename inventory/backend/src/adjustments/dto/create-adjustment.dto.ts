import { IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BusinessModule } from '@prisma/client';

export enum AdjustmentTypeEnum {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
  DAMAGE = 'DAMAGE',
  LOST = 'LOST',
  FOUND = 'FOUND',
  RECOUNT = 'RECOUNT',
}

export class CreateAdjustmentItemDto {
  @IsString()
  inventoryItemId: string;

  @IsNumber()
  quantityChange: number;

  @IsString()
  locationId: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateAdjustmentDto {
  @IsEnum(AdjustmentTypeEnum)
  type: AdjustmentTypeEnum;

  @IsEnum(BusinessModule)
  @IsOptional()
  module?: BusinessModule;

  @IsString()
  reason: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAdjustmentItemDto)
  items: CreateAdjustmentItemDto[];
}
