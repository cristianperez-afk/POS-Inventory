import { IsEnum } from 'class-validator';
import { DiningTableStatus } from '@prisma/client';

export class UpdateDiningTableStatusDto {
  @IsEnum(DiningTableStatus)
  status: DiningTableStatus;
}
