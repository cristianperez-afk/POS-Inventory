import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './shared/database/database.module';
import { SuperadminModule } from './users/superadmin/superadmin.module';
import { AdminModule } from './users/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    SuperadminModule,
    AdminModule,
  ],
})
export class AppModule {}
