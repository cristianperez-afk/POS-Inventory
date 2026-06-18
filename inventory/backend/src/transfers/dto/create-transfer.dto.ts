import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BusinessModule } from '@prisma/client';

export class TransferItemDto {
  @IsUUID()
  inventoryItemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateTransferDto {
  @IsOptional()
  @IsEnum(BusinessModule)
  module?: BusinessModule;

  @IsUUID()
  fromLocationId: string;

  @IsUUID()
  toLocationId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];
}
