import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { LocationsModule } from './locations/locations.module';
import { InventoryModule } from './inventory/inventory.module';
import { AuthModule } from './auth/auth.module';
import { StockMovementsModule } from './stock-movements/stock-movements.module';
import { RecipesModule } from './recipes/recipes.module';
import { KitchenOrdersModule } from './kitchen-orders/kitchen-orders.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { TransfersModule } from './transfers/transfers.module';
import { SalesModule } from './sales/sales.module';
import { BundlesModule } from './bundles/bundles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DiningTablesModule } from './dining-tables/dining-tables.module';
import { CategoriesModule } from './categories/categories.module';
import { RestaurantSettingsModule } from './restaurant-settings/restaurant-settings.module';
import { AdjustmentsModule } from './adjustments/adjustments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    InventoryModule,
    StockMovementsModule,
    RecipesModule,
    KitchenOrdersModule,
    SuppliersModule,
    PurchaseOrdersModule,
    TransfersModule,
    SalesModule,
    BundlesModule,
    AdjustmentsModule,
    NotificationsModule,
    DiningTablesModule,
    CategoriesModule,
    RestaurantSettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
