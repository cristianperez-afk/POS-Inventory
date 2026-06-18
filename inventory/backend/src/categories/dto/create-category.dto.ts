import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { BusinessModule } from '@prisma/client';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEnum(BusinessModule)
  module: BusinessModule;

  @IsOptional()
  @IsString()
  description?: string;
}
