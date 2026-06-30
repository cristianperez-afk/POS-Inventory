import { Module } from '@nestjs/common';
import { ActivityLogRepository } from '../../../shared/activity-log.repository';
import { AdminActivityController } from './admin-activity.controller';
import { AdminDiscountController } from './admin-discount.controller';
import { AdminPosController } from './admin-pos.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminStaffController } from './admin-staff.controller';
import { AdminThemeController } from './admin-theme.controller';
import { AdminService } from './admin.service';
import { DiscountRepository } from './discount.repository';
import { PosOrderRepository } from './pos-order.repository';
import { PosRepository } from './pos.repository';
import { RetailAuthorizationController } from './retail-authorization.controller';
import { StaffRepository } from './staff.repository';
import { StoreSettingsRepository } from './store-settings.repository';
import { ThemeRepository } from './theme.repository';

@Module({
  controllers: [
    AdminActivityController,
    AdminDiscountController,
    AdminPosController,
    AdminSettingsController,
    AdminStaffController,
    AdminThemeController,
    RetailAuthorizationController,
  ],
  providers: [AdminService, ActivityLogRepository, StaffRepository, DiscountRepository, ThemeRepository, StoreSettingsRepository, PosRepository, PosOrderRepository],
})
export class AdminModule {}
