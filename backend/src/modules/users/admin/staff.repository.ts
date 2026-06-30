import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ActivityLogRepository } from '../../../shared/activity-log.repository';
import { AuthenticatedUser } from '../../../shared/common/types';
import { DatabaseService } from '../../../shared/database/database.service';

type StaffType = 'POS_STAFF' | 'INVENTORY_STAFF';
type StaffRole = 'STAFF' | 'POS_MANAGER' | 'INVENTORY_MANAGER';

@Injectable()
export class StaffRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activityLogRepository: ActivityLogRepository,
  ) {}

  async listForAdmin(adminUserId: number) {
    const admin = await this.databaseService.getUserStoreScope(adminUserId);

    if (admin.role !== 'ADMIN') {
      throw new ForbiddenException('Only admin accounts can manage staff accounts.');
    }

    if (!admin.store_id) {
      throw new InternalServerErrorException('Admin account is not linked to a store.');
    }

    await this.databaseService.ensureVoidPinHashColumn();
    const schema = await this.databaseService.getSchemaColumns();
    const userColumns = this.databaseService.resolveUserColumns(schema.users);
    const storeColumns = this.databaseService.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.storeIdColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for staff listing.');
    }

    const storeJoin = storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.databaseService.quoteIdentifier(userColumns.storeIdColumn)}` : '';
    const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.databaseService.normalizedStoreTypeSql(`s.${this.databaseService.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : 'NULL AS store_type';
    const storeNameSelect = storeColumns.storeNameColumn ? `s.${this.databaseService.quoteIdentifier(storeColumns.storeNameColumn)} AS store_name` : 'NULL AS store_name';
    const voidPinConfiguredSelect = userColumns.voidPinHashColumn ? `u.${this.databaseService.quoteIdentifier(userColumns.voidPinHashColumn)} IS NOT NULL AS void_pin_configured` : 'FALSE AS void_pin_configured';

    return this.databaseService.query<AuthenticatedUser & { void_pin_configured?: boolean }>(
      `
        SELECT
          u.id,
          u.${this.databaseService.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          u.email,
          u.${this.databaseService.quoteIdentifier(userColumns.roleColumn)} AS role,
          u.${this.databaseService.quoteIdentifier(userColumns.storeIdColumn)} AS store_id,
          ${userColumns.staffTypeColumn ? `u.${this.databaseService.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type` : 'NULL AS staff_type'},
          ${storeTypeSelect},
          ${storeNameSelect},
          ${voidPinConfiguredSelect},
          ${this.databaseService.userStatusSelect(userColumns)}
        FROM users u
        ${storeJoin}
        WHERE u.${this.databaseService.quoteIdentifier(userColumns.roleColumn)} IN ('STAFF', 'POS_MANAGER', 'INVENTORY_MANAGER', 'POS_ADMIN', 'INVENTORY_ADMIN')
          AND u.${this.databaseService.quoteIdentifier(userColumns.storeIdColumn)} = $1
        ORDER BY u.id ASC
      `,
      [admin.store_id],
    );
  }

  create(input: {
    adminUserId: number;
    fullName: string;
    email: string;
    password: string;
    staffType: StaffType;
    role?: StaffRole;
    voidPin?: string | null;
  }) {
    return this.databaseService.createStaffAccount(input);
  }

  update(input: {
    adminUserId: number;
    staffUserId: number;
    fullName: string;
    email: string;
    password?: string;
    staffType: StaffType;
    role?: StaffRole;
    voidPin?: string | null;
  }) {
    return this.databaseService.updateStaffAccountForAdmin(input);
  }

  async verifyRetailVoidPin(input: { userId: number; voidPin: string }) {
    const requester = await this.databaseService.getUserStoreScope(input.userId);
    if (requester.store_type !== 'RETAIL_STORE' || !requester.store_id) {
      throw new ForbiddenException('Unique PIN authorization is only available for retail stores.');
    }
    if (!input.voidPin?.trim()) {
      throw new BadRequestException('Unique PIN is required.');
    }

    await this.databaseService.ensureVoidPinHashColumn();
    const schema = await this.databaseService.getSchemaColumns();
    const userColumns = this.databaseService.resolveUserColumns(schema.users);
    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.storeIdColumn || !userColumns.voidPinHashColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for Unique PIN authorization.');
    }

    const rows = await this.databaseService.query<{ id: number; full_name: string; email: string; role: string; void_pin_hash: string }>(
      `
        SELECT
          id,
          ${this.databaseService.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          email,
          ${this.databaseService.quoteIdentifier(userColumns.roleColumn)} AS role,
          ${this.databaseService.quoteIdentifier(userColumns.voidPinHashColumn)} AS void_pin_hash
        FROM users u
        WHERE ${this.databaseService.quoteIdentifier(userColumns.storeIdColumn)} = $1
          AND ${this.databaseService.quoteIdentifier(userColumns.roleColumn)} IN ('POS_MANAGER', 'POS_ADMIN')
          AND ${this.databaseService.quoteIdentifier(userColumns.voidPinHashColumn)} IS NOT NULL
          ${this.databaseService.activeUsersWhereClause(userColumns)}
      `,
      [requester.store_id],
    );

    for (const row of rows) {
      if (await bcrypt.compare(input.voidPin.trim(), row.void_pin_hash)) {
        await this.activityLogRepository.record({
          userId: requester.id,
          storeId: requester.store_id,
          userName: requester.full_name,
          userRole: requester.role,
          module: 'Void & Refund',
          action: 'Void Approved',
          details: `Retail cart void authorized\nManager: ${row.full_name}`,
        });

        return {
          authorized: true,
          manager: {
            id: row.id,
            full_name: row.full_name,
            email: row.email,
            role: row.role,
          },
        };
      }
    }

    throw new ForbiddenException('Invalid retail POS manager Unique PIN.');
  }

  async getRetailManagerProfile(userId: number) {
    const requester = await this.databaseService.getUserStoreScope(userId);
    if (requester.store_type !== 'RETAIL_STORE' || !requester.store_id) {
      throw new ForbiddenException('Retail manager profile is only available for retail stores.');
    }
    if (!this.isPosManagerRole(requester.role)) {
      throw new ForbiddenException('Only retail POS managers can view this profile.');
    }

    await this.databaseService.ensureVoidPinHashColumn();
    const schema = await this.databaseService.getSchemaColumns();
    const userColumns = this.databaseService.resolveUserColumns(schema.users);
    const storeColumns = this.databaseService.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.storeIdColumn || !userColumns.staffTypeColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for manager profile.');
    }
    if (!userColumns.voidPinHashColumn || !userColumns.voidPinColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for Unique PIN display.');
    }

    const storeJoin = storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.databaseService.quoteIdentifier(userColumns.storeIdColumn)}` : '';
    const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.databaseService.normalizedStoreTypeSql(`s.${this.databaseService.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : '$2::text AS store_type';
    const storeNameSelect = storeColumns.storeNameColumn ? `s.${this.databaseService.quoteIdentifier(storeColumns.storeNameColumn)} AS store_name` : '$3::text AS store_name';
    const voidPinSelect = userColumns.voidPinColumn ? `u.${this.databaseService.quoteIdentifier(userColumns.voidPinColumn)} AS void_pin` : 'NULL AS void_pin';
    const voidPinConfiguredSelect = userColumns.voidPinHashColumn ? `u.${this.databaseService.quoteIdentifier(userColumns.voidPinHashColumn)} IS NOT NULL AS void_pin_configured` : 'FALSE AS void_pin_configured';

    const rows = await this.databaseService.query<AuthenticatedUser & { void_pin: string | null; void_pin_configured: boolean }>(
      `
        SELECT
          u.id,
          u.${this.databaseService.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          u.email,
          u.${this.databaseService.quoteIdentifier(userColumns.roleColumn)} AS role,
          u.${this.databaseService.quoteIdentifier(userColumns.storeIdColumn)} AS store_id,
          u.${this.databaseService.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type,
          ${storeTypeSelect},
          ${storeNameSelect},
          ${voidPinSelect},
          ${voidPinConfiguredSelect},
          ${this.databaseService.userStatusSelect(userColumns)}
        FROM users u
        ${storeJoin}
        WHERE u.id = $1
          AND u.${this.databaseService.quoteIdentifier(userColumns.storeIdColumn)} = $4
        LIMIT 1
      `,
      [userId, requester.store_type, requester.store_name, requester.store_id],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Retail manager profile was not found.');
    }

    if (!rows[0].void_pin?.trim()) {
      const uniquePin = await this.databaseService.generateUniqueRetailVoidPin(requester.store_id, userId);
      await this.databaseService.query(
        `
          UPDATE users
          SET
            ${this.databaseService.quoteIdentifier(userColumns.voidPinHashColumn)} = $1,
            ${this.databaseService.quoteIdentifier(userColumns.voidPinColumn)} = $2
          WHERE id = $3
            AND ${this.databaseService.quoteIdentifier(userColumns.storeIdColumn)} = $4
        `,
        [await bcrypt.hash(uniquePin, 10), uniquePin, userId, requester.store_id],
      );
      rows[0].void_pin = uniquePin;
      rows[0].void_pin_configured = true;
    }

    return rows[0];
  }

  async generateRetailManagerUniquePin(userId: number) {
    const requester = await this.databaseService.getUserStoreScope(userId);
    if (requester.store_type !== 'RETAIL_STORE' || !requester.store_id) {
      throw new ForbiddenException('Unique PIN generation is only available for retail stores.');
    }
    if (!this.isPosManagerRole(requester.role)) {
      throw new ForbiddenException('Only retail POS managers can generate a Unique PIN.');
    }

    await this.databaseService.ensureVoidPinHashColumn();
    const schema = await this.databaseService.getSchemaColumns();
    const userColumns = this.databaseService.resolveUserColumns(schema.users);
    if (!userColumns.voidPinHashColumn || !userColumns.voidPinColumn || !userColumns.storeIdColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for Unique PIN generation.');
    }

    const uniquePin = await this.databaseService.generateUniqueRetailVoidPin(requester.store_id, userId);
    await this.databaseService.query(
      `
        UPDATE users
        SET
          ${this.databaseService.quoteIdentifier(userColumns.voidPinHashColumn)} = $1,
          ${this.databaseService.quoteIdentifier(userColumns.voidPinColumn)} = $2
        WHERE id = $3
          AND ${this.databaseService.quoteIdentifier(userColumns.storeIdColumn)} = $4
      `,
      [await bcrypt.hash(uniquePin, 10), uniquePin, userId, requester.store_id],
    );

    return {
      id: userId,
      void_pin: uniquePin,
      void_pin_configured: true,
    };
  }

  delete(input: { adminUserId: number; staffUserId: number }) {
    return this.databaseService.deleteStaffAccountForAdmin(input);
  }

  permanentlyDelete(input: { adminUserId: number; staffUserId: number }) {
    return this.databaseService.permanentlyDeleteStaffAccountForAdmin(input);
  }

  activate(input: { adminUserId: number; staffUserId: number }) {
    return this.databaseService.activateStaffAccountForAdmin(input);
  }

  private isPosManagerRole(role: unknown) {
    return role === 'POS_MANAGER' || role === 'POS_ADMIN' || role === 'ADMIN';
  }
}
