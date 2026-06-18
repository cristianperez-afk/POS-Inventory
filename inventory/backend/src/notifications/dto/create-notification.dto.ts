import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  userId: string;
  businessId: string;
}
