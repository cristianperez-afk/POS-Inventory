import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BusinessModule } from '@prisma/client';

export enum POPaymentMethod {
  CASH = 'Cash',
  CARD = 'Card',
  GCASH = 'GCash',
  BANK_TRANSFER = 'Bank Transfer',
  CHECK = 'Check',
  CREDIT_TERMS = 'Credit Terms',
}

export class PurchaseOrderItemDto {
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreatePurchaseOrderDto {
  @IsOptional()
  @IsEnum(BusinessModule)
  module?: BusinessModule;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(POPaymentMethod)
  paymentMethod?: POPaymentMethod;

  @IsOptional()
  @IsString()
  @MinLength(1)
  paymentTerms?: string;

  @IsOptional()
  @IsISO8601()
  expectedDelivery?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}
