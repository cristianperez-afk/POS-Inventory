import { IsString, MinLength } from 'class-validator';

export class VoidKitchenOrderDto {
  @IsString()
  @MinLength(2)
  voidReason!: string;
}
