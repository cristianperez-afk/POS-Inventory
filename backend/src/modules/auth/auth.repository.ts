import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthenticatedUser, type StaffType } from '../../shared/common/types';
import { ActivityLogRepository } from '../../shared/activity-log.repository';
import { DatabaseService } from '../../shared/database/database.service';

type ActivityLogInput = {
  userId?: number | null;
  storeId?: number | null;
  userName?: string | null;
  userRole?: string | null;
  module: string;
  action: string;
  details: string;
};

@Injectable()
export class AuthRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activityLogRepository: ActivityLogRepository,
  ) {}

  async getLoginUserByEmail(email: string): Promise<AuthenticatedUser & { password_hash: string; void_pin?: string | null } | null> {
    await this.databaseService.ensureVoidPinHashColumn();
    await this.databaseService.ensureKitchenRoleConstraints();
    const schema = await this.databaseService.getSchemaColumns();
    const userColumns = this.databaseService.resolveUserColumns(schema.users);
    const storeColumns = this.databaseService.resolveStoreColumns(schema.stores);

    const passwordColumn = userColumns.passwordColumn;
    const fullNameColumn = userColumns.fullNameColumn;
    const roleColumn = userColumns.roleColumn;
    const storeIdColumn = userColumns.storeIdColumn;
    const staffTypeColumn = userColumns.staffTypeColumn;

    if (!passwordColumn || !fullNameColumn || !roleColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for login.');
    }

    const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.databaseService.normalizedStoreTypeSql(`s.${this.databaseService.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : 'NULL AS store_type';
    const storeNameSelect = storeColumns.storeNameColumn ? `s.${this.databaseService.quoteIdentifier(storeColumns.storeNameColumn)} AS store_name` : 'NULL AS store_name';
    const storeJoin = storeIdColumn && storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.databaseService.quoteIdentifier(storeIdColumn)}` : '';
    const storeIdSelect = storeIdColumn ? `u.${this.databaseService.quoteIdentifier(storeIdColumn)} AS store_id` : 'NULL AS store_id';
    const staffTypeSelect = staffTypeColumn ? `u.${this.databaseService.quoteIdentifier(staffTypeColumn)} AS staff_type` : 'NULL AS staff_type';
    const voidPinSelect = userColumns.voidPinColumn ? `u.${this.databaseService.quoteIdentifier(userColumns.voidPinColumn)} AS void_pin` : 'NULL AS void_pin';

    const rows = await this.databaseService.query<{
      id: number;
      full_name: string;
      email: string;
      role: string;
      store_id: number | null;
      staff_type: StaffType;
      password_hash: string;
      store_type: string | null;
      store_name: string | null;
      status: string | null;
      void_pin: string | null;
    }>(
      `
        SELECT
          u.id,
          u.${this.databaseService.quoteIdentifier(fullNameColumn)} AS full_name,
          u.email,
          u.${this.databaseService.quoteIdentifier(roleColumn)} AS role,
          ${storeIdSelect},
          ${staffTypeSelect},
          u.${this.databaseService.quoteIdentifier(passwordColumn)} AS password_hash,
          ${storeTypeSelect},
          ${storeNameSelect},
          ${voidPinSelect},
          ${this.databaseService.userStatusSelect(userColumns)}
        FROM users u
        ${storeJoin}
        WHERE LOWER(u.email) = LOWER($1)
        ${this.databaseService.activeUsersWhereClause(userColumns)}
        LIMIT 1
      `,
      [email],
    );

    if (rows.length === 0) {
      return null;
    }

    const user = rows[0];
    if (user.store_type === 'RETAIL_STORE' && this.isPosManagerRole(user.role) && !user.void_pin?.trim() && userColumns.voidPinHashColumn && userColumns.voidPinColumn) {
      const uniquePin = await this.databaseService.generateUniqueRetailVoidPin(user.store_id, user.id);
      await this.databaseService.query(
        `
          UPDATE users
          SET
            ${this.databaseService.quoteIdentifier(userColumns.voidPinHashColumn)} = $1,
            ${this.databaseService.quoteIdentifier(userColumns.voidPinColumn)} = $2
          WHERE id = $3
        `,
        [await bcrypt.hash(uniquePin, 10), uniquePin, user.id],
      );
      user.void_pin = uniquePin;
    }

    return rows[0];
  }

  comparePassword(plainPassword: string, hashedPassword: string) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async getActiveAuthUserById(userId: number): Promise<AuthenticatedUser> {
    const schema = await this.databaseService.getSchemaColumns();
    const userColumns = this.databaseService.resolveUserColumns(schema.users);
    const storeColumns = this.databaseService.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for auth scoping.');
    }

    const storeJoin = userColumns.storeIdColumn && storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.databaseService.quoteIdentifier(userColumns.storeIdColumn)} LEFT JOIN store_information si ON si.store_id = s.id` : '';
    const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.databaseService.normalizedStoreTypeSql(`s.${this.databaseService.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : 'NULL AS store_type';
    const storeNameSelect = storeJoin
      ? storeColumns.storeNameColumn
        ? `COALESCE(si.business_name, s.${this.databaseService.quoteIdentifier(storeColumns.storeNameColumn)}) AS store_name`
        : 'si.business_name AS store_name'
      : 'NULL AS store_name';

    const rows = await this.databaseService.query<AuthenticatedUser>(
      `
        SELECT
          u.id,
          u.${this.databaseService.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          u.email,
          u.${this.databaseService.quoteIdentifier(userColumns.roleColumn)} AS role,
          ${userColumns.storeIdColumn ? `u.${this.databaseService.quoteIdentifier(userColumns.storeIdColumn)} AS store_id` : 'NULL AS store_id'},
          ${userColumns.staffTypeColumn ? `u.${this.databaseService.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type` : 'NULL AS staff_type'},
          ${storeTypeSelect},
          ${storeNameSelect}
        FROM users u
        ${storeJoin}
        WHERE u.id = $1
        ${this.databaseService.activeUsersWhereClause(userColumns)}
        LIMIT 1
      `,
      [userId],
    );

    if (!rows[0]) {
      throw new UnauthorizedException('Session is no longer valid.');
    }

    return rows[0];
  }

  async setRefreshToken(userId: number, tokenHash: string, expiresAt: Date) {
    await this.databaseService.ensureUserAuthTokenColumns();
    await this.databaseService.query(
      `
        UPDATE users
        SET refresh_token_hash = $1,
            refresh_token_expires_at = $2
        WHERE id = $3
      `,
      [tokenHash, expiresAt, userId],
    );
  }

  async clearRefreshToken(userId: number) {
    await this.databaseService.ensureUserAuthTokenColumns();
    await this.databaseService.query(
      `
        UPDATE users
        SET refresh_token_hash = NULL,
            refresh_token_expires_at = NULL
        WHERE id = $1
      `,
      [userId],
    );
  }

  async findUserByRefreshTokenHash(tokenHash: string): Promise<AuthenticatedUser | null> {
    await this.databaseService.ensureUserAuthTokenColumns();
    const rows = await this.databaseService.query<{ id: number }>(
      `
        SELECT id
        FROM users
        WHERE refresh_token_hash = $1
          AND refresh_token_expires_at > CURRENT_TIMESTAMP
        LIMIT 1
      `,
      [tokenHash],
    );

    if (!rows[0]) return null;
    return this.getActiveAuthUserById(rows[0].id);
  }

  async setResetToken(userId: number, tokenHash: string, expiresAt: Date) {
    await this.databaseService.ensureUserAuthTokenColumns();
    await this.databaseService.query(
      `
        UPDATE users
        SET reset_token_hash = $1,
            reset_token_expires_at = $2
        WHERE id = $3
      `,
      [tokenHash, expiresAt, userId],
    );
  }

  async findUserByResetTokenHash(tokenHash: string): Promise<AuthenticatedUser | null> {
    await this.databaseService.ensureUserAuthTokenColumns();
    const rows = await this.databaseService.query<{ id: number }>(
      `
        SELECT id
        FROM users
        WHERE reset_token_hash = $1
          AND reset_token_expires_at > CURRENT_TIMESTAMP
        LIMIT 1
      `,
      [tokenHash],
    );

    if (!rows[0]) return null;
    return this.getActiveAuthUserById(rows[0].id);
  }

  async updatePasswordAndClearAuthTokens(userId: number, password: string) {
    await this.databaseService.ensureUserAuthTokenColumns();
    const schema = await this.databaseService.getSchemaColumns();
    const userColumns = this.databaseService.resolveUserColumns(schema.users);

    if (!userColumns.passwordColumn) {
      throw new InternalServerErrorException('Users table is missing a password column.');
    }

    await this.databaseService.query(
      `
        UPDATE users
        SET ${this.databaseService.quoteIdentifier(userColumns.passwordColumn)} = $1,
            refresh_token_hash = NULL,
            refresh_token_expires_at = NULL,
            reset_token_hash = NULL,
            reset_token_expires_at = NULL
        WHERE id = $2
      `,
      [await bcrypt.hash(password, 10), userId],
    );
  }

  recordActivity(input: ActivityLogInput) {
    return this.activityLogRepository.record(input);
  }

  private isPosManagerRole(role: unknown) {
    return role === 'POS_MANAGER' || role === 'POS_ADMIN' || role === 'ADMIN';
  }
}
