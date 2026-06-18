import { IsString, MinLength } from 'class-validator';

export class RejectBundleDto {
  @IsString()
  @MinLength(1)
  rejectionReason: string;
}
