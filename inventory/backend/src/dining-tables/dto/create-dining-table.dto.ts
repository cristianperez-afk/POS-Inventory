import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateDiningTableDto {
  @IsString()
  @MinLength(1)
  tableNumber: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsUUID()
  locationId: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
