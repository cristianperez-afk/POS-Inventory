import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantSettingKey } from './restaurant-setting-key';

@Injectable()
export class RestaurantSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string) {
    return this.prisma.restaurantSetting.findMany({
      where: { businessId },
      orderBy: { key: 'asc' },
    });
  }

  upsert(key: RestaurantSettingKey, value: unknown, businessId: string) {
    const jsonValue = value as Prisma.InputJsonValue;
    return this.prisma.restaurantSetting.upsert({
      where: { businessId_key: { businessId, key } },
      create: { businessId, key, value: jsonValue },
      update: { value: jsonValue },
    });
  }
}
