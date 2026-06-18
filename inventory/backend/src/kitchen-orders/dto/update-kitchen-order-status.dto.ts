import { IsIn } from 'class-validator';
import { KitchenOrderStatus } from '@prisma/client';

export class UpdateKitchenOrderStatusDto {
  @IsIn([
    KitchenOrderStatus.PENDING,
    KitchenOrderStatus.PREPARING,
    KitchenOrderStatus.READY,
    KitchenOrderStatus.COMPLETED,
  ])
  status: KitchenOrderStatus;
}
