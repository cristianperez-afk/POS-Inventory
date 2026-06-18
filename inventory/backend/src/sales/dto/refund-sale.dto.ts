import { IsString, MinLength } from 'class-validator';

export class RefundSaleDto {
  @IsString()
  @MinLength(1)
  refundReason: string;
}
