import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import * as bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { AuthenticatedUser } from '../common/types';

// Captures one InventoryItem stock change produced by a paid POS order so it can
// be mirrored into the inventory module's "Sale"/"SaleItem"/"StockMovement" tables.
type PosSaleMovement = {
  inventoryItemId: string;
  businessId: string;
  locationId: string;
  module: 'RETAIL' | 'RESTAURANT';
  unit: string | null;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  movementType: 'SALE' | 'RECIPE_CONSUMPTION';
  reason: string;
  // When false, this entry only contributes a SaleItem line (no StockMovement) —
  // used for a restaurant menu dish, which is sold but not itself stock-tracked.
  emitStockMovement: boolean;
  saleItem: { name: string; quantity: number; unitPrice: number; totalPrice: number } | null;
};

type InventorySyncSettings = {
  autoDeductInventoryOnSale: boolean;
  allowNegativeStock: boolean;
};

type ColumnInfo = {
  column_name: string;
};

type SchemaColumns = {
  users: Set<string>;
  stores: Set<string>;
};

type StoreInformation = {
  id: number;
  store_id: number;
  business_name: string;
  business_description: string | null;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  logo: string | null;
  receipt_thank_you_message: string | null;
  receipt_footer_message: string | null;
  operating_hours: string | null;
  currency: string | null;
  theme_color: string | null;
  tax_rate: string | number | null;
  service_charge_rate: string | number | null;
  updated_at: Date | string | null;
};

type StaffType = 'POS_STAFF' | 'INVENTORY_STAFF' | 'KITCHEN_STAFF';
type StaffRole = 'STAFF' | 'POS_MANAGER' | 'INVENTORY_MANAGER' | 'KITCHEN';
type ActivityModule = 'Authentication' | 'Staff Accounts' | 'Transactions' | 'Payments' | 'Void & Refund' | 'Restaurant Table Management' | 'Store Settings';

type ActivityLogInput = {
  userId?: number | null;
  storeId?: number | null;
  userName?: string | null;
  userRole?: string | null;
  module: ActivityModule | string;
  action: string;
  details: string;
};

type ThemeMode = 'basic' | 'advanced';
type ThemeAppearance = 'system' | 'light' | 'dark';
type ThemePreferences = {
  theme_mode: ThemeMode;
  theme_preset: string | null;
  appearance: ThemeAppearance;
  primary_color: string;
  secondary_color: string;
  sidebar_color: string;
};
type UserPreferences = ThemePreferences & {
  compact_mode: boolean;
  low_stock_alerts: boolean;
  default_workspace: 'pos' | 'inventory' | 'reports';
};
type StoreThemePreferences = ThemePreferences & {
  updated_at?: Date | string | null;
};

const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  theme_mode: 'basic',
  theme_preset: 'default',
  appearance: 'light',
  primary_color: '#008967',
  secondary_color: '#005656',
  sidebar_color: '#0f172a',
};

const LEGACY_STORE_ADMIN_ROLES = ['ADMIN'] as const;
const STORE_MANAGER_ROLES = ['POS_MANAGER', 'INVENTORY_MANAGER'] as const;
const STORE_STAFF_ROLES = ['STAFF', 'KITCHEN'] as const;
const STORE_USER_ROLES = [...STORE_STAFF_ROLES, ...STORE_MANAGER_ROLES] as const;
const STORE_USER_ROLES_WITH_LEGACY_SQL = "'STAFF', 'KITCHEN', 'POS_MANAGER', 'INVENTORY_MANAGER', 'POS_ADMIN', 'INVENTORY_ADMIN'";
const STORE_ADMIN_ROLES_WITH_LEGACY_SQL = "'POS_MANAGER', 'INVENTORY_MANAGER', 'ADMIN'";

types.setTypeParser(1114, (value: string) => value);

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  /*
   * Legacy compatibility layer for the original POS SQL workflows.
   * New modules should inject PrismaService from src/prisma instead of adding
   * more raw pg queries here. Existing methods will be migrated module by module.
   */
  private readonly pool: Pool;
  private isPoolClosed = false;
  private schemaColumns: SchemaColumns | null = null;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const maxPoolConnections = Number(process.env.DB_POOL_MAX ?? 3);
    const poolOptions = {
      max: Number.isFinite(maxPoolConnections) && maxPoolConnections > 0 ? maxPoolConnections : 3,
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? 10000),
      connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? 20000),
    };

    this.pool = connectionString
      ? new Pool({ connectionString, ...poolOptions })
      : new Pool({
          host: process.env.DB_HOST ?? 'localhost',
          port: Number(process.env.DB_PORT ?? 5432),
          user: process.env.DB_USER ?? 'postgres',
          password: process.env.DB_PASSWORD ?? '',
          database: process.env.DB_NAME ?? 'bukolabs_pos',
          ...poolOptions,
        });
  }

  async onModuleInit() {
    return;
  }

  async onModuleDestroy() {
    if (this.isPoolClosed) {
      return;
    }

    this.isPoolClosed = true;
    await this.pool.end();
  }

  async query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (this.isPoolClosed) {
      throw new ServiceUnavailableException('PostgreSQL connection pool has already been closed. Restart the backend process.');
    }

    try {
      const result = await this.pool.query<T>(sql, params);
      return result.rows;
    } catch (error) {
      if (this.isDatabaseConnectionLimitError(error)) {
        throw new ServiceUnavailableException('PostgreSQL connection limit reached. Stop extra backend processes, wait 30-60 seconds for Supabase to release stale sessions, then start only one backend.');
      }

      if (!this.isDatabaseConnectivityError(error)) {
        throw error;
      }

      throw new ServiceUnavailableException('PostgreSQL is not reachable or is missing credentials. Check backend/.env and database status.');
    }
  }

  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (this.isPoolClosed) {
      throw new ServiceUnavailableException('PostgreSQL connection pool has already been closed. Restart the backend process.');
    }

    let client: PoolClient;

    try {
      client = await this.pool.connect();
    } catch (error) {
      if (this.isDatabaseConnectionLimitError(error)) {
        throw new ServiceUnavailableException('PostgreSQL connection limit reached. Stop extra backend processes, wait 30-60 seconds for Supabase to release stale sessions, then start only one backend.');
      }

      if (this.isDatabaseConnectivityError(error)) {
        throw new ServiceUnavailableException('PostgreSQL is not reachable or is missing credentials. Check backend/.env and database status.');
      }

      throw error;
    }

    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async queryWithClient<T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await client.query<T>(sql, params);
    return result.rows;
  }

  private isDatabaseConnectionLimitError(error: unknown): boolean {
    const databaseError = error as { code?: string; message?: string };
    const message = databaseError.message ?? '';

    return databaseError.code === '53300' || message.includes('max clients reached') || message.includes('EMAXCONNSESSION');
  }

  private isDatabaseConnectivityError(error: unknown): boolean {
    const databaseError = error as { code?: string; message?: string };
    const connectionErrorCodes = new Set(['EACCES', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', '28P01', '3D000', 'XX000']);
    const message = databaseError.message ?? '';

    return (
      Boolean(databaseError.code && connectionErrorCodes.has(databaseError.code)) ||
      message.includes('timeout exceeded when trying to connect') ||
      message.includes('Connection terminated unexpectedly')
    );
  }

  private isStoreManagerRole(role: unknown) {
    return role === 'POS_MANAGER' || role === 'INVENTORY_MANAGER' || role === 'POS_ADMIN' || role === 'INVENTORY_ADMIN' || role === 'ADMIN';
  }

  private isStoreAdminRole(role: unknown) {
    return role === 'ADMIN';
  }

  private isPosManagerRole(role: unknown) {
    return role === 'POS_MANAGER' || role === 'POS_ADMIN' || role === 'ADMIN';
  }

  private isInventoryManagerRole(role: unknown) {
    return role === 'INVENTORY_MANAGER' || role === 'INVENTORY_ADMIN' || role === 'ADMIN';
  }

  private isKitchenRole(role: unknown) {
    return role === 'KITCHEN';
  }

  async getLoginUserByEmail(email: string): Promise<AuthenticatedUser & { password_hash: string; void_pin?: string | null } | null> {
    await this.ensureVoidPinHashColumn();
    await this.ensureKitchenRoleConstraints();
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    const storeColumns = this.resolveStoreColumns(schema.stores);

    const passwordColumn = userColumns.passwordColumn;
    const fullNameColumn = userColumns.fullNameColumn;
    const roleColumn = userColumns.roleColumn;
    const storeIdColumn = userColumns.storeIdColumn;
    const staffTypeColumn = userColumns.staffTypeColumn;

    if (!passwordColumn || !fullNameColumn || !roleColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for login.');
    }

    const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.normalizedStoreTypeSql(`s.${this.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : 'NULL AS store_type';
    const storeNameSelect = storeColumns.storeNameColumn ? `s.${this.quoteIdentifier(storeColumns.storeNameColumn)} AS store_name` : 'NULL AS store_name';
    const storeJoin = storeIdColumn && storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.quoteIdentifier(storeIdColumn)}` : '';
    const storeIdSelect = storeIdColumn ? `u.${this.quoteIdentifier(storeIdColumn)} AS store_id` : 'NULL AS store_id';
    const staffTypeSelect = staffTypeColumn ? `u.${this.quoteIdentifier(staffTypeColumn)} AS staff_type` : 'NULL AS staff_type';
    const voidPinSelect = userColumns.voidPinColumn ? `u.${this.quoteIdentifier(userColumns.voidPinColumn)} AS void_pin` : 'NULL AS void_pin';

    const rows = await this.query<{
      id: number;
      full_name: string;
      email: string;
      role: string;
      store_id: number | null;
      staff_type: StaffType | null;
      password_hash: string;
      store_type: string | null;
      store_name: string | null;
      status: string | null;
      void_pin: string | null;
    }>(
      `
        SELECT
          u.id,
          u.${this.quoteIdentifier(fullNameColumn)} AS full_name,
          u.email,
          u.${this.quoteIdentifier(roleColumn)} AS role,
          ${storeIdSelect},
          ${staffTypeSelect},
          u.${this.quoteIdentifier(passwordColumn)} AS password_hash,
          ${storeTypeSelect},
          ${storeNameSelect},
          ${voidPinSelect},
          ${this.userStatusSelect(userColumns)}
        FROM users u
        ${storeJoin}
        WHERE LOWER(u.email) = LOWER($1)
        ${this.activeUsersWhereClause(userColumns)}
        LIMIT 1
      `,
      [email],
    );

    if (rows.length === 0) {
      return null;
    }

    const user = rows[0];
    if (this.isPosManagerRole(user.role) && !user.void_pin?.trim() && userColumns.voidPinHashColumn && userColumns.voidPinColumn) {
      const uniquePin = await this.generateUniqueRetailVoidPin(user.store_id, user.id);
      await this.query(
        `
          UPDATE users
          SET
            ${this.quoteIdentifier(userColumns.voidPinHashColumn)} = $1,
            ${this.quoteIdentifier(userColumns.voidPinColumn)} = $2
          WHERE id = $3
        `,
        [await bcrypt.hash(uniquePin, 10), uniquePin, user.id],
      );
      user.void_pin = uniquePin;
    }

    return rows[0];
  }

  async listAdminUsers() {
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    const storeColumns = this.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for admin listing.');
    }

    const storeJoin = userColumns.storeIdColumn && storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.quoteIdentifier(userColumns.storeIdColumn)} LEFT JOIN store_information si ON si.store_id = s.id` : '';
    const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.normalizedStoreTypeSql(`s.${this.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : 'NULL AS store_type';
    const storeNameSelect = storeJoin
      ? storeColumns.storeNameColumn
        ? `COALESCE(si.business_name, s.${this.quoteIdentifier(storeColumns.storeNameColumn)}) AS store_name`
        : 'si.business_name AS store_name'
      : 'NULL AS store_name';

    return this.query<{
      id: number;
      full_name: string;
      email: string;
      role: string;
      store_id: number | null;
      store_type: string | null;
      store_name: string | null;
      staff_type: StaffType | null;
      status: string | null;
    }>(
      `
        SELECT
          u.id,
          u.${this.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          u.email,
          u.${this.quoteIdentifier(userColumns.roleColumn)} AS role,
          ${userColumns.storeIdColumn ? `u.${this.quoteIdentifier(userColumns.storeIdColumn)} AS store_id` : 'NULL AS store_id'},
          ${storeTypeSelect},
          ${storeNameSelect},
          ${userColumns.staffTypeColumn ? `u.${this.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type` : 'NULL AS staff_type'},
          ${this.userStatusSelect(userColumns)}
        FROM users u
        ${storeJoin}
        WHERE u.${this.quoteIdentifier(userColumns.roleColumn)} IN (${STORE_ADMIN_ROLES_WITH_LEGACY_SQL})
        ORDER BY u.id ASC
      `,
    );
  }

  async comparePassword(plainPassword: string, hashedPassword: string) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async getActiveAuthUserById(userId: number): Promise<AuthenticatedUser> {
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    const storeColumns = this.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for auth scoping.');
    }

    const storeJoin = userColumns.storeIdColumn && storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.quoteIdentifier(userColumns.storeIdColumn)} LEFT JOIN store_information si ON si.store_id = s.id` : '';
    const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.normalizedStoreTypeSql(`s.${this.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : 'NULL AS store_type';
    const storeNameSelect = storeJoin
      ? storeColumns.storeNameColumn
        ? `COALESCE(si.business_name, s.${this.quoteIdentifier(storeColumns.storeNameColumn)}) AS store_name`
        : 'si.business_name AS store_name'
      : 'NULL AS store_name';

    const rows = await this.query<AuthenticatedUser>(
      `
        SELECT
          u.id,
          u.${this.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          u.email,
          u.${this.quoteIdentifier(userColumns.roleColumn)} AS role,
          ${userColumns.storeIdColumn ? `u.${this.quoteIdentifier(userColumns.storeIdColumn)} AS store_id` : 'NULL AS store_id'},
          ${userColumns.staffTypeColumn ? `u.${this.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type` : 'NULL AS staff_type'},
          ${storeTypeSelect},
          ${storeNameSelect}
        FROM users u
        ${storeJoin}
        WHERE u.id = $1
        ${this.activeUsersWhereClause(userColumns)}
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
    await this.ensureUserAuthTokenColumns();
    await this.query(
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
    await this.ensureUserAuthTokenColumns();
    await this.query(
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
    await this.ensureUserAuthTokenColumns();
    const rows = await this.query<{ id: number }>(
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
    await this.ensureUserAuthTokenColumns();
    await this.query(
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
    await this.ensureUserAuthTokenColumns();
    const rows = await this.query<{ id: number }>(
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
    await this.ensureUserAuthTokenColumns();
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);

    if (!userColumns.passwordColumn) {
      throw new InternalServerErrorException('Users table is missing a password column.');
    }

    await this.query(
      `
        UPDATE users
        SET ${this.quoteIdentifier(userColumns.passwordColumn)} = $1,
            refresh_token_hash = NULL,
            refresh_token_expires_at = NULL,
            reset_token_hash = NULL,
            reset_token_expires_at = NULL
        WHERE id = $2
      `,
      [await bcrypt.hash(password, 10), userId],
    );
  }

  async createAdminAccount(input: { fullName: string; email: string; storeType: 'RESTAURANT' | 'RETAIL_STORE'; password?: string }) {
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    const storeColumns = this.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.passwordColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for admin creation.');
    }

    if (!storeColumns.storeTypeColumn) {
      throw new InternalServerErrorException('Stores table is missing a store type column.');
    }

    const password = input.password ?? this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const savedOrder = await this.withTransaction(async (client) => {
      const storeInsertColumns: string[] = [this.quoteIdentifier(storeColumns.storeTypeColumn!)];
      const storeInsertValues: unknown[] = [this.toDatabaseStoreType(input.storeType)];
      const storeInsertPlaceholders: string[] = ['$1'];

      if (storeColumns.storeNameColumn) {
        storeInsertColumns.push(this.quoteIdentifier(storeColumns.storeNameColumn));
        storeInsertValues.push(`${input.fullName}'s Store`);
        storeInsertPlaceholders.push(`$${storeInsertValues.length}`);
      }

      const storeRows = await this.queryWithClient<{ id: number }>(
        client,
        `
          INSERT INTO stores (${storeInsertColumns.join(', ')})
          VALUES (${storeInsertPlaceholders.join(', ')})
          RETURNING id
        `,
        storeInsertValues,
      );

      const storeId = storeRows[0]?.id ?? null;

      const userInsertColumns: string[] = [this.quoteIdentifier(userColumns.fullNameColumn!), 'email', this.quoteIdentifier(userColumns.roleColumn!), this.quoteIdentifier(userColumns.passwordColumn!)];
      const userInsertValues: unknown[] = [input.fullName, input.email, 'POS_MANAGER', passwordHash];
      const userInsertPlaceholders: string[] = ['$1', '$2', '$3', '$4'];

      if (userColumns.storeIdColumn) {
        userInsertColumns.push(this.quoteIdentifier(userColumns.storeIdColumn));
        userInsertValues.push(storeId);
        userInsertPlaceholders.push(`$${userInsertValues.length}`);
      }

      if (userColumns.staffTypeColumn) {
        userInsertColumns.push(this.quoteIdentifier(userColumns.staffTypeColumn));
        userInsertValues.push(null);
        userInsertPlaceholders.push(`$${userInsertValues.length}`);
      }

      const userRows = await this.queryWithClient<{
        id: number;
        full_name: string;
        email: string;
        role: string;
        store_id: number | null;
        staff_type: StaffType | null;
      }>(
        client,
        `
          INSERT INTO users (${userInsertColumns.join(', ')})
          VALUES (${userInsertPlaceholders.join(', ')})
          RETURNING
            id,
            ${this.quoteIdentifier(userColumns.fullNameColumn!)} AS full_name,
            email,
            ${this.quoteIdentifier(userColumns.roleColumn!)} AS role,
            ${userColumns.storeIdColumn ? `${this.quoteIdentifier(userColumns.storeIdColumn)} AS store_id` : 'NULL AS store_id'},
            ${userColumns.staffTypeColumn ? `${this.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type` : 'NULL AS staff_type'}
        `,
        userInsertValues,
      );

      if (storeId) {
        await this.ensureStoreInformationRow(storeId, storeColumns.storeNameColumn ? `${input.fullName}'s Store` : input.fullName, client);
      }

      return {
        user: { ...userRows[0], store_type: input.storeType, store_name: storeColumns.storeNameColumn ? `${input.fullName}'s Store` : null },
        store: { id: storeId, store_type: input.storeType, store_name: storeColumns.storeNameColumn ? `${input.fullName}'s Store` : null },
        temporary_password: input.password ? null : password,
      };
      });
    } catch (error) {
      this.handleDatabaseWriteError(error, 'Unable to create admin account.');
    }
  }

  async updateAdminAccount(input: { adminUserId: number; fullName: string; email: string; storeType: 'RESTAURANT' | 'RETAIL_STORE'; password?: string }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Admin account was not found.');
    }

    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    const storeColumns = this.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for admin updates.');
    }

    const roleColumn = userColumns.roleColumn;
    const userUpdates: string[] = [`${this.quoteIdentifier(userColumns.fullNameColumn)} = $1`, 'email = $2'];
    const values: unknown[] = [input.fullName, input.email];

    if (input.password?.trim()) {
      if (!userColumns.passwordColumn) {
        throw new InternalServerErrorException('Users table is missing a password column.');
      }

      values.push(await bcrypt.hash(input.password, 10));
      userUpdates.push(`${this.quoteIdentifier(userColumns.passwordColumn)} = $${values.length}`);
    }

    try {
      await this.withTransaction(async (client) => {
        values.push(input.adminUserId);
        await this.queryWithClient(
          client,
          `
            UPDATE users
            SET ${userUpdates.join(', ')}
            WHERE id = $${values.length}
              AND ${this.quoteIdentifier(roleColumn)} = 'ADMIN'
          `,
          values,
        );

        if (storeColumns.storeTypeColumn) {
          await this.queryWithClient(
            client,
            `
              UPDATE stores
              SET ${this.quoteIdentifier(storeColumns.storeTypeColumn)} = $1
              WHERE id = $2
            `,
            [this.toDatabaseStoreType(input.storeType), admin.store_id],
          );
        }
      });

      const updated = await this.getUserStoreScope(input.adminUserId);
      return updated;
    } catch (error) {
      this.handleDatabaseWriteError(error, 'Unable to update admin account.');
    }
  }

  async deleteAdminAccount(adminUserId: number) {
    if (!Number.isFinite(adminUserId) || adminUserId <= 0) {
      throw new BadRequestException('A valid admin user id is required.');
    }

    const admin = await this.getUserStoreScope(adminUserId);

    if (!this.isStoreManagerRole(admin.role)) {
      throw new NotFoundException('Admin account was not found.');
    }

    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);

    if (!userColumns.roleColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for admin deletion.');
    }

    const deactivatedIds = await this.deactivateAdminAndStoreStaff(adminUserId, admin.store_id, userColumns);
    return { id: adminUserId, status: 'INACTIVE', deactivated: true, deleted: false, affected_user_ids: deactivatedIds };
  }

  async permanentlyDeleteAdminAccount(adminUserId: number) {
    if (!Number.isFinite(adminUserId) || adminUserId <= 0) {
      throw new BadRequestException('A valid admin user id is required.');
    }

    const admin = await this.getUserStoreScope(adminUserId);

    if (!this.isStoreManagerRole(admin.role)) {
      throw new NotFoundException('Admin account was not found.');
    }

    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);

    if (!userColumns.roleColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for admin deletion.');
    }

    try {
      const rows = await this.hardDeleteUserByRole(adminUserId, 'ADMIN', null, userColumns);

      if (rows.length === 0) {
        throw new NotFoundException('Admin account was not found.');
      }

      return { id: rows[0].id, deleted: true, deactivated: false };
    } catch (error) {
      this.handleDatabaseWriteError(error, 'Unable to delete admin account.');
    }
  }

  async activateAdminAccount(adminUserId: number) {
    if (!Number.isFinite(adminUserId) || adminUserId <= 0) {
      throw new BadRequestException('A valid admin user id is required.');
    }

    const admin = await this.getUserStoreScope(adminUserId);

    if (!this.isStoreManagerRole(admin.role)) {
      throw new NotFoundException('Admin account was not found.');
    }

    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);

    if ((!userColumns.statusColumn && !userColumns.activeColumn) || !userColumns.roleColumn) {
      throw new InternalServerErrorException('Users table is missing required status columns.');
    }

    const activatedIds = await this.activateAdminAndStoreStaff(adminUserId, admin.store_id, userColumns);
    return { id: adminUserId, status: 'ACTIVE', activated: true, affected_user_ids: activatedIds };
  }

  async listStaffForAdmin(adminUserId: number) {
    const admin = await this.getUserStoreScope(adminUserId);

    if (!this.isStoreAdminRole(admin.role)) {
      throw new ForbiddenException('Only admin accounts can manage staff accounts.');
    }

    if (!admin.store_id) {
      throw new InternalServerErrorException('Admin account is not linked to a store.');
    }

    await this.ensureVoidPinHashColumn();
    await this.ensureKitchenRoleConstraints();
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    const storeColumns = this.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.storeIdColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for staff listing.');
    }

    const storeJoin = storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.quoteIdentifier(userColumns.storeIdColumn)}` : '';
    const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.normalizedStoreTypeSql(`s.${this.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : 'NULL AS store_type';
    const storeNameSelect = storeColumns.storeNameColumn ? `s.${this.quoteIdentifier(storeColumns.storeNameColumn)} AS store_name` : 'NULL AS store_name';

    const voidPinConfiguredSelect = userColumns.voidPinHashColumn ? `u.${this.quoteIdentifier(userColumns.voidPinHashColumn)} IS NOT NULL AS void_pin_configured` : 'FALSE AS void_pin_configured';

    return this.query<AuthenticatedUser & { void_pin_configured?: boolean }>(
      `
        SELECT
          u.id,
          u.${this.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          u.email,
          u.${this.quoteIdentifier(userColumns.roleColumn)} AS role,
          u.${this.quoteIdentifier(userColumns.storeIdColumn)} AS store_id,
          ${userColumns.staffTypeColumn ? `u.${this.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type` : 'NULL AS staff_type'},
          ${storeTypeSelect},
          ${storeNameSelect},
          ${voidPinConfiguredSelect},
          ${this.userStatusSelect(userColumns)}
        FROM users u
        ${storeJoin}
        WHERE u.${this.quoteIdentifier(userColumns.roleColumn)} IN (${STORE_USER_ROLES_WITH_LEGACY_SQL})
          AND u.${this.quoteIdentifier(userColumns.storeIdColumn)} = $1
        ORDER BY u.id ASC
      `,
      [admin.store_id],
    );
  }

  async createStaffAccount(input: {
    adminUserId: number;
    fullName: string;
    email: string;
    password: string;
    staffType: StaffType;
    role?: StaffRole;
    voidPin?: string | null;
  }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreAdminRole(admin.role) || !admin.store_id) {
      throw new ForbiddenException('Only admin accounts can create staff.');
    }

    await this.ensureVoidPinHashColumn();
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.passwordColumn || !userColumns.storeIdColumn || !userColumns.staffTypeColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for staff creation.');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const role = input.role ?? 'STAFF';
    const staffType = this.staffTypeForRole(role, input.staffType);
    const normalizedVoidPin = role === 'POS_MANAGER'
      ? input.voidPin?.trim() || await this.generateUniqueRetailVoidPin(admin.store_id)
      : null;
    if (normalizedVoidPin) {
      await this.assertUniqueRetailVoidPin(admin.store_id, normalizedVoidPin);
    }
    const voidPinHash = normalizedVoidPin
      ? await bcrypt.hash(normalizedVoidPin, 10)
      : null;
    const voidPinInsertColumns = [
      userColumns.voidPinHashColumn ? this.quoteIdentifier(userColumns.voidPinHashColumn) : null,
      userColumns.voidPinColumn ? this.quoteIdentifier(userColumns.voidPinColumn) : null,
    ].filter((column): column is string => !!column);
    const voidPinInsertColumn = voidPinInsertColumns.length > 0 ? `, ${voidPinInsertColumns.join(', ')}` : '';
    const voidPinInsertValue = voidPinInsertColumns.length > 0 ? `, ${voidPinInsertColumns.map((_, index) => `$${index + 9}`).join(', ')}` : '';
    const voidPinConfiguredSelect = userColumns.voidPinHashColumn ? `$9::text IS NOT NULL AS void_pin_configured,` : 'FALSE AS void_pin_configured,';

    const rows = await this.query<AuthenticatedUser>(
      `
        INSERT INTO users (
          ${this.quoteIdentifier(userColumns.fullNameColumn)},
          email,
          ${this.quoteIdentifier(userColumns.roleColumn)},
          ${this.quoteIdentifier(userColumns.passwordColumn)},
          ${this.quoteIdentifier(userColumns.storeIdColumn)},
          ${this.quoteIdentifier(userColumns.staffTypeColumn)}
          ${voidPinInsertColumn}
        )
        VALUES ($1, $2, $6, $3, $4, $5${voidPinInsertValue})
        RETURNING
          id,
          ${this.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          email,
          ${this.quoteIdentifier(userColumns.roleColumn)} AS role,
          ${this.quoteIdentifier(userColumns.storeIdColumn)} AS store_id,
          ${this.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type,
          $7::text AS store_type,
          $8::text AS store_name,
          ${voidPinConfiguredSelect}
          ${this.userStatusSelect(userColumns, '')}
      `,
      [input.fullName, input.email, passwordHash, admin.store_id, staffType, role, admin.store_type, admin.store_name, voidPinHash, normalizedVoidPin],
    );

    await this.recordActivity({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Staff Accounts',
      action: 'Staff Account Created',
      details: `Created ${role.replaceAll('_', ' ')} Account\nName: ${rows[0].full_name}`,
    });

    return rows[0];
  }

  async updateStaffAccountForAdmin(input: {
    adminUserId: number;
    staffUserId: number;
    fullName: string;
    email: string;
    password?: string;
    staffType: StaffType;
    role?: StaffRole;
    voidPin?: string | null;
  }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreAdminRole(admin.role) || !admin.store_id) {
      throw new ForbiddenException('Only admin accounts can update staff.');
    }

    await this.ensureVoidPinHashColumn();
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    const storeColumns = this.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.storeIdColumn || !userColumns.staffTypeColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for staff updates.');
    }

    const updates: string[] = [
      `${this.quoteIdentifier(userColumns.fullNameColumn)} = $1`,
      `email = $2`,
      `${this.quoteIdentifier(userColumns.staffTypeColumn)} = $3`,
      `${this.quoteIdentifier(userColumns.roleColumn)} = $4`,
    ];
    const role = input.role ?? 'STAFF';
    const values: unknown[] = [input.fullName, input.email, this.staffTypeForRole(role, input.staffType), role];

    let normalizedVoidPin = role === 'POS_MANAGER' && input.voidPin?.trim()
      ? input.voidPin.trim()
      : null;
    if (normalizedVoidPin) {
      await this.assertUniqueRetailVoidPin(admin.store_id, normalizedVoidPin, input.staffUserId);
    }
    if (role === 'POS_MANAGER' && !normalizedVoidPin) {
      if (!userColumns.voidPinHashColumn) {
        throw new InternalServerErrorException('Users table is missing required columns for unique PIN setup.');
      }

      const voidPinSelect = userColumns.voidPinColumn ? `, ${this.quoteIdentifier(userColumns.voidPinColumn)} AS void_pin` : ', NULL AS void_pin';
      const existingRows = await this.query<{ void_pin_hash: string | null; void_pin: string | null }>(
        `
          SELECT ${this.quoteIdentifier(userColumns.voidPinHashColumn)} AS void_pin_hash
            ${voidPinSelect}
          FROM users
          WHERE id = $1
            AND ${this.quoteIdentifier(userColumns.storeIdColumn)} = $2
            AND ${this.quoteIdentifier(userColumns.roleColumn)} IN (${STORE_USER_ROLES_WITH_LEGACY_SQL})
          LIMIT 1
        `,
        [input.staffUserId, admin.store_id],
      );

      if (existingRows.length > 0 && (!existingRows[0].void_pin_hash || !existingRows[0].void_pin)) {
        normalizedVoidPin = await this.generateUniqueRetailVoidPin(admin.store_id, input.staffUserId);
      }
    }

    if (input.password?.trim()) {
      if (!userColumns.passwordColumn) {
        throw new InternalServerErrorException('Users table is missing a password column.');
      }

      values.push(await bcrypt.hash(input.password, 10));
      updates.push(`${this.quoteIdentifier(userColumns.passwordColumn)} = $${values.length}`);
    }

    if (userColumns.voidPinHashColumn) {
      if (role === 'POS_MANAGER' && normalizedVoidPin) {
        values.push(await bcrypt.hash(normalizedVoidPin, 10));
        updates.push(`${this.quoteIdentifier(userColumns.voidPinHashColumn)} = $${values.length}`);
        if (userColumns.voidPinColumn) {
          values.push(normalizedVoidPin);
          updates.push(`${this.quoteIdentifier(userColumns.voidPinColumn)} = $${values.length}`);
        }
      } else if (role !== 'POS_MANAGER') {
        updates.push(`${this.quoteIdentifier(userColumns.voidPinHashColumn)} = NULL`);
        if (userColumns.voidPinColumn) {
          updates.push(`${this.quoteIdentifier(userColumns.voidPinColumn)} = NULL`);
        }
      }
    }

    values.push(input.staffUserId, admin.store_id);
    const staffIdParam = `$${values.length - 1}`;
    const storeIdParam = `$${values.length}`;

    try {
      const storeJoin = storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.quoteIdentifier(userColumns.storeIdColumn)}` : '';
      const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.normalizedStoreTypeSql(`s.${this.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : 'NULL AS store_type';
      const storeNameSelect = storeColumns.storeNameColumn ? `s.${this.quoteIdentifier(storeColumns.storeNameColumn)} AS store_name` : 'NULL AS store_name';
      const voidPinConfiguredSelect = userColumns.voidPinHashColumn ? `u.${this.quoteIdentifier(userColumns.voidPinHashColumn)} IS NOT NULL AS void_pin_configured` : 'FALSE AS void_pin_configured';

      const rows = await this.query<AuthenticatedUser>(
        `
          WITH updated AS (
            UPDATE users
            SET ${updates.join(', ')}
            WHERE id = ${staffIdParam}
              AND ${this.quoteIdentifier(userColumns.roleColumn)} IN (${STORE_USER_ROLES_WITH_LEGACY_SQL})
              AND ${this.quoteIdentifier(userColumns.storeIdColumn)} = ${storeIdParam}
            RETURNING *
          )
          SELECT
            u.id,
            u.${this.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
            u.email,
            u.${this.quoteIdentifier(userColumns.roleColumn)} AS role,
            u.${this.quoteIdentifier(userColumns.storeIdColumn)} AS store_id,
            u.${this.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type,
            ${storeTypeSelect},
            ${storeNameSelect},
            ${voidPinConfiguredSelect},
            ${this.userStatusSelect(userColumns)}
          FROM updated u
          ${storeJoin}
          LIMIT 1
        `,
        values,
      );

      if (rows.length === 0) {
        throw new InternalServerErrorException('Staff account was not found for this store.');
      }

      await this.recordActivity({
        userId: admin.id,
        storeId: admin.store_id,
        userName: admin.full_name,
        userRole: admin.role,
        module: 'Staff Accounts',
        action: 'Staff Account Updated',
        details: `Updated staff account\nName: ${rows[0].full_name}\nRole: ${rows[0].role}`,
      });

      return rows[0];
    } catch (error) {
      this.handleDatabaseWriteError(error, 'Unable to update staff account.');
    }
  }

  async deleteStaffAccountForAdmin(input: { adminUserId: number; staffUserId: number }) {
    if (!Number.isFinite(input.adminUserId) || input.adminUserId <= 0) {
      throw new BadRequestException('A valid admin_user_id is required.');
    }

    if (!Number.isFinite(input.staffUserId) || input.staffUserId <= 0) {
      throw new BadRequestException('A valid staff user id is required.');
    }

    if (input.adminUserId === input.staffUserId) {
      throw new ForbiddenException('You cannot remove your own account from this screen.');
    }

    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreAdminRole(admin.role) || !admin.store_id) {
      throw new ForbiddenException('Only admin accounts can remove staff for their store.');
    }

    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);

    if (!userColumns.roleColumn || !userColumns.storeIdColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for staff deletion.');
    }

    if (userColumns.statusColumn || userColumns.activeColumn) {
      const rows = await this.deactivateStaffForStore(input.staffUserId, admin.store_id, userColumns);

      if (rows.length === 0) {
        throw new NotFoundException('Staff account was not found for this store.');
      }

      await this.recordActivity({
        userId: admin.id,
        storeId: admin.store_id,
        userName: admin.full_name,
        userRole: admin.role,
        module: 'Staff Accounts',
        action: 'Staff Account Deactivated',
        details: `Deactivated staff account\nUser ID: ${input.staffUserId}`,
      });

      return { id: rows[0].id, status: 'INACTIVE', deactivated: true, deleted: false };
    }

    try {
      const rows = await this.hardDeleteStoreUser(input.staffUserId, admin.store_id, userColumns);

      if (rows.length === 0) {
        throw new NotFoundException('Staff account was not found for this store.');
      }

      await this.recordActivity({
        userId: admin.id,
        storeId: admin.store_id,
        userName: admin.full_name,
        userRole: admin.role,
        module: 'Staff Accounts',
        action: 'Staff Account Deleted',
        details: `Deleted staff account\nUser ID: ${input.staffUserId}`,
      });

      return { id: rows[0].id, deleted: true, deactivated: false };
    } catch (error) {
      this.handleDatabaseWriteError(error, 'Unable to remove staff account.');
    }
  }

  async permanentlyDeleteStaffAccountForAdmin(input: { adminUserId: number; staffUserId: number }) {
    if (!Number.isFinite(input.adminUserId) || input.adminUserId <= 0) {
      throw new BadRequestException('A valid admin_user_id is required.');
    }

    if (!Number.isFinite(input.staffUserId) || input.staffUserId <= 0) {
      throw new BadRequestException('A valid staff user id is required.');
    }

    if (input.adminUserId === input.staffUserId) {
      throw new ForbiddenException('You cannot remove your own account from this screen.');
    }

    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreAdminRole(admin.role) || !admin.store_id) {
      throw new ForbiddenException('Only admin accounts can remove staff for their store.');
    }

    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);

    if (!userColumns.roleColumn || !userColumns.storeIdColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for staff deletion.');
    }

    try {
      const rows = await this.hardDeleteStoreUser(input.staffUserId, admin.store_id, userColumns);

      if (rows.length === 0) {
        throw new NotFoundException('Staff account was not found for this store.');
      }

      await this.recordActivity({
        userId: admin.id,
        storeId: admin.store_id,
        userName: admin.full_name,
        userRole: admin.role,
        module: 'Staff Accounts',
        action: 'Staff Account Deleted',
        details: `Permanently deleted staff account\nUser ID: ${input.staffUserId}`,
      });

      return { id: rows[0].id, deleted: true, deactivated: false };
    } catch (error) {
      this.handleDatabaseWriteError(error, 'Unable to delete staff account.');
    }
  }

  async activateStaffAccountForAdmin(input: { adminUserId: number; staffUserId: number }) {
    if (!Number.isFinite(input.adminUserId) || input.adminUserId <= 0) {
      throw new BadRequestException('A valid admin_user_id is required.');
    }

    if (!Number.isFinite(input.staffUserId) || input.staffUserId <= 0) {
      throw new BadRequestException('A valid staff user id is required.');
    }

    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreAdminRole(admin.role) || !admin.store_id) {
      throw new ForbiddenException('Only admin accounts can activate staff for their store.');
    }

    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);

    if ((!userColumns.statusColumn && !userColumns.activeColumn) || !userColumns.roleColumn || !userColumns.storeIdColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for staff activation.');
    }

    const rows = await this.activateStaffForStore(input.staffUserId, admin.store_id, userColumns);

    if (rows.length === 0) {
      throw new NotFoundException('Staff account was not found for this store.');
    }

    await this.recordActivity({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Staff Accounts',
      action: 'Staff Account Activated',
      details: `Activated staff account\nUser ID: ${input.staffUserId}`,
    });

    return { id: rows[0].id, status: 'ACTIVE', activated: true };
  }

  async getStoreInformationForAdmin(adminUserId: number): Promise<StoreInformation> {
    const user = await this.getUserStoreScope(adminUserId);

    if (![...LEGACY_STORE_ADMIN_ROLES, ...STORE_USER_ROLES, 'POS_ADMIN', 'INVENTORY_ADMIN'].includes(String(user.role) as any) || !user.store_id) {
      throw new InternalServerErrorException('Only store users can view store information.');
    }

    await this.ensureStoreInformationRow(user.store_id, user.store_name);

    const rows = await this.query<StoreInformation>(
      `
        SELECT
          id,
          store_id,
          business_name,
          business_description,
          address,
          contact_number,
          email,
          logo,
          receipt_thank_you_message,
          receipt_footer_message,
          operating_hours,
          currency,
          theme_color,
          tax_rate,
          service_charge_rate,
          updated_at
        FROM store_information
        WHERE store_id = $1
        LIMIT 1
      `,
      [user.store_id],
    );

    if (rows.length === 0) {
      throw new InternalServerErrorException('Store information was not found.');
    }

    return rows[0];
  }

  async updateStoreInformationForAdmin(input: {
    adminUserId: number;
    businessName: string;
    businessDescription: string | null;
    address: string | null;
    contactNumber: string | null;
    email: string | null;
    logo: string | null;
    receiptThankYouMessage: string | null;
    receiptFooterMessage: string | null;
    operatingHours: string | null;
    currency: string | null;
    themeColor: string | null;
    taxRate: number | null;
    serviceChargeRate: number | null;
  }): Promise<StoreInformation> {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can update store information.');
    }

    await this.ensureStoreInformationRow(admin.store_id, admin.store_name);

    const rows = await this.query<StoreInformation>(
      `
        UPDATE store_information
        SET
          business_name = $1,
          business_description = $2,
          address = $3,
          contact_number = $4,
          email = $5,
          logo = $6,
          receipt_thank_you_message = $7,
          receipt_footer_message = $8,
          operating_hours = $9,
          currency = $10,
          theme_color = $11,
          tax_rate = $12,
          service_charge_rate = $13,
          updated_at = CURRENT_TIMESTAMP
        WHERE store_id = $14
        RETURNING
          id,
          store_id,
          business_name,
          business_description,
          address,
          contact_number,
          email,
          logo,
          receipt_thank_you_message,
          receipt_footer_message,
          operating_hours,
          currency,
          theme_color,
          tax_rate,
          service_charge_rate,
          updated_at
      `,
      [
        input.businessName,
        input.businessDescription,
        input.address,
        input.contactNumber,
        input.email,
        input.logo,
        input.receiptThankYouMessage,
        input.receiptFooterMessage,
        input.operatingHours,
        input.currency,
        input.themeColor,
        input.taxRate,
        input.serviceChargeRate,
        admin.store_id,
      ],
    );

    await this.recordActivity({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Store Settings',
      action: 'Store Information Updated',
      details: `Store information updated\nBusiness Name: ${rows[0].business_name}`,
    });

    return rows[0];
  }

  async getStoreSettingsForAdmin(adminUserId: number) {
    const admin = await this.getUserStoreScope(adminUserId);

    if (!admin.store_id) {
      throw new InternalServerErrorException('Only store-linked accounts can view store settings.');
    }

    await this.ensureStoreSettingsRow(admin.store_id, admin.store_type);

    const rows = await this.query(
      `
        SELECT *
        FROM store_settings
        WHERE store_id = $1
          AND (store_type = $2 OR store_type IS NULL)
        LIMIT 1
      `,
      [admin.store_id, admin.store_type],
    );

    return rows[0];
  }

  async updateStoreSettingsForAdmin(input: {
    adminUserId: number;
    enableCustomerRecommendation?: boolean;
    enableTableManagement?: boolean;
    enableRefund?: boolean;
    enableVoid?: boolean;
    enableDiscount?: boolean;
    enableEstimatedPrepTime?: boolean;
    prepTimeStrategy?: string;
    customizationPrepTimeMinutes?: number;
    enableServiceCharge?: boolean;
    serviceChargeRate?: number;
    enableTax?: boolean;
    taxRate?: number;
    enableDineIn?: boolean;
    enableTakeout?: boolean;
    enableIngredientCustomization?: boolean;
    enableReceiptPrinting?: boolean;
    enabledPaymentMethods?: string[];
    paymentMethodAccounts?: Record<string, unknown>;
    autoDeductInventoryOnSale?: boolean;
    allowNegativeStock?: boolean;
    defaultLowStockThreshold?: number;
    defaultInventoryUnit?: string;
    cycleCountIntervalDays?: number;
    autoReorderThresholdPercent?: number;
    enableExpiryTracking?: boolean;
    defaultMarkupPercent?: number;
  }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can update store settings.');
    }

    await this.ensureStoreSettingsRow(admin.store_id, admin.store_type);

    const rows = await this.query(
      `
        UPDATE store_settings
        SET
          enable_customer_recommendation = COALESCE($1, enable_customer_recommendation),
          enable_table_management = COALESCE($2, enable_table_management),
          enable_refund = COALESCE($3, enable_refund),
          enable_void = COALESCE($4, enable_void),
          enable_discount = COALESCE($5, enable_discount),
          enable_estimated_prep_time = COALESCE($6, enable_estimated_prep_time),
          prep_time_strategy = COALESCE($7, prep_time_strategy),
          customization_prep_time_minutes = COALESCE($8, customization_prep_time_minutes),
          enable_service_charge = COALESCE($9, enable_service_charge),
          service_charge_rate = COALESCE($10, service_charge_rate),
          service_charge_percentage = COALESCE($10, service_charge_percentage),
          enable_tax = COALESCE($11, enable_tax),
          tax_rate = COALESCE($12, tax_rate),
          enable_dine_in = COALESCE($13, enable_dine_in),
          enable_takeout = COALESCE($14, enable_takeout),
          enable_ingredient_customization = COALESCE($15, enable_ingredient_customization),
          enable_receipt_printing = COALESCE($16, enable_receipt_printing),
          enabled_payment_methods = COALESCE($17, enabled_payment_methods),
          payment_method_accounts = COALESCE($18, payment_method_accounts),
          auto_deduct_inventory_on_sale = COALESCE($19, auto_deduct_inventory_on_sale),
          allow_negative_stock = COALESCE($20, allow_negative_stock),
          default_low_stock_threshold = COALESCE($21, default_low_stock_threshold),
          default_inventory_unit = COALESCE($22, default_inventory_unit),
          cycle_count_interval_days = COALESCE($23, cycle_count_interval_days),
          auto_reorder_threshold_percent = COALESCE($24, auto_reorder_threshold_percent),
          enable_expiry_tracking = COALESCE($25, enable_expiry_tracking),
          default_markup_percent = COALESCE($26, default_markup_percent),
          store_type = COALESCE(store_type, $27),
          updated_at = CURRENT_TIMESTAMP
        WHERE store_id = $28
          AND (store_type = $27 OR store_type IS NULL)
        RETURNING *
      `,
      [
        input.enableCustomerRecommendation,
        input.enableTableManagement,
        input.enableRefund,
        input.enableVoid,
        input.enableDiscount,
        input.enableEstimatedPrepTime,
        input.prepTimeStrategy === 'sequential' ? 'sequential' : input.prepTimeStrategy === 'parallel' ? 'parallel' : null,
        input.customizationPrepTimeMinutes,
        input.enableServiceCharge,
        input.serviceChargeRate,
        input.enableTax,
        input.taxRate,
        input.enableDineIn,
        input.enableTakeout,
        input.enableIngredientCustomization,
        input.enableReceiptPrinting,
        input.enabledPaymentMethods ?? null,
        input.paymentMethodAccounts ? JSON.stringify(input.paymentMethodAccounts) : null,
        input.autoDeductInventoryOnSale,
        input.allowNegativeStock,
        input.defaultLowStockThreshold,
        input.defaultInventoryUnit,
        input.cycleCountIntervalDays,
        input.autoReorderThresholdPercent,
        input.enableExpiryTracking,
        input.defaultMarkupPercent,
        admin.store_type,
        admin.store_id,
      ],
    );

    await this.recordActivity({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Store Settings',
      action: 'Store Settings Updated',
      details: `Store settings updated\nRefunds: ${rows[0].enable_refund ? 'Enabled' : 'Disabled'}\nVoids: ${rows[0].enable_void ? 'Enabled' : 'Disabled'}`,
    });

    return rows[0];
  }

  async getThemePreferencesForUser(userId: number) {
    const user = await this.getUserStoreScope(userId);
    await this.ensureUserPreferencesSchema();

    const userRows = await this.query<UserPreferences>(
      `
        SELECT
          compact_mode,
          low_stock_alerts,
          default_workspace,
          theme_mode,
          theme_preset,
          appearance,
          primary_color,
          secondary_color,
          sidebar_color
        FROM user_preferences
        WHERE user_id = $1
        LIMIT 1
      `,
      [user.id],
    );

    const storeTheme = user.store_id ? await this.getStoreThemePreferences(user.store_id, user.store_type) : null;
    const userTheme = userRows[0] ?? null;
    const effectiveTheme = this.normalizeThemePreferences(userTheme ?? storeTheme ?? DEFAULT_THEME_PREFERENCES);

    return {
      user_preferences: userTheme ? this.normalizeUserPreferences(userTheme) : null,
      store_theme: storeTheme ? this.normalizeThemePreferences(storeTheme) : null,
      effective_theme: effectiveTheme,
      can_manage_store_theme: this.isStoreManagerRole(user.role) && Boolean(user.store_id),
    };
  }

  async updatePersonalThemePreferences(input: {
    userId: number;
    preferences: Partial<UserPreferences>;
  }) {
    const user = await this.getUserStoreScope(input.userId);
    await this.ensureUserPreferencesSchema();
    const preferences = this.normalizeUserPreferences(input.preferences);

    const rows = await this.query<UserPreferences>(
      `
        INSERT INTO user_preferences (
          user_id,
          compact_mode,
          low_stock_alerts,
          default_workspace,
          theme_mode,
          theme_preset,
          appearance,
          primary_color,
          secondary_color,
          sidebar_color
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id) DO UPDATE
        SET
          compact_mode = EXCLUDED.compact_mode,
          low_stock_alerts = EXCLUDED.low_stock_alerts,
          default_workspace = EXCLUDED.default_workspace,
          theme_mode = EXCLUDED.theme_mode,
          theme_preset = EXCLUDED.theme_preset,
          appearance = EXCLUDED.appearance,
          primary_color = EXCLUDED.primary_color,
          secondary_color = EXCLUDED.secondary_color,
          sidebar_color = EXCLUDED.sidebar_color,
          updated_at = CURRENT_TIMESTAMP
        RETURNING
          compact_mode,
          low_stock_alerts,
          default_workspace,
          theme_mode,
          theme_preset,
          appearance,
          primary_color,
          secondary_color,
          sidebar_color
      `,
      [
        user.id,
        preferences.compact_mode,
        preferences.low_stock_alerts,
        preferences.default_workspace,
        preferences.theme_mode,
        preferences.theme_preset,
        preferences.appearance,
        preferences.primary_color,
        preferences.secondary_color,
        preferences.sidebar_color,
      ],
    );

    return this.normalizeUserPreferences(rows[0]);
  }

  async clearPersonalThemePreferences(userId: number) {
    const user = await this.getUserStoreScope(userId);
    await this.ensureUserPreferencesSchema();
    await this.query(`DELETE FROM user_preferences WHERE user_id = $1`, [user.id]);
    return this.getThemePreferencesForUser(user.id);
  }

  async updateStoreThemePreferences(input: {
    userId: number;
    preferences: Partial<StoreThemePreferences>;
  }) {
    const user = await this.getUserStoreScope(input.userId);

    if (!this.isStoreManagerRole(user.role) || !user.store_id) {
      throw new ForbiddenException('Only store admin or manager accounts can update the store theme.');
    }

    await this.ensureStoreSettingsRow(user.store_id, user.store_type);
    const preferences = this.normalizeThemePreferences(input.preferences);

    const rows = await this.query<StoreThemePreferences>(
      `
        UPDATE store_settings
        SET
          theme_mode = $1,
          theme_preset = $2,
          appearance = $3,
          primary_color = $4,
          secondary_color = $5,
          sidebar_color = $6,
          updated_at = CURRENT_TIMESTAMP
        WHERE store_id = $7
          AND (store_type = $8 OR store_type IS NULL)
        RETURNING
          theme_mode,
          theme_preset,
          appearance,
          primary_color,
          secondary_color,
          sidebar_color,
          updated_at
      `,
      [
        preferences.theme_mode,
        preferences.theme_preset,
        preferences.appearance,
        preferences.primary_color,
        preferences.secondary_color,
        preferences.sidebar_color,
        user.store_id,
        user.store_type,
      ],
    );

    await this.recordActivity({
      userId: user.id,
      storeId: user.store_id,
      userName: user.full_name,
      userRole: user.role,
      module: 'Store Settings',
      action: 'Theme Updated',
      details: `Store theme updated\nPreset: ${preferences.theme_preset ?? 'custom'}\nMode: ${preferences.theme_mode}`,
    });

    return this.normalizeThemePreferences(rows[0]);
  }

  async clearStoreThemePreferences(userId: number) {
    const user = await this.getUserStoreScope(userId);

    if (!this.isStoreManagerRole(user.role) || !user.store_id) {
      throw new ForbiddenException('Only store admin or manager accounts can reset the store theme.');
    }

    await this.ensureStoreSettingsRow(user.store_id, user.store_type);

    await this.query(
      `
        UPDATE store_settings
        SET
          theme_mode = $1,
          theme_preset = $2,
          appearance = $3,
          primary_color = $4,
          secondary_color = $5,
          sidebar_color = $6,
          updated_at = CURRENT_TIMESTAMP
        WHERE store_id = $7
          AND (store_type = $8 OR store_type IS NULL)
      `,
      [
        DEFAULT_THEME_PREFERENCES.theme_mode,
        DEFAULT_THEME_PREFERENCES.theme_preset,
        DEFAULT_THEME_PREFERENCES.appearance,
        DEFAULT_THEME_PREFERENCES.primary_color,
        DEFAULT_THEME_PREFERENCES.secondary_color,
        DEFAULT_THEME_PREFERENCES.sidebar_color,
        user.store_id,
        user.store_type,
      ],
    );

    await this.recordActivity({
      userId: user.id,
      storeId: user.store_id,
      userName: user.full_name,
      userRole: user.role,
      module: 'Store Settings',
      action: 'Theme Reset',
      details: 'Store theme reset to default for all accounts without a personal override',
    });

    return this.getThemePreferencesForUser(user.id);
  }

  private async getInventorySyncSettingsForStore(client: PoolClient, storeId: number): Promise<InventorySyncSettings> {
    await this.ensureStoreSettingsSchema();

    const rows = await this.queryWithClient<{
      auto_deduct_inventory_on_sale: boolean | null;
      allow_negative_stock: boolean | null;
    }>(
      client,
      `
        SELECT auto_deduct_inventory_on_sale, allow_negative_stock
        FROM store_settings
        WHERE store_id = $1
        LIMIT 1
      `,
      [storeId],
    );

    return {
      autoDeductInventoryOnSale: rows[0]?.auto_deduct_inventory_on_sale ?? true,
      allowNegativeStock: rows[0]?.allow_negative_stock ?? false,
    };
  }

  async getDefaultLowStockThreshold(storeId: number): Promise<number> {
    await this.ensureStoreSettingsSchema();

    const rows = await this.query<{ default_low_stock_threshold: number | null }>(
      `SELECT default_low_stock_threshold FROM store_settings WHERE store_id = $1 LIMIT 1`,
      [storeId],
    );

    return Number(rows[0]?.default_low_stock_threshold ?? 0);
  }

  async listDiscountSettingsForAdmin(adminUserId: number) {
    const admin = await this.getUserStoreScope(adminUserId);

    if (!admin.store_id) {
      throw new InternalServerErrorException('Only store-linked accounts can view discount settings.');
    }

    await this.ensureDefaultDiscountSettings(admin.store_id);

    return this.query(
      `
        SELECT id, store_id, discount_name, discount_rate, is_enabled, created_at, updated_at
        FROM discount_settings
        WHERE store_id = $1
        ORDER BY id ASC
      `,
      [admin.store_id],
    );
  }

  async createDiscountSettingForAdmin(input: { adminUserId: number; discountName: string; discountRate: number; isEnabled: boolean }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can create discount settings.');
    }

    const rows = await this.query(
      `
        INSERT INTO discount_settings (store_id, discount_name, discount_rate, is_enabled)
        VALUES ($1, $2, $3, $4)
        RETURNING id, store_id, discount_name, discount_rate, is_enabled, created_at, updated_at
      `,
      [admin.store_id, input.discountName, input.discountRate, input.isEnabled],
    );

    await this.recordActivity({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Store Settings',
      action: 'Discount Settings Updated',
      details: `Created discount setting\n${input.discountName}: ${input.discountRate}%`,
    });

    return rows[0];
  }

  async updateDiscountSettingForAdmin(input: { adminUserId: number; discountId: number; discountName: string; discountRate: number; isEnabled: boolean }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can update discount settings.');
    }

    const rows = await this.query(
      `
        UPDATE discount_settings
        SET discount_name = $1,
            discount_rate = $2,
            is_enabled = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
          AND store_id = $5
        RETURNING id, store_id, discount_name, discount_rate, is_enabled, created_at, updated_at
      `,
      [input.discountName, input.discountRate, input.isEnabled, input.discountId, admin.store_id],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Discount setting was not found for this store.');
    }

    await this.recordActivity({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Store Settings',
      action: 'Discount Settings Updated',
      details: `Updated discount setting\n${input.discountName}: ${input.discountRate}%`,
    });

    return rows[0];
  }

  async deleteDiscountSettingForAdmin(input: { adminUserId: number; discountId: number }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can delete discount settings.');
    }

    const rows = await this.query(
      `
        DELETE FROM discount_settings
        WHERE id = $1
          AND store_id = $2
        RETURNING id
      `,
      [input.discountId, admin.store_id],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Discount setting was not found for this store.');
    }

    await this.recordActivity({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Store Settings',
      action: 'Discount Settings Updated',
      details: `Deleted discount setting\nDiscount ID: ${input.discountId}`,
    });

    return { id: input.discountId };
  }

  async listCategoriesForAdmin(adminUserId: number) {
    const admin = await this.getUserStoreScope(adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can view categories.');
    }

    return this.query(
      `
        SELECT id, store_id, store_type, name, description, created_at, updated_at
        FROM product_categories
        WHERE store_id = $1
          AND store_type = $2
        ORDER BY name ASC
      `,
      [admin.store_id, admin.store_type],
    );
  }

  async createCategoryForAdmin(input: { adminUserId: number; name: string; description: string | null }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id || !admin.store_type) {
      throw new InternalServerErrorException('Only store admin accounts can create categories.');
    }

    const rows = await this.query(
      `
        INSERT INTO product_categories (store_id, store_type, name, description)
        VALUES ($1, $2, $3, $4)
        RETURNING id, store_id, store_type, name, description, created_at, updated_at
      `,
      [admin.store_id, admin.store_type, input.name, input.description],
    );

    return rows[0];
  }

  async updateCategoryForAdmin(input: { adminUserId: number; categoryId: number; name: string; description: string | null }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can update categories.');
    }

    const rows = await this.query(
      `
        UPDATE product_categories
        SET name = $1,
            description = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
          AND store_id = $4
        RETURNING id, store_id, store_type, name, description, created_at, updated_at
      `,
      [input.name, input.description, input.categoryId, admin.store_id],
    );

    if (rows.length === 0) {
      throw new InternalServerErrorException('Category was not found for this store.');
    }

    return rows[0];
  }

  async deleteCategoryForAdmin(input: { adminUserId: number; categoryId: number }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can delete categories.');
    }

    const rows = await this.query<{ id: number }>(
      `
        DELETE FROM product_categories
        WHERE id = $1
          AND store_id = $2
        RETURNING id
      `,
      [input.categoryId, admin.store_id],
    );

    return { id: rows[0]?.id ?? input.categoryId, deleted: rows.length > 0 };
  }

  async listProductsForAdmin(adminUserId: number) {
    const admin = await this.getUserStoreScope(adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can view products.');
    }

    const products = await this.query<any>(
      `
        SELECT
          p.*,
          c.name AS category_name,
          CASE
            WHEN p.store_type = 'RESTAURANT' THEN COALESCE(availability.available_quantity, 0)
            ELSE COALESCE(variant_summary.stock_quantity, p.stock_quantity, 0)
          END AS available_quantity,
          variant_summary.min_price
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN LATERAL (
          SELECT
            SUM(COALESCE(pv.stock_quantity, 0)) AS stock_quantity,
            MIN(pv.price) AS min_price
          FROM product_variants pv
          WHERE pv.product_id = p.id
            AND COALESCE(pv.is_active, TRUE) = TRUE
        ) variant_summary ON TRUE
        LEFT JOIN LATERAL (
          SELECT MIN(FLOOR(
            CASE
              WHEN inv."expiryDate" IS NOT NULL AND inv."expiryDate"::date < CURRENT_DATE THEN 0
              ELSE ii.quantity_available
            END / NULLIF(pi.quantity_required, 0)
          )) AS available_quantity
          FROM product_ingredients pi
          JOIN ingredients_inventory ii ON ii.id = pi.ingredient_id
          LEFT JOIN "InventoryItem" inv ON inv.id = ii.inventory_item_id
          WHERE pi.product_id = p.id
            AND pi.is_required = TRUE
            AND COALESCE(ii.is_available, TRUE) = TRUE
        ) availability ON TRUE
        WHERE p.store_id = $1
          AND p.store_type = $2
        ORDER BY p.created_at DESC
      `,
      [admin.store_id, admin.store_type],
    );

    if (admin.store_type !== 'RETAIL_STORE' || products.length === 0) {
      return products;
    }

    const variants = await this.query<any>(
      `
        SELECT pv.*
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE p.store_id = $1
          AND p.store_type = 'RETAIL_STORE'
        ORDER BY pv.id ASC
      `,
      [admin.store_id],
    );

    const variantsByProduct = new Map<number, any[]>();
    for (const variant of variants) {
      const list = variantsByProduct.get(Number(variant.product_id)) ?? [];
      list.push(variant);
      variantsByProduct.set(Number(variant.product_id), list);
    }

    return products.map((product) => ({
      ...product,
      price: product.min_price ?? product.price,
      stock_quantity: product.available_quantity,
      variants: variantsByProduct.get(Number(product.id)) ?? [],
    }));
  }

  async createProductForAdmin(input: any) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id || !admin.store_type) {
      throw new InternalServerErrorException('Only store admin accounts can create products.');
    }

    const product = await this.withTransaction(async (client) => {
      const rows = await this.queryWithClient(
        client,
      `
        INSERT INTO products (
          store_id, category_id, store_type, name, description, price, image_url,
          meal_type, preparation_time_minutes, sku, barcode, unit, size, color,
          stock_quantity, low_stock_limit, is_available, brand, material
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, COALESCE($17, TRUE), $18, $19)
        RETURNING *
      `,
      [
        admin.store_id,
        input.categoryId,
        admin.store_type,
        input.name,
        input.description ?? null,
        admin.store_type === 'RETAIL_STORE' ? 0 : input.price,
        input.image_url ?? null,
        input.meal_type ?? null,
        input.preparation_time_minutes ?? null,
        input.sku ?? null,
        input.barcode ?? null,
        input.unit ?? null,
        input.size ?? null,
        input.color ?? null,
        input.stock_quantity ?? 0,
        input.low_stock_limit ?? 5,
        input.is_available,
        input.brand ?? null,
        input.material ?? null,
      ],
      );

      if (admin.store_type === 'RETAIL_STORE') {
        await this.replaceProductVariants(client, rows[0].id, input.variants ?? []);
      } else {
        await this.replaceProductIngredients(client, admin.store_id!, rows[0].id, input.ingredients ?? []);
      }
      return rows[0];
    });

    return product;
  }

  async updateProductForAdmin(input: any) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can update products.');
    }

    const product = await this.withTransaction(async (client) => {
      const rows = await this.queryWithClient(
        client,
      `
        UPDATE products
        SET
          category_id = $1,
          name = $2,
          description = $3,
          price = $4,
          image_url = $5,
          meal_type = $6,
          preparation_time_minutes = $7,
          sku = $8,
          barcode = $9,
          unit = $10,
          size = $11,
          color = $12,
          stock_quantity = $13,
          low_stock_limit = $14,
          is_available = COALESCE($15, is_available),
          brand = $16,
          material = $17,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $18
          AND store_id = $19
        RETURNING *
      `,
      [
        input.categoryId,
        input.name,
        input.description ?? null,
        admin.store_type === 'RETAIL_STORE' ? 0 : input.price,
        input.image_url ?? null,
        input.meal_type ?? null,
        input.preparation_time_minutes ?? null,
        input.sku ?? null,
        input.barcode ?? null,
        input.unit ?? null,
        input.size ?? null,
        input.color ?? null,
        input.stock_quantity ?? 0,
        input.low_stock_limit ?? 5,
        input.is_available,
        input.brand ?? null,
        input.material ?? null,
        input.productId,
        admin.store_id,
      ],
      );

      if (rows.length === 0) {
        throw new InternalServerErrorException('Product was not found for this store.');
      }

      if (admin.store_type === 'RETAIL_STORE' && Array.isArray(input.variants)) {
        await this.replaceProductVariants(client, input.productId, input.variants);
      } else if (Array.isArray(input.ingredients)) {
        await this.replaceProductIngredients(client, admin.store_id!, input.productId, input.ingredients);
      }

      return rows[0];
    });

    return product;
  }

  async deleteProductForAdmin(input: { adminUserId: number; productId: number }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can delete products.');
    }

    const rows = await this.query<{ id: number }>(
      `
        DELETE FROM products
        WHERE id = $1
          AND store_id = $2
        RETURNING id
      `,
      [input.productId, admin.store_id],
    );

    return { id: rows[0]?.id ?? input.productId, deleted: rows.length > 0 };
  }

  async listIngredientsForAdmin(adminUserId: number) {
    const admin = await this.getUserStoreScope(adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can view ingredients.');
    }

    return this.query(
      `
        SELECT *
        FROM ingredients_inventory
        WHERE store_id = $1
        ORDER BY ingredient_name ASC
      `,
      [admin.store_id],
    );
  }

  async createIngredientForAdmin(input: any) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can create ingredients.');
    }

    const rows = await this.query(
      `
        INSERT INTO ingredients_inventory (
          store_id, ingredient_name, quantity_available, unit, low_stock_limit, cost_per_unit, is_available
        )
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE))
        RETURNING *
      `,
      [
        admin.store_id,
        input.ingredientName,
        input.quantityAvailable ?? 0,
        input.unit,
        input.lowStockLimit ?? 0,
        input.costPerUnit ?? 0,
        input.isAvailable,
      ],
    );

    return rows[0];
  }

  async updateIngredientForAdmin(input: any) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can update ingredients.');
    }

    const rows = await this.query(
      `
        UPDATE ingredients_inventory
        SET ingredient_name = $1,
            quantity_available = $2,
            unit = $3,
            low_stock_limit = $4,
            cost_per_unit = $5,
            is_available = COALESCE($6, is_available),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
          AND store_id = $8
        RETURNING *
      `,
      [
        input.ingredientName,
        input.quantityAvailable ?? 0,
        input.unit,
        input.lowStockLimit ?? 0,
        input.costPerUnit ?? 0,
        input.isAvailable,
        input.ingredientId,
        admin.store_id,
      ],
    );

    if (rows.length === 0) {
      throw new InternalServerErrorException('Ingredient was not found for this store.');
    }

    return rows[0];
  }

  async deleteIngredientForAdmin(input: { adminUserId: number; ingredientId: number }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can delete ingredients.');
    }

    const rows = await this.query<{ id: number }>(
      `
        DELETE FROM ingredients_inventory
        WHERE id = $1
          AND store_id = $2
        RETURNING id
      `,
      [input.ingredientId, admin.store_id],
    );

    return { id: rows[0]?.id ?? input.ingredientId, deleted: rows.length > 0 };
  }

  async listIngredientAlternativesForAdmin(adminUserId: number) {
    const admin = await this.getUserStoreScope(adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can view ingredient alternatives.');
    }

    return this.query(
      `
        SELECT
          ia.id,
          ia.store_id,
          ia.parent_ingredient_id,
          parent.ingredient_name AS parent_ingredient_name,
          ia.alternative_ingredient_id,
          alternative.ingredient_name AS alternative_ingredient_name,
          alternative.quantity_available AS alternative_quantity_available,
          alternative.unit AS alternative_unit,
          ia.additional_price,
          ia.is_available,
          ia.created_at,
          ia.updated_at
        FROM ingredient_alternatives ia
        JOIN ingredients_inventory parent ON parent.id = ia.parent_ingredient_id
        JOIN ingredients_inventory alternative ON alternative.id = ia.alternative_ingredient_id
        WHERE ia.store_id = $1
        ORDER BY parent.ingredient_name ASC, alternative.ingredient_name ASC
      `,
      [admin.store_id],
    );
  }

  async createIngredientAlternativeForAdmin(input: any) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can create ingredient alternatives.');
    }

    if (Number(input.parentIngredientId) === Number(input.alternativeIngredientId)) {
      throw new BadRequestException('Alternative ingredient must be different from the parent ingredient.');
    }

    const ingredientRows = await this.query<{ id: number; ingredient_name: string }>(
      `
        SELECT id, ingredient_name
        FROM ingredients_inventory
        WHERE store_id = $1
          AND id IN ($2, $3)
      `,
      [admin.store_id, input.parentIngredientId, input.alternativeIngredientId],
    );

    if (ingredientRows.length !== 2) {
      throw new NotFoundException('Both parent and alternative ingredients must exist in this store inventory.');
    }

    const alternative = ingredientRows.find((row) => Number(row.id) === Number(input.alternativeIngredientId));
    const rows = await this.query(
      `
        INSERT INTO ingredient_alternatives (
          store_id, parent_ingredient_id, alternative_ingredient_id, alternative_name,
          additional_price, is_available
        )
        VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE))
        RETURNING *
      `,
      [
        admin.store_id,
        input.parentIngredientId,
        input.alternativeIngredientId,
        alternative?.ingredient_name ?? 'Alternative',
        input.additionalPrice ?? 0,
        input.isAvailable,
      ],
    );

    return rows[0];
  }

  async updateIngredientAlternativeForAdmin(input: any) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can update ingredient alternatives.');
    }

    if (Number(input.parentIngredientId) === Number(input.alternativeIngredientId)) {
      throw new BadRequestException('Alternative ingredient must be different from the parent ingredient.');
    }

    const ingredientRows = await this.query<{ id: number; ingredient_name: string }>(
      `
        SELECT id, ingredient_name
        FROM ingredients_inventory
        WHERE store_id = $1
          AND id IN ($2, $3)
      `,
      [admin.store_id, input.parentIngredientId, input.alternativeIngredientId],
    );

    if (ingredientRows.length !== 2) {
      throw new NotFoundException('Both parent and alternative ingredients must exist in this store inventory.');
    }

    const alternative = ingredientRows.find((row) => Number(row.id) === Number(input.alternativeIngredientId));
    const rows = await this.query(
      `
        UPDATE ingredient_alternatives
        SET parent_ingredient_id = $1,
            alternative_ingredient_id = $2,
            alternative_name = $3,
            additional_price = $4,
            is_available = COALESCE($5, is_available),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
          AND store_id = $7
        RETURNING *
      `,
      [
        input.parentIngredientId,
        input.alternativeIngredientId,
        alternative?.ingredient_name ?? 'Alternative',
        input.additionalPrice ?? 0,
        input.isAvailable,
        input.alternativeId,
        admin.store_id,
      ],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Ingredient alternative was not found for this store.');
    }

    return rows[0];
  }

  async deleteIngredientAlternativeForAdmin(input: { adminUserId: number; alternativeId: number }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can delete ingredient alternatives.');
    }

    const rows = await this.query<{ id: number }>(
      `
        DELETE FROM ingredient_alternatives
        WHERE id = $1
          AND store_id = $2
        RETURNING id
      `,
      [input.alternativeId, admin.store_id],
    );

    return { id: rows[0]?.id ?? input.alternativeId, deleted: rows.length > 0 };
  }

  async listInventoryDeductionsForAdmin(adminUserId: number) {
    const admin = await this.getUserStoreScope(adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can view inventory history.');
    }

    return this.query(
      `
        SELECT
          d.id,
          d.store_id,
          d.order_id,
          o.order_number,
          d.order_item_id,
          oi.product_name AS order_item_name,
          d.ingredient_id,
          ii.ingredient_name,
          d.product_id,
          d.variant_id,
          CASE
            WHEN pv.id IS NOT NULL THEN CONCAT(p.name, ' - ', COALESCE(pv.size, 'No size'), ' / ', COALESCE(pv.color, 'No color'))
            ELSE p.name
          END AS product_name,
          d.deduction_type,
          d.quantity_deducted,
          d.unit,
          d.created_at
        FROM inventory_deductions d
        LEFT JOIN orders o ON o.id = d.order_id
        LEFT JOIN order_items oi ON oi.id = d.order_item_id
        LEFT JOIN ingredients_inventory ii ON ii.id = d.ingredient_id
        LEFT JOIN products p ON p.id = d.product_id
        LEFT JOIN product_variants pv ON pv.id = d.variant_id
        WHERE d.store_id = $1
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT 200
      `,
      [admin.store_id],
    );
  }

  async listProductIngredientsForAdmin(input: { adminUserId: number; productId: number }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can view product ingredients.');
    }

    return this.query(
      `
        SELECT
          pi.*,
          ii.ingredient_name,
          ii.quantity_available,
          ii.low_stock_limit
        FROM product_ingredients pi
        LEFT JOIN ingredients_inventory ii ON ii.id = pi.ingredient_id
        WHERE pi.store_id = $1
          AND pi.product_id = $2
        ORDER BY pi.id ASC
      `,
      [admin.store_id, input.productId],
    );
  }

  private async resolveInventoryBusinessIdForStoreScope(user: AuthenticatedUser, client?: PoolClient): Promise<string | null> {
    if (!user.store_type) {
      return null;
    }

    const module = user.store_type === 'RETAIL_STORE' ? 'RETAIL' : 'RESTAURANT';
    // 1. Deterministic store -> business link wins, if configured for this store and
    // the linked business supports the store's module. This removes the guessing.
    await this.ensureStoreInventoryLink(client);
    if (user.store_id) {
      const linkedSql = `SELECT b.id
         FROM stores s
         JOIN "Business" b ON b.id = s.inventory_business_id
         WHERE s.id = $1 AND $2::"BusinessModule" = ANY(b.modules)
         LIMIT 1`;
      const linkedParams = [user.store_id, module];
      const linked = client
        ? await this.queryWithClient<{ id: string }>(client, linkedSql, linkedParams)
        : await this.query<{ id: string }>(linkedSql, linkedParams);
      if (linked[0]?.id) {
        return linked[0].id;
      }
    }

    // 2. Fallback heuristic: email match, then most items, then newest.
    const sql = `
      SELECT b.id
      FROM "Business" b
      LEFT JOIN "User" matched_user
        ON matched_user."businessId" = b.id
       AND lower(matched_user.email) = lower($1)
      WHERE $2::"BusinessModule" = ANY(b.modules)
      ORDER BY
        CASE WHEN matched_user.id IS NOT NULL THEN 0 ELSE 1 END,
        CASE
          WHEN $2::text = 'RESTAURANT' THEN (
            SELECT COUNT(*)
            FROM "Recipe" r
            WHERE r."businessId" = b.id
              AND COALESCE(r."isActive", TRUE) = TRUE
              AND r."menuItemId" IS NOT NULL
          )
          ELSE (
            SELECT COUNT(*)
            FROM "InventoryItem" i
            WHERE i."businessId" = b.id
              AND i."itemType" = 'RETAIL_ITEM'::"InventoryItemType"
          )
        END DESC,
        b."createdAt" DESC
      LIMIT 1
    `;
    const params = [user.email, module];
    const rows = client
      ? await this.queryWithClient<{ id: string }>(client, sql, params)
      : await this.query<{ id: string }>(sql, params);

    return rows[0]?.id ?? null;
  }

  private async syncRestaurantRecipesIntoPosCatalog(user: AuthenticatedUser) {
    if (!user.store_id || user.store_type !== 'RESTAURANT') {
      return;
    }

    const businessId = await this.resolveInventoryBusinessIdForStoreScope(user);
    if (!businessId) {
      return;
    }

    await this.withTransaction(async (client) => {
      await this.queryWithClient(
        client,
        `
          WITH recipe_categories AS (
            SELECT DISTINCT trim(r.category) AS name
            FROM "Recipe" r
            WHERE r."businessId" = $2
              AND COALESCE(r."isActive", TRUE) = TRUE
              AND r."menuItemId" IS NOT NULL
              AND trim(COALESCE(r.category, '')) <> ''
          )
          INSERT INTO product_categories (store_id, store_type, name)
          SELECT $1, 'RESTAURANT', rc.name
          FROM recipe_categories rc
          WHERE NOT EXISTS (
            SELECT 1
            FROM product_categories pc
            WHERE pc.store_id = $1
              AND pc.store_type = 'RESTAURANT'
              AND lower(pc.name) = lower(rc.name)
          )
        `,
        [user.store_id, businessId],
      );

      await this.queryWithClient(
        client,
        `
          WITH recipe_products AS (
            SELECT
              r.name,
              r.category,
              r.instructions,
              r."sellingPrice",
              COALESCE(NULLIF(r."imageUrl", ''), NULLIF(i."imageUrl", '')) AS "imageUrl",
              r."menuItemId",
              COALESCE(NULLIF(i.description, ''), NULLIF(r.instructions, '')) AS description,
              i.sku,
              i.barcode,
              i.unit,
              i.size,
              i.quantity,
              i."minStock"
            FROM "Recipe" r
            JOIN "InventoryItem" i
              ON i.id = r."menuItemId"
             AND i."businessId" = r."businessId"
            WHERE r."businessId" = $2
              AND COALESCE(r."isActive", TRUE) = TRUE
              AND r."menuItemId" IS NOT NULL
          )
          INSERT INTO products (
            store_id,
            category_id,
            store_type,
            name,
            description,
            price,
            image_url,
            sku,
            barcode,
            unit,
            size,
            stock_quantity,
            low_stock_limit,
            is_available,
            inventory_item_id
          )
          SELECT
            $1,
            pc.id,
            'RESTAURANT',
            rp.name,
            rp.description,
            COALESCE(rp."sellingPrice", 0),
            rp."imageUrl",
            rp.sku,
            rp.barcode,
            rp.unit,
            rp.size,
            COALESCE(rp.quantity, 0),
            COALESCE(rp."minStock", 0),
            TRUE,
            rp."menuItemId"
          FROM recipe_products rp
          LEFT JOIN product_categories pc
            ON pc.store_id = $1
           AND pc.store_type = 'RESTAURANT'
           AND lower(pc.name) = lower(rp.category)
          ON CONFLICT (store_id, inventory_item_id) WHERE inventory_item_id IS NOT NULL
          DO UPDATE SET
            category_id = EXCLUDED.category_id,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price = EXCLUDED.price,
            image_url = EXCLUDED.image_url,
            sku = EXCLUDED.sku,
            barcode = EXCLUDED.barcode,
            unit = EXCLUDED.unit,
            size = EXCLUDED.size,
            stock_quantity = EXCLUDED.stock_quantity,
            low_stock_limit = EXCLUDED.low_stock_limit,
            is_available = TRUE,
            updated_at = CURRENT_TIMESTAMP
        `,
        [user.store_id, businessId],
      );

      await this.queryWithClient(
        client,
        `
          UPDATE products p
          SET is_available = FALSE,
              updated_at = CURRENT_TIMESTAMP
          WHERE p.store_id = $1
            AND p.store_type = 'RESTAURANT'
            AND (
              p.inventory_item_id IS NULL
              OR NOT EXISTS (
                SELECT 1
                FROM "Recipe" r
                WHERE r."businessId" = $2
                  AND COALESCE(r."isActive", TRUE) = TRUE
                  AND r."menuItemId" = p.inventory_item_id
              )
            )
        `,
        [user.store_id, businessId],
      );

      await this.queryWithClient(
        client,
        `
          INSERT INTO ingredients_inventory (
            store_id,
            ingredient_name,
            quantity_available,
            unit,
            low_stock_limit,
            cost_per_unit,
            is_available,
            inventory_item_id
          )
          SELECT
            $1,
            i.name,
            COALESCE(i.quantity, 0),
            COALESCE(i.unit, 'unit'),
            COALESCE(i."minStock", 0),
            COALESCE(i."costPrice", i.price, 0),
            TRUE,
            i.id
          FROM "InventoryItem" i
          WHERE i."businessId" = $2
            AND i."itemType" IN ('INGREDIENT'::"InventoryItemType", 'SUPPLY'::"InventoryItemType")
          ON CONFLICT (store_id, inventory_item_id) WHERE inventory_item_id IS NOT NULL
          DO UPDATE SET
            ingredient_name = EXCLUDED.ingredient_name,
            quantity_available = EXCLUDED.quantity_available,
            unit = EXCLUDED.unit,
            low_stock_limit = EXCLUDED.low_stock_limit,
            cost_per_unit = EXCLUDED.cost_per_unit,
            is_available = EXCLUDED.is_available,
            updated_at = CURRENT_TIMESTAMP
        `,
        [user.store_id, businessId],
      );

      await this.queryWithClient(
        client,
        `
          DELETE FROM product_ingredients pi
          USING products p
          WHERE p.id = pi.product_id
            AND p.store_id = $1
            AND p.store_type = 'RESTAURANT'
            AND p.inventory_item_id IS NOT NULL
        `,
        [user.store_id],
      );

      await this.queryWithClient(
        client,
        `
          INSERT INTO product_ingredients (
            store_id,
            product_id,
            ingredient_id,
            ingredient_name,
            quantity_required,
            default_quantity,
            unit,
            additional_cost,
            is_required,
            is_removable,
            recipe_ingredient_id
          )
          SELECT
            $1,
            p.id,
            ii.id,
            inv.name,
            ri.quantity,
            ri.quantity,
            COALESCE(ri.unit, inv.unit, 'unit'),
            COALESCE(ri."unitCost", 0),
            TRUE,
            TRUE,
            ri.id
          FROM "Recipe" r
          JOIN products p
            ON p.store_id = $1
           AND p.store_type = 'RESTAURANT'
           AND p.inventory_item_id = r."menuItemId"
          JOIN "RecipeIngredient" ri
            ON ri."recipeId" = r.id
          JOIN "InventoryItem" inv
            ON inv.id = ri."itemId"
          JOIN ingredients_inventory ii
            ON ii.store_id = $1
           AND ii.inventory_item_id = inv.id
          WHERE r."businessId" = $2
            AND COALESCE(r."isActive", TRUE) = TRUE
            AND r."menuItemId" IS NOT NULL
        `,
        [user.store_id, businessId],
      );
    });
  }

  private async syncRetailInventoryIntoPosCatalog(user: AuthenticatedUser) {
    if (!user.store_id || user.store_type !== 'RETAIL_STORE') {
      return;
    }

    const businessId = await this.resolveInventoryBusinessIdForStoreScope(user);
    if (!businessId) {
      return;
    }

    await this.withTransaction(async (client) => {
      await this.queryWithClient(
        client,
        `
          WITH retail_categories AS (
            SELECT DISTINCT trim(i.category) AS name
            FROM "InventoryItem" i
            WHERE i."businessId" = $2
              AND i."itemType" = 'RETAIL_ITEM'::"InventoryItemType"
              AND trim(COALESCE(i.category, '')) <> ''
          )
          INSERT INTO product_categories (store_id, store_type, name)
          SELECT $1, 'RETAIL_STORE', rc.name
          FROM retail_categories rc
          WHERE NOT EXISTS (
            SELECT 1
            FROM product_categories pc
            WHERE pc.store_id = $1
              AND pc.store_type = 'RETAIL_STORE'
              AND lower(pc.name) = lower(rc.name)
          )
        `,
        [user.store_id, businessId],
      );

      await this.queryWithClient(
        client,
        `
          WITH retail_items AS (
            SELECT
              i.id,
              i.name,
              i.description,
              i.category,
              i.price,
              i."imageUrl",
              i.sku,
              i.barcode,
              i.unit,
              i.size,
              i.quantity,
              i."minStock"
            FROM "InventoryItem" i
            WHERE i."businessId" = $2
              AND i."itemType" = 'RETAIL_ITEM'::"InventoryItemType"
          )
          INSERT INTO products (
            store_id,
            category_id,
            store_type,
            name,
            description,
            price,
            image_url,
            sku,
            barcode,
            unit,
            size,
            stock_quantity,
            low_stock_limit,
            is_available,
            inventory_item_id
          )
          SELECT
            $1,
            pc.id,
            'RETAIL_STORE',
            ri.name,
            ri.description,
            COALESCE(ri.price, 0),
            ri."imageUrl",
            ri.sku,
            ri.barcode,
            ri.unit,
            ri.size,
            FLOOR(COALESCE(ri.quantity, 0))::int,
            FLOOR(COALESCE(ri."minStock", 0))::int,
            TRUE,
            ri.id
          FROM retail_items ri
          LEFT JOIN product_categories pc
            ON pc.store_id = $1
           AND pc.store_type = 'RETAIL_STORE'
           AND lower(pc.name) = lower(ri.category)
          ON CONFLICT (store_id, inventory_item_id) WHERE inventory_item_id IS NOT NULL
          DO UPDATE SET
            category_id = EXCLUDED.category_id,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price = EXCLUDED.price,
            image_url = EXCLUDED.image_url,
            sku = EXCLUDED.sku,
            barcode = EXCLUDED.barcode,
            unit = EXCLUDED.unit,
            size = EXCLUDED.size,
            stock_quantity = EXCLUDED.stock_quantity,
            low_stock_limit = EXCLUDED.low_stock_limit,
            is_available = TRUE,
            updated_at = CURRENT_TIMESTAMP
        `,
        [user.store_id, businessId],
      );

      await this.queryWithClient(
        client,
        `
          INSERT INTO product_variants (
            product_id,
            size,
            sku,
            barcode,
            image_url,
            price,
            stock_quantity,
            low_stock_limit,
            is_active,
            inventory_item_id
          )
          SELECT
            p.id,
            p.size,
            p.sku,
            p.barcode,
            p.image_url,
            p.price,
            p.stock_quantity,
            p.low_stock_limit,
            p.is_available,
            p.inventory_item_id
          FROM products p
          WHERE p.store_id = $1
            AND p.store_type = 'RETAIL_STORE'
            AND p.inventory_item_id IS NOT NULL
          ON CONFLICT (product_id, inventory_item_id) WHERE inventory_item_id IS NOT NULL
          DO UPDATE SET
            size = EXCLUDED.size,
            sku = EXCLUDED.sku,
            barcode = EXCLUDED.barcode,
            image_url = EXCLUDED.image_url,
            price = EXCLUDED.price,
            stock_quantity = EXCLUDED.stock_quantity,
            low_stock_limit = EXCLUDED.low_stock_limit,
            is_active = EXCLUDED.is_active,
            updated_at = CURRENT_TIMESTAMP
        `,
        [user.store_id],
      );

      await this.queryWithClient(
        client,
        `
          UPDATE products p
          SET is_available = FALSE,
              updated_at = CURRENT_TIMESTAMP
          WHERE p.store_id = $1
            AND p.store_type = 'RETAIL_STORE'
            AND (
              p.inventory_item_id IS NULL
              OR NOT EXISTS (
                SELECT 1
                FROM "InventoryItem" i
                WHERE i."businessId" = $2
                  AND i."itemType" = 'RETAIL_ITEM'::"InventoryItemType"
                  AND i.id = p.inventory_item_id
              )
            )
        `,
        [user.store_id, businessId],
      );

      await this.queryWithClient(
        client,
        `
          DELETE FROM product_categories pc
          WHERE pc.store_id = $1
            AND pc.store_type = 'RETAIL_STORE'
            AND NOT EXISTS (
              SELECT 1 FROM products p WHERE p.category_id = pc.id
            )
        `,
        [user.store_id],
      );
    });
  }

  async listPosProducts(userId: number) {
    const user = await this.getUserStoreScope(userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }
    if (this.isKitchenRole(user.role)) {
      throw new ForbiddenException('Kitchen accounts cannot access the POS product catalog.');
    }

    if (user.store_type === 'RESTAURANT') {
      await this.syncRestaurantRecipesIntoPosCatalog(user);
    } else if (user.store_type === 'RETAIL_STORE') {
      await this.syncRetailInventoryIntoPosCatalog(user);
    }

    const restaurantBusinessId =
      user.store_type === 'RESTAURANT'
        ? await this.resolveInventoryBusinessIdForStoreScope(user)
        : null;

    if (user.store_type === 'RETAIL_STORE') {
      return this.query<any>(
        `
          SELECT
            p.id,
            pv.id AS variant_id,
            p.store_id,
            p.store_type,
            p.category_id,
            p.name,
            p.description,
            p.brand,
            p.material,
            p.inventory_item_id,
            COALESCE(pv.image_url, p.image_url) AS image_url,
            p.is_available,
            c.name AS category_name,
            pv.size,
            pv.color,
            pv.sku,
            pv.barcode,
            pv.inventory_item_id AS variant_inventory_item_id,
            pv.price,
            pv.stock_quantity,
            pv.low_stock_limit,
            pv.is_active,
            pv.stock_quantity AS available_quantity,
            pv.stock_quantity AS available_orders,
            pv.stock_quantity AS "availableOrders"
          FROM products p
          JOIN product_variants pv ON pv.product_id = p.id
          LEFT JOIN product_categories c ON c.id = p.category_id
          WHERE p.store_id = $1
            AND p.store_type = 'RETAIL_STORE'
            AND COALESCE(p.is_available, TRUE) = TRUE
            AND COALESCE(pv.is_active, TRUE) = TRUE
          ORDER BY p.name ASC, pv.color ASC NULLS LAST, pv.size ASC NULLS LAST
        `,
        [user.store_id],
      );
    }

    const products = await this.query<any>(
      `
        SELECT
          p.id,
          p.store_id,
          p.store_type,
          p.category_id,
          p.name,
          COALESCE(NULLIF(p.description, ''), NULLIF(menu_item.description, ''), NULLIF(r.instructions, '')) AS description,
          p.price,
          COALESCE(NULLIF(p.image_url, ''), NULLIF(menu_item."imageUrl", ''), NULLIF(r."imageUrl", '')) AS image_url,
          p.sku,
          p.barcode,
          p.unit,
          p.size,
          p.stock_quantity,
          p.low_stock_limit,
          p.inventory_item_id,
          p.is_available,
          p.created_at,
          p.updated_at,
          c.name AS category_name,
          COALESCE(r.modifiers, '[]'::jsonb) AS modifiers,
          r.servings,
          r."prepTimeMinutes" AS prep_time_minutes,
          CASE
            WHEN p.store_type = 'RESTAURANT' THEN COALESCE(availability.available_quantity, 0)
            ELSE COALESCE(p.stock_quantity, 0)
          END AS available_quantity,
          CASE
            WHEN p.store_type = 'RESTAURANT' THEN COALESCE(availability.available_quantity, 0)
            ELSE COALESCE(p.stock_quantity, 0)
          END AS available_orders,
          CASE
            WHEN p.store_type = 'RESTAURANT' THEN COALESCE(availability.available_quantity, 0)
            ELSE COALESCE(p.stock_quantity, 0)
          END AS "availableOrders"
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN LATERAL (
          SELECT
            recipe.modifiers,
            recipe.servings,
            recipe."prepTimeMinutes",
            recipe.instructions,
            recipe."imageUrl"
          FROM "Recipe" recipe
          WHERE COALESCE(recipe."isActive", TRUE) = TRUE
            AND ($3::text IS NULL OR recipe."businessId"::text = $3::text)
            AND (
              recipe."menuItemId" = p.inventory_item_id
              OR lower(trim(COALESCE(recipe.name, ''))) = lower(trim(COALESCE(p.name, '')))
            )
          ORDER BY
            CASE WHEN recipe."menuItemId" = p.inventory_item_id THEN 0 ELSE 1 END,
            recipe."updatedAt" DESC NULLS LAST
          LIMIT 1
        ) r ON TRUE
        LEFT JOIN "InventoryItem" menu_item
          ON menu_item.id = p.inventory_item_id
        LEFT JOIN LATERAL (
          SELECT MIN(FLOOR(
            CASE
              WHEN inv."expiryDate" IS NOT NULL AND inv."expiryDate"::date < CURRENT_DATE THEN 0
              ELSE ii.quantity_available
            END / NULLIF(pi.quantity_required, 0)
          )) AS available_quantity
          FROM product_ingredients pi
          JOIN ingredients_inventory ii ON ii.id = pi.ingredient_id
          LEFT JOIN "InventoryItem" inv ON inv.id = ii.inventory_item_id
          WHERE pi.product_id = p.id
            AND pi.is_required = TRUE
            AND COALESCE(ii.is_available, TRUE) = TRUE
        ) availability ON TRUE
        WHERE p.store_id = $1
          AND p.store_type = $2
          AND p.inventory_item_id IS NOT NULL
          AND COALESCE(p.is_available, TRUE) = TRUE
        ORDER BY p.name ASC
      `,
        [user.store_id, user.store_type, restaurantBusinessId],
      );

    const ingredientRows = user.store_type === 'RESTAURANT'
      ? await this.query<any>(
          `
            SELECT
              pi.id,
              pi.product_id,
              pi.ingredient_id,
              ii.inventory_item_id,
              COALESCE(ii.ingredient_name, pi.ingredient_name) AS name,
              pi.quantity_required AS quantity,
              pi.unit,
              pi.additional_cost,
              pi.is_required,
              pi.is_removable,
              CASE
                WHEN inv."expiryDate" IS NOT NULL AND inv."expiryDate"::date < CURRENT_DATE THEN 0
                ELSE ii.quantity_available
              END AS quantity_available,
              COALESCE(ii.is_available, TRUE) AS is_available
            FROM product_ingredients pi
            LEFT JOIN ingredients_inventory ii ON ii.id = pi.ingredient_id
            LEFT JOIN "InventoryItem" inv ON inv.id = ii.inventory_item_id
            WHERE pi.store_id = $1
            ORDER BY pi.id ASC
          `,
          [user.store_id],
        )
      : [];

    const alternatives = user.store_type === 'RESTAURANT'
      ? await this.query<any>(
          `
            SELECT
              ia.*,
              ii.ingredient_name,
              ii.quantity_available,
              ii.unit
            FROM ingredient_alternatives ia
            JOIN ingredients_inventory ii ON ii.id = ia.alternative_ingredient_id
            WHERE ia.store_id = $1
              AND COALESCE(ia.is_available, TRUE) = TRUE
              AND COALESCE(ii.is_available, TRUE) = TRUE
              AND ii.quantity_available > 0
            ORDER BY ii.ingredient_name ASC
          `,
          [user.store_id],
        )
      : [];

    const alternativesByParent = new Map<number, any[]>();
    for (const alternative of alternatives) {
      const list = alternativesByParent.get(Number(alternative.parent_ingredient_id)) ?? [];
      list.push(alternative);
      alternativesByParent.set(Number(alternative.parent_ingredient_id), list);
    }

    const ingredientsByProduct = new Map<number, any[]>();
    for (const ingredient of ingredientRows) {
      const list = ingredientsByProduct.get(Number(ingredient.product_id)) ?? [];
      list.push({
        ...ingredient,
        alternatives: alternativesByParent.get(Number(ingredient.ingredient_id)) ?? [],
      });
      ingredientsByProduct.set(Number(ingredient.product_id), list);
    }

    const modifiersByProduct = await this.withModifierStock(user.store_id, products.map((product) => product.modifiers));

    return products.map((product, index) => ({
      ...product,
      available_orders: product.available_orders ?? product.available_quantity,
      availableOrders: product.availableOrders ?? product.available_quantity,
      modifiers: modifiersByProduct[index],
      ingredients: ingredientsByProduct.get(Number(product.id)) ?? [],
    }));
  }

  async getPosProductRecipe(input: { userId: number; productId: number }) {
    const user = await this.getUserStoreScope(input.userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }

    if (user.store_type === 'RESTAURANT') {
      await this.syncRestaurantRecipesIntoPosCatalog(user);
    }

    const restaurantBusinessId =
      user.store_type === 'RESTAURANT'
        ? await this.resolveInventoryBusinessIdForStoreScope(user)
        : null;

    const rows = await this.query<any>(
      `
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          p.store_id,
          p.store_type,
          COALESCE(r.modifiers, '[]'::jsonb) AS modifiers,
          r.servings,
          r."prepTimeMinutes" AS prep_time_minutes,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pi.id,
                'ingredient_id', pi.ingredient_id,
                'name', COALESCE(ii.ingredient_name, pi.ingredient_name),
                'quantity', pi.quantity_required,
                'unit', pi.unit,
                'additional_cost', pi.additional_cost,
                'is_required', pi.is_required,
                'is_removable', pi.is_removable,
                'quantity_available',
                  CASE
                    WHEN inv."expiryDate" IS NOT NULL AND inv."expiryDate"::date < CURRENT_DATE THEN 0
                    ELSE ii.quantity_available
                  END,
                'is_available', COALESCE(ii.is_available, TRUE),
                'stock_status',
                  CASE
                    WHEN ii.id IS NULL THEN 'missing'
                    WHEN inv."expiryDate" IS NOT NULL AND inv."expiryDate"::date < CURRENT_DATE THEN 'expired'
                    WHEN COALESCE(ii.is_available, TRUE) = FALSE THEN 'unavailable'
                    WHEN ii.quantity_available < pi.quantity_required THEN 'insufficient'
                    WHEN ii.quantity_available <= COALESCE(ii.low_stock_limit, 0) THEN 'low'
                    ELSE 'available'
                  END
              )
              ORDER BY pi.id ASC
            ) FILTER (WHERE pi.id IS NOT NULL),
            '[]'::json
          ) AS ingredients
        FROM products p
        LEFT JOIN LATERAL (
          SELECT
            recipe.modifiers,
            recipe.servings,
            recipe."prepTimeMinutes"
          FROM "Recipe" recipe
          WHERE COALESCE(recipe."isActive", TRUE) = TRUE
            AND ($3::text IS NULL OR recipe."businessId"::text = $3::text)
            AND (
              recipe."menuItemId" = p.inventory_item_id
              OR lower(trim(COALESCE(recipe.name, ''))) = lower(trim(COALESCE(p.name, '')))
            )
          ORDER BY
            CASE WHEN recipe."menuItemId" = p.inventory_item_id THEN 0 ELSE 1 END,
            recipe."updatedAt" DESC NULLS LAST
          LIMIT 1
        ) r ON TRUE
        LEFT JOIN product_ingredients pi
          ON pi.product_id = p.id
         AND pi.store_id = p.store_id
        LEFT JOIN ingredients_inventory ii
          ON ii.id = pi.ingredient_id
         AND ii.store_id = p.store_id
        LEFT JOIN "InventoryItem" inv ON inv.id = ii.inventory_item_id
        WHERE p.id = $1
          AND p.store_id = $2
        GROUP BY p.id, p.name, p.store_id, p.store_type, r.modifiers, r.servings, r."prepTimeMinutes"
        LIMIT 1
      `,
      [input.productId, user.store_id, restaurantBusinessId],
    );

    if (!rows[0]) {
      throw new NotFoundException('Product was not found for this store.');
    }

    if (user.store_type === 'RESTAURANT') {
      const recipeRows = await this.query<any>(
        `
          SELECT
            pi.id,
            pi.product_id,
            pi.ingredient_id,
            ii.inventory_item_id,
            COALESCE(ii.ingredient_name, pi.ingredient_name) AS name,
            pi.quantity_required AS quantity,
            pi.unit,
            pi.additional_cost,
            pi.is_required,
            pi.is_removable,
            CASE
              WHEN inv."expiryDate" IS NOT NULL AND inv."expiryDate"::date < CURRENT_DATE THEN 0
              ELSE ii.quantity_available
            END AS quantity_available,
            COALESCE(ii.is_available, TRUE) AS is_available
          FROM product_ingredients pi
          LEFT JOIN ingredients_inventory ii
            ON ii.id = pi.ingredient_id
           AND ii.store_id = pi.store_id
          LEFT JOIN "InventoryItem" inv ON inv.id = ii.inventory_item_id
          WHERE pi.product_id = $1
            AND pi.store_id = $2
          ORDER BY pi.id ASC
        `,
        [input.productId, user.store_id],
      );

      rows[0].ingredients = recipeRows;
    }

    rows[0].modifiers = (await this.withModifierStock(user.store_id, [rows[0].modifiers]))[0];

    return rows[0];
  }

  private async withModifierStock(storeId: number, modifierGroups: any[][]) {
    const itemIds = Array.from(new Set(
      modifierGroups.flatMap((modifiers) =>
        (Array.isArray(modifiers) ? modifiers : [])
          .map((modifier) => modifier?.itemId)
          .filter(Boolean),
      ),
    ));
    if (itemIds.length === 0) return modifierGroups.map((modifiers) => Array.isArray(modifiers) ? modifiers : []);

    const rows = await this.query<any>(
      `
        SELECT ii.id AS ingredient_id, ii.inventory_item_id, ii.ingredient_name, ii.quantity_available, ii.unit,
               COALESCE(ii.is_available, TRUE) AS is_available,
               COALESCE(inv.price, 0) AS weighted_average_cost
        FROM ingredients_inventory ii
        LEFT JOIN "InventoryItem" inv ON inv.id = ii.inventory_item_id
        WHERE ii.store_id = $1
          AND ii.inventory_item_id = ANY($2::text[])
      `,
      [storeId, itemIds],
    );
    const stockByItemId = new Map(rows.map((row) => [String(row.inventory_item_id), row]));

    return modifierGroups.map((modifiers) =>
      (Array.isArray(modifiers) ? modifiers : []).map((modifier) => {
        const stock = stockByItemId.get(String(modifier?.itemId ?? ''));
        const available = Boolean(stock?.is_available) && Number(stock?.quantity_available ?? 0) > 0;
        const weightedPortionPrice = Math.round((
          Number(stock?.weighted_average_cost ?? 0) * Number(modifier?.quantity ?? 0) + Number.EPSILON
        ) * 100) / 100;
        return {
          ...modifier,
          itemName: modifier.itemName ?? stock?.ingredient_name,
          ingredientId: stock?.ingredient_id ? Number(stock.ingredient_id) : modifier.ingredientId,
          quantityAvailable: stock ? Number(stock.quantity_available ?? 0) : null,
          unit: stock?.unit ?? modifier.unit,
          suggestedPrice: modifier?.type === 'add_on' && stock ? weightedPortionPrice : undefined,
          priceDelta: modifier?.type === 'add_on' || modifier?.type === 'size_variant' ? Number(modifier?.priceDelta ?? 0) : 0,
          stockStatus: modifier.itemId || modifier.requiresStock ? (available ? 'available' : 'unavailable') : 'untracked',
        };
      }),
    );
  }

  async listPosIngredients(userId: number) {
    const user = await this.getUserStoreScope(userId);

    if (!user.store_id || user.store_type !== 'RESTAURANT') {
      return [];
    }

    return this.query(
      `
        SELECT
          ii.id,
          ii.inventory_item_id,
          ii.ingredient_name AS name,
          CASE
            WHEN inv."expiryDate" IS NOT NULL AND inv."expiryDate"::date < CURRENT_DATE THEN 0
            ELSE ii.quantity_available
          END AS quantity_available,
          ii.unit,
          ii.cost_per_unit,
          ii.is_available
        FROM ingredients_inventory ii
        LEFT JOIN "InventoryItem" inv ON inv.id = ii.inventory_item_id
        WHERE ii.store_id = $1
          AND COALESCE(ii.is_available, TRUE) = TRUE
          AND (
            CASE
              WHEN inv."expiryDate" IS NOT NULL AND inv."expiryDate"::date < CURRENT_DATE THEN 0
              ELSE ii.quantity_available
            END
          ) > 0
        ORDER BY ii.ingredient_name ASC
      `,
      [user.store_id],
    );
  }

  private tableStatus(isShared: boolean, totalSeats: number, occupiedSeats: number) {
    if (occupiedSeats <= 0) return 'AVAILABLE';
    if (isShared && occupiedSeats < totalSeats) return 'PARTIALLY_OCCUPIED';
    return 'OCCUPIED';
  }

  private async ensureDiningTableSchema(client?: PoolClient) {
    const run = client ? this.queryWithClient.bind(this, client) : this.query.bind(this);
    await run(`
      DO $$
      BEGIN
        CREATE TYPE "DiningTableStatus" AS ENUM ('AVAILABLE', 'PARTIALLY_OCCUPIED', 'OCCUPIED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await run(`ALTER TYPE "DiningTableStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_OCCUPIED'`);
    await run(`
      CREATE TABLE IF NOT EXISTS "DiningTable" (
        id TEXT PRIMARY KEY,
        "tableNumber" TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 1,
        status "DiningTableStatus" NOT NULL DEFAULT 'AVAILABLE',
        floor TEXT,
        notes TEXT,
        "locationId" TEXT NOT NULL REFERENCES "Location"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        "businessId" TEXT NOT NULL REFERENCES "Business"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run(`ALTER TABLE "DiningTable" ADD COLUMN IF NOT EXISTS "occupiedSeats" INTEGER NOT NULL DEFAULT 0`);
    await run(`ALTER TABLE "DiningTable" ADD COLUMN IF NOT EXISTS "isShared" BOOLEAN NOT NULL DEFAULT false`);
    await run(`UPDATE "DiningTable" SET status = 'AVAILABLE' WHERE status::text IN ('RESERVED', 'CLEANING')`);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS "DiningTable_businessId_locationId_tableNumber_key" ON "DiningTable"("businessId", "locationId", "tableNumber")`);
    await run(`CREATE INDEX IF NOT EXISTS "DiningTable_businessId_status_idx" ON "DiningTable"("businessId", status)`);
    await run(`CREATE INDEX IF NOT EXISTS "DiningTable_locationId_idx" ON "DiningTable"("locationId")`);
  }

  private async getDiningScope(user: AuthenticatedUser, client?: PoolClient) {
    const businessId = await this.resolveInventoryBusinessIdForStoreScope(user, client);
    if (!businessId) {
      throw new InternalServerErrorException('Store is not linked to a restaurant business.');
    }

    const locations = client
      ? await this.queryWithClient<{ id: string }>(
          client,
          `SELECT id FROM "Location" WHERE "businessId" = $1 ORDER BY "createdAt" ASC LIMIT 1`,
          [businessId],
        )
      : await this.query<{ id: string }>(
          `SELECT id FROM "Location" WHERE "businessId" = $1 ORDER BY "createdAt" ASC LIMIT 1`,
          [businessId],
        );

    if (locations[0]) return { businessId, locationId: locations[0].id };

    const createSql = `
      INSERT INTO "Location" (id, name, address, manager, phone, "businessId", "createdAt", "updatedAt")
      VALUES ($1, 'Dining Area', '', '', '', $2, NOW(), NOW())
      RETURNING id
    `;
    const created = client
      ? await this.queryWithClient<{ id: string }>(client, createSql, [randomUUID(), businessId])
      : await this.query<{ id: string }>(createSql, [randomUUID(), businessId]);
    return { businessId, locationId: created[0].id };
  }

  private mapDiningTable(row: any) {
    const totalSeats = Number(row.capacity ?? 0);
    const occupiedSeats = Math.max(0, Math.min(totalSeats, Number(row.occupiedSeats ?? 0)));
    const isShared = Boolean(row.isShared);
    return {
      id: row.id,
      store_id: row.businessId,
      table_name: row.tableNumber,
      table_number: row.tableNumber,
      total_seats: totalSeats,
      occupied_seats: occupiedSeats,
      available_seats: Math.max(0, totalSeats - occupiedSeats),
      is_shared: isShared,
      status: this.tableStatus(isShared, totalSeats, occupiedSeats),
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  async listDiningTables(userId: number) {
    await this.ensureDiningTableSchema();
    const user = await this.getUserStoreScope(userId);
    const scope = await this.getDiningScope(user);
    const rows = await this.query<any>(
      `
        SELECT *
        FROM "DiningTable"
        WHERE "businessId" = $1 AND "locationId" = $2
        ORDER BY "tableNumber" ASC
      `,
      [scope.businessId, scope.locationId],
    );
    return rows.map((row) => this.mapDiningTable(row));
  }

  async createDiningTable(input: { userId: number; tableNumber: string; totalSeats: number; isShared: boolean }) {
    await this.ensureDiningTableSchema();
    const user = await this.getUserStoreScope(input.userId);
    const scope = await this.getDiningScope(user);
    const totalSeats = Math.max(1, Math.floor(Number(input.totalSeats) || 1));
    const rows = await this.query<any>(
      `
        INSERT INTO "DiningTable" (
          id, "tableNumber", capacity, "occupiedSeats", "isShared", status, "locationId", "businessId", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, 0, $4, 'AVAILABLE', $5, $6, NOW(), NOW())
        RETURNING *
      `,
      [randomUUID(), input.tableNumber.trim(), totalSeats, input.isShared, scope.locationId, scope.businessId],
    );
    const table = this.mapDiningTable(rows[0]);
    await this.recordActivity({
      userId: user.id,
      storeId: user.store_id,
      userName: user.full_name,
      userRole: user.role,
      module: 'Restaurant Table Management',
      action: 'Table Created',
      details: `Created Table ${table.table_number}\nSeats: ${table.total_seats}`,
    });
    return table;
  }

  async updateDiningTable(input: { userId: number; tableId: string; tableNumber: string; totalSeats: number; isShared: boolean }) {
    await this.ensureDiningTableSchema();
    const user = await this.getUserStoreScope(input.userId);
    const scope = await this.getDiningScope(user);
    const totalSeats = Math.max(1, Math.floor(Number(input.totalSeats) || 1));
    const currentRows = await this.query<any>(
      `SELECT * FROM "DiningTable" WHERE id = $1 AND "businessId" = $2 AND "locationId" = $3 LIMIT 1`,
      [input.tableId, scope.businessId, scope.locationId],
    );
    if (!currentRows[0]) throw new NotFoundException('Table not found.');

    const occupiedSeats = Math.min(Number(currentRows[0].occupiedSeats ?? 0), totalSeats);
    const status = this.tableStatus(input.isShared, totalSeats, occupiedSeats);
    const rows = await this.query<any>(
      `
        UPDATE "DiningTable"
        SET "tableNumber" = $1, capacity = $2, "occupiedSeats" = $3, "isShared" = $4, status = $5::"DiningTableStatus", "updatedAt" = NOW()
        WHERE id = $6 AND "businessId" = $7 AND "locationId" = $8
        RETURNING *
      `,
      [input.tableNumber.trim(), totalSeats, occupiedSeats, input.isShared, status, input.tableId, scope.businessId, scope.locationId],
    );
    const table = this.mapDiningTable(rows[0]);
    await this.recordActivity({
      userId: user.id,
      storeId: user.store_id,
      userName: user.full_name,
      userRole: user.role,
      module: 'Restaurant Table Management',
      action: 'Table Settings Updated',
      details: `Updated Table ${table.table_number}\nSeats: ${table.total_seats}`,
    });
    return table;
  }

  async deleteDiningTable(input: { userId: number; tableId: string }) {
    await this.ensureDiningTableSchema();
    const user = await this.getUserStoreScope(input.userId);
    const scope = await this.getDiningScope(user);
    return this.withTransaction(async (client) => {
      const tableRows = await this.queryWithClient<any>(
        client,
        `SELECT id FROM "DiningTable" WHERE id = $1 AND "businessId" = $2 AND "locationId" = $3 LIMIT 1`,
        [input.tableId, scope.businessId, scope.locationId],
      );
      if (!tableRows[0]) throw new NotFoundException('Table not found.');

      await this.queryWithClient(client, `UPDATE "KitchenOrder" SET "tableId" = NULL WHERE "tableId" = $1`, [input.tableId]);
      await this.queryWithClient(client, `DELETE FROM "DiningTable" WHERE id = $1`, [input.tableId]);
      await this.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Restaurant Table Management',
        action: 'Table Deleted',
        details: `Deleted table\nTable ID: ${input.tableId}`,
      });
      return { ok: true };
    });
  }

  async setDiningTableOccupancy(input: { userId: number; tableId: string; occupiedSeats: number }) {
    await this.ensureDiningTableSchema();
    const user = await this.getUserStoreScope(input.userId);
    const scope = await this.getDiningScope(user);
    return this.withTransaction(async (client) => {
      const currentRows = await this.queryWithClient<any>(
        client,
        `SELECT * FROM "DiningTable" WHERE id = $1 AND "businessId" = $2 AND "locationId" = $3 FOR UPDATE`,
        [input.tableId, scope.businessId, scope.locationId],
      );
      const table = currentRows[0];
      if (!table) throw new NotFoundException('Table not found.');

      const totalSeats = Number(table.capacity ?? 0);
      const isShared = Boolean(table.isShared);
      const previousOccupiedSeats = Math.max(0, Number(table.occupiedSeats ?? 0));
      const occupiedSeats = Math.max(0, Math.min(totalSeats, Math.floor(Number(input.occupiedSeats) || 0)));

      if (occupiedSeats < previousOccupiedSeats) {
        const tableLabel = `Table ${table.tableNumber}`;
        const unpaidRows = await this.queryWithClient<{ id: number }>(
          client,
          `
            SELECT o.id
            FROM orders o
            WHERE o.store_id = $1
              AND COALESCE(o.order_status, '') <> 'COMPLETED'
              AND COALESCE(UPPER(o.payment_status), '') IN ('NOT_PAID', 'UNPAID', 'PENDING')
              AND o.table_name IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM regexp_split_to_table(o.table_name, '\\s*\\+\\s*') AS table_label
                WHERE LOWER(TRIM(table_label)) = LOWER($2)
              )
            LIMIT 1
          `,
          [user.store_id, tableLabel],
        );

        if (unpaidRows[0]) {
          throw new BadRequestException('Cannot release a table with an unpaid or pending Pay Later order.');
        }
      }

      const status = this.tableStatus(isShared, totalSeats, occupiedSeats);
      const rows = await this.queryWithClient<any>(
        client,
        `
          UPDATE "DiningTable"
          SET "occupiedSeats" = $1, status = $2::"DiningTableStatus", "updatedAt" = NOW()
          WHERE id = $3 AND "businessId" = $4 AND "locationId" = $5
          RETURNING *
        `,
        [occupiedSeats, status, input.tableId, scope.businessId, scope.locationId],
      );
      if (status === 'AVAILABLE') {
        await this.stopRunningTimersForReleasedTable(client, user.store_id!, `Table ${table.tableNumber}`);
      }
      await this.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Restaurant Table Management',
        action: occupiedSeats > 0 ? 'Table Occupied' : 'Table Released',
        details: occupiedSeats > 0
          ? `Table ${table.tableNumber} occupied\nSeats: ${occupiedSeats}`
          : `Table ${table.tableNumber} released`,
      });
      return this.mapDiningTable(rows[0]);
    });
  }

  private tableNumberFromName(tableName: string | null | undefined) {
    return String(tableName ?? '').match(/Table\s+([^+]+)/i)?.[1]?.trim() ?? null;
  }

  private async occupyDiningTable(client: PoolClient, user: AuthenticatedUser, tableName: string | null | undefined, partySize: number) {
    const tableNumber = this.tableNumberFromName(tableName);
    if (!tableNumber || partySize <= 0) return;
    const scope = await this.getDiningScope(user, client);
    const rows = await this.queryWithClient<any>(
      client,
      `SELECT * FROM "DiningTable" WHERE "businessId" = $1 AND "locationId" = $2 AND "tableNumber" = $3 FOR UPDATE`,
      [scope.businessId, scope.locationId, tableNumber],
    );
    const table = rows[0];
    if (!table) throw new NotFoundException('Selected table was not found.');

    const totalSeats = Number(table.capacity ?? 0);
    const occupiedSeats = Number(table.occupiedSeats ?? 0);
    const isShared = Boolean(table.isShared);
    if ((!isShared && table.status !== 'AVAILABLE') || (isShared && totalSeats - occupiedSeats < partySize)) {
      throw new BadRequestException('Selected table no longer has enough available seats.');
    }

    const nextOccupied = isShared ? occupiedSeats + partySize : partySize;
    const status = this.tableStatus(isShared, totalSeats, nextOccupied);
    await this.queryWithClient(
      client,
      `UPDATE "DiningTable" SET "occupiedSeats" = $1, status = $2::"DiningTableStatus", "updatedAt" = NOW() WHERE id = $3`,
      [nextOccupied, status, table.id],
    );
  }

  private async releaseDiningTable(client: PoolClient, user: AuthenticatedUser, tableName: string | null | undefined, partySize: number) {
    const tableNumber = this.tableNumberFromName(tableName);
    if (!tableNumber) return;
    const scope = await this.getDiningScope(user, client);
    const rows = await this.queryWithClient<any>(
      client,
      `SELECT * FROM "DiningTable" WHERE "businessId" = $1 AND "locationId" = $2 AND "tableNumber" = $3 FOR UPDATE`,
      [scope.businessId, scope.locationId, tableNumber],
    );
    const table = rows[0];
    if (!table) return;

    const totalSeats = Number(table.capacity ?? 0);
    const isShared = Boolean(table.isShared);
    const nextOccupied = isShared ? Math.max(0, Number(table.occupiedSeats ?? 0) - Math.max(1, partySize)) : 0;
    const status = this.tableStatus(isShared, totalSeats, nextOccupied);
    await this.queryWithClient(
      client,
      `UPDATE "DiningTable" SET "occupiedSeats" = $1, status = $2::"DiningTableStatus", "updatedAt" = NOW() WHERE id = $3`,
      [nextOccupied, status, table.id],
    );
    if (status === 'AVAILABLE') {
      await this.stopRunningTimersForReleasedTable(client, user.store_id!, `Table ${table.tableNumber}`);
    }
  }

  /** Finalizes active paid dine-in timers when their table is released. */
  private async stopRunningTimersForReleasedTable(client: PoolClient, storeId: number, tableLabel: string) {
    await this.queryWithClient(
      client,
      `
        UPDATE orders
        SET running_time_end = NOW(),
            running_duration = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
              NOW() - COALESCE(
                CASE WHEN ordered_at <= NOW() THEN ordered_at END,
                CASE WHEN running_time_start <= NOW() THEN running_time_start END,
                CASE WHEN preparing_started_at <= NOW() THEN preparing_started_at END,
                created_at,
                NOW()
              )
            )))::BIGINT),
            table_ended_at = COALESCE(table_ended_at, NOW()),
            completed_at = COALESCE(completed_at, NOW()),
            order_status = CASE WHEN order_status IN ('PENDING', 'PREPARING', 'READY', 'SERVED') THEN 'COMPLETED' ELSE order_status END,
            is_running = FALSE
        WHERE store_id = $1
          AND order_type IN ('DINE_IN', 'MIXED')
          AND UPPER(COALESCE(payment_status, '')) = 'PAID'
          AND COALESCE(is_running, FALSE) = TRUE
          AND COALESCE(ordered_at, running_time_start) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM regexp_split_to_table(COALESCE(table_name, ''), '\\s*\\+\\s*') AS table_name_part
            WHERE LOWER(TRIM(table_name_part)) = LOWER($2)
          )
      `,
      [storeId, tableLabel],
    );
  }

  /** Idempotently freezes a timer. Durations are persisted as elapsed seconds. */
  private async stopOrderRunningTimer(client: PoolClient, orderId: number) {
    await this.queryWithClient(
      client,
      `
        UPDATE orders
        SET running_time_end = NOW(),
            running_duration = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
              NOW() - COALESCE(
                CASE WHEN ordered_at <= NOW() THEN ordered_at END,
                CASE WHEN running_time_start <= NOW() THEN running_time_start END,
                CASE WHEN preparing_started_at <= NOW() THEN preparing_started_at END,
                created_at,
                NOW()
              )
            )))::BIGINT),
            is_running = FALSE
        WHERE id = $1
          AND COALESCE(is_running, FALSE) = TRUE
          AND COALESCE(ordered_at, running_time_start) IS NOT NULL
      `,
      [orderId],
    );
  }

  /**
   * Handles orders created before the timer feature and table changes made in
   * a different restaurant screen. A timer can never remain active after its
   * terminal order state, or after a paid dine-in table is already available.
   */
  private async reconcileRestaurantRunningTimers(user: AuthenticatedUser) {
    if (!user.store_id || user.store_type !== 'RESTAURANT') return;

    await this.ensureDiningTableSchema();
    const scope = await this.getDiningScope(user);
    await this.query(
      `
        UPDATE orders o
        SET running_time_end = NOW(),
            running_duration = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
              NOW() - COALESCE(
                CASE WHEN o.ordered_at <= NOW() THEN o.ordered_at END,
                CASE WHEN o.running_time_start <= NOW() THEN o.running_time_start END,
                CASE WHEN o.preparing_started_at <= NOW() THEN o.preparing_started_at END,
                o.created_at,
                NOW()
              )
            )))::BIGINT),
            table_ended_at = CASE WHEN o.order_type IN ('DINE_IN', 'MIXED') THEN COALESCE(o.table_ended_at, NOW()) ELSE o.table_ended_at END,
            completed_at = CASE WHEN o.order_type IN ('DINE_IN', 'MIXED') THEN COALESCE(o.completed_at, NOW()) ELSE o.completed_at END,
            order_status = CASE
              WHEN o.order_type IN ('DINE_IN', 'MIXED') AND o.order_status IN ('PENDING', 'PREPARING', 'READY', 'SERVED') THEN 'COMPLETED'
              ELSE o.order_status
            END,
            is_running = FALSE
        WHERE o.store_id = $1
          AND o.order_type <> 'RETAIL'
          AND COALESCE(o.is_running, FALSE) = TRUE
          AND COALESCE(o.ordered_at, o.running_time_start) IS NOT NULL
          AND (
            -- Takeout has no table stay: serving or completion ends it.
            (o.order_type = 'TAKEOUT' AND o.order_status IN ('SERVED', 'COMPLETED', 'CANCELLED'))
            -- Cancellation is final. A completed dine-in order can still be
            -- an active customer stay until payment/table release closes it.
            OR (o.order_type IN ('DINE_IN', 'MIXED') AND o.order_status = 'CANCELLED')
            -- Pay Now remains active only while its assigned table is occupied.
            OR (
              o.order_type IN ('DINE_IN', 'MIXED')
              AND UPPER(COALESCE(o.payment_status, '')) = 'PAID'
              AND EXISTS (
                SELECT 1
                FROM "DiningTable" table_row
                WHERE table_row."businessId" = $2
                  AND table_row."locationId" = $3
                  AND table_row.status = 'AVAILABLE'::"DiningTableStatus"
                  AND EXISTS (
                    SELECT 1
                    FROM regexp_split_to_table(COALESCE(o.table_name, ''), '\\s*\\+\\s*') AS table_name_part
                    WHERE LOWER(TRIM(table_name_part)) = LOWER('Table ' || table_row."tableNumber")
                  )
              )
            )
          )
      `,
      [user.store_id, scope.businessId, scope.locationId],
    );
  }

  async createPaidPosOrder(input: any) {
    await this.ensurePosOrderSchema();
    if (input.tableName && !String(input.tableName).toLowerCase().startsWith('queue')) {
      await this.ensureDiningTableSchema();
    }
    const user = await this.getUserStoreScope(input.userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }
    if (this.isInventoryManagerRole(user.role) || this.isKitchenRole(user.role)) {
      throw new ForbiddenException('This account cannot create POS orders or process payments.');
    }

    try {
      const savedOrder = await this.withTransaction(async (client) => {
        const isPaid = Boolean(input.payment);
        const orderType = input.orderType ?? (user.store_type === 'RETAIL_STORE' ? 'RETAIL' : 'TAKEOUT');
        const hasDiningTable = Boolean(input.tableName && !String(input.tableName).toLowerCase().startsWith('queue'));
        const isDineInOrder = ['DINE_IN', 'MIXED'].includes(orderType);
        const isRestaurantOrder = user.store_type === 'RESTAURANT' && orderType !== 'RETAIL';
        // A pay-now dine-in order remains active while the table/stay lifecycle is open.
        const isPaidDineIn = isPaid && ['DINE_IN', 'MIXED'].includes(orderType) && hasDiningTable;
        const orderStatus = input.orderStatus ?? (isRestaurantOrder ? 'PENDING' : (isPaid && !isPaidDineIn ? 'COMPLETED' : 'PENDING'));
        const paymentStatus = input.paymentStatus ?? (isPaid ? 'PAID' : 'NOT_PAID');
        const confirmedAt = new Date();
        const estimatedPrepMinutes = Number(input.estimatedPrepMinutes ?? input.estimated_prep_minutes);
        const estimatedReadyAt = Number.isFinite(estimatedPrepMinutes) && estimatedPrepMinutes > 0
          ? new Date(confirmedAt.getTime() + estimatedPrepMinutes * 60000)
          : null;
        const shouldStartPreparationAtConfirmation = isRestaurantOrder;
        const shouldStartStayAtConfirmation = isRestaurantOrder && isDineInOrder;
        const runningTimeStart = isRestaurantOrder ? confirmedAt : null;
        const stopsOnConfirmation =
          (orderType === 'TAKEOUT' && ['SERVED', 'COMPLETED'].includes(orderStatus)) ||
          (['DINE_IN', 'MIXED'].includes(orderType) && orderStatus === 'COMPLETED');
        const runningTimeEnd = isRestaurantOrder && stopsOnConfirmation ? runningTimeStart : null;
        const orderNumber = await this.createUniqueOrderNumber(client, input.orderNumber);
        const partySize = Number(input.partySize ?? input.party_size ?? input.requiredSeats ?? 0);
        const orderRows = await this.queryWithClient<{ id: number }>(
          client,
          `
            INSERT INTO orders (
              store_id, cashier_id, order_number, customer_name, order_type, table_name,
              party_size, subtotal, discount_amount, discount_type, tax_amount, service_charge,
              total_amount, order_status, payment_status, ordered_at, payment_at, completed_at,
              table_started_at, preparing_started_at, ready_at, service_started_at, served_at, service_duration,
              running_time_start, running_time_end, running_duration, is_running, estimated_prep_minutes, estimated_ready_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
            RETURNING id
          `,
          [
            user.store_id,
            user.id,
            orderNumber,
            input.customerName ?? null,
            orderType,
            input.tableName ?? null,
            Number.isFinite(partySize) && partySize > 0 ? partySize : null,
            input.subtotal ?? 0,
            input.discount ?? 0,
            input.discountType ?? null,
            input.tax ?? 0,
            input.serviceFee ?? 0,
            input.total ?? 0,
            orderStatus,
            paymentStatus,
            isRestaurantOrder ? confirmedAt : null,
            isPaid ? confirmedAt : null,
            // A dine-in Pay Now order is paid at confirmation but is not
            // completed while its table remains occupied. Its completion time
            // (and running timer end) are set only when that table is released.
            orderStatus === 'COMPLETED' ? confirmedAt : null,
            shouldStartStayAtConfirmation ? confirmedAt : null,
            shouldStartPreparationAtConfirmation ? confirmedAt : null,
            ['READY', 'SERVED', 'COMPLETED'].includes(orderStatus) ? confirmedAt : null,
            shouldStartPreparationAtConfirmation ? confirmedAt : null,
            orderStatus === 'SERVED' ? confirmedAt : null,
            stopsOnConfirmation ? 0 : null,
            runningTimeStart,
            runningTimeEnd,
            runningTimeEnd ? 0 : null,
            Boolean(isRestaurantOrder && !stopsOnConfirmation),
            Number.isFinite(estimatedPrepMinutes) ? estimatedPrepMinutes : null,
            estimatedReadyAt,
          ],
        );
        const orderId = orderRows[0].id;
        const inventorySaleMovements: PosSaleMovement[] = [];
        const inventorySyncSettings = await this.getInventorySyncSettingsForStore(client, user.store_id!);

      for (const item of input.items ?? []) {
        if (isRestaurantOrder) {
          await this.validateRestaurantModifiers(client, user.store_id!, item);
        }
        const itemRows = await this.queryWithClient<{ id: number }>(
          client,
          `
            INSERT INTO order_items (
              order_id, product_id, variant_id, product_name, category_name, size, color,
              quantity, unit_price, line_total, item_type, notes, prep_time_minutes, customization_prep_minutes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
          `,
          [
            orderId,
            item.productId ?? item.id ?? null,
            item.variantId ?? item.variant_id ?? null,
            item.name,
            item.categoryName ?? item.category ?? null,
            item.size ?? null,
            item.color ?? null,
            item.quantity ?? 1,
            item.price ?? 0,
            item.lineTotal ?? ((item.price ?? 0) * (item.quantity ?? 1)),
            item.orderType ?? null,
            item.notes ?? null,
            Number.isFinite(Number(item.prepTimeMinutes ?? item.prep_time_minutes)) ? Number(item.prepTimeMinutes ?? item.prep_time_minutes) : null,
            Number.isFinite(Number(item.customizationPrepMinutes ?? item.customization_prep_minutes)) ? Number(item.customizationPrepMinutes ?? item.customization_prep_minutes) : 0,
          ],
        );
        const orderItemId = itemRows[0].id;

        if (inventorySyncSettings.autoDeductInventoryOnSale) {
          if (user.store_type === 'RETAIL_STORE') {
            await this.deductRetailProduct(client, user.store_id!, orderId, orderItemId, item, item.productId ?? item.id, item.variantId ?? item.variant_id, item.quantity ?? 1, inventorySaleMovements, inventorySyncSettings);
          } else {
            await this.deductRestaurantIngredients(client, user.store_id!, orderId, orderItemId, item, inventorySaleMovements, inventorySyncSettings);
          }
        } else if (user.store_type === 'RESTAURANT') {
          await this.recordRestaurantIngredientCustomizations(client, user.store_id!, orderItemId, item);
        }
      }

      if (inventorySyncSettings.autoDeductInventoryOnSale) {
        await this.writeInventorySaleRecords(client, { user, orderNumber, input, movements: inventorySaleMovements });
      }

      if (input.payment) {
        const paymentNumber = await this.createUniquePaymentNumber(client, `PAY-${orderNumber}`);

        await this.queryWithClient(
          client,
          `
            INSERT INTO payments (
              store_id, order_id, processed_by, payment_number, payment_method,
              amount_due, amount_paid, change_amount, payment_status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PAID')
          `,
          [
            user.store_id,
            orderId,
            user.id,
            paymentNumber,
            input.payment.method ?? 'Cash',
            input.total ?? 0,
            input.payment.amountPaid ?? input.total ?? 0,
            input.payment.changeAmount ?? 0,
          ],
        );
      }

      if (input.tableName && !String(input.tableName).toLowerCase().startsWith('queue') && orderStatus !== 'COMPLETED') {
        await this.occupyDiningTable(client, user, input.tableName, Number.isFinite(partySize) ? partySize : 0);
      }

        return { id: orderId, order_number: orderNumber };
      });
      await this.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Transactions',
        action: 'Order Created',
        details: `Created Order #${savedOrder.order_number}`,
      });
      if (input.payment) {
        await this.recordActivity({
          userId: user.id,
          storeId: user.store_id,
          userName: user.full_name,
          userRole: user.role,
          module: 'Payments',
          action: 'Payment Processed',
          details: `${input.payment.method ?? 'Cash'} Payment\nAmount: ${Number(input.total ?? 0).toFixed(2)}`,
        });
      }
      return savedOrder;
    } catch (error) {
      this.handleDatabaseWriteError(error, 'Unable to save order.');
    }
  }

  async getNextPosOrderNumber(userId: number) {
    const user = await this.getUserStoreScope(userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }
    if (this.isKitchenRole(user.role)) {
      throw new ForbiddenException('Kitchen accounts cannot create POS orders.');
    }

    const rows = await this.query<{ next_order_number: string | number }>(
      `
        SELECT COALESCE(MAX(order_number), 100000) + 1 AS next_order_number
        FROM (
          SELECT NULLIF(regexp_replace(order_number, '\\D', '', 'g'), '')::BIGINT AS order_number
          FROM orders
          WHERE store_id = $1

          UNION ALL

          SELECT NULLIF(regexp_replace("transactionNumber", '\\D', '', 'g'), '')::BIGINT AS order_number
          FROM "Sale"
          WHERE "transactionNumber" LIKE 'POS-%'
        ) used_numbers
      `,
      [user.store_id],
    );

    return { order_number: String(rows[0]?.next_order_number ?? 100001).padStart(6, '0') };
  }

  async updatePosOrder(input: any) {
    await this.ensurePosOrderSchema();
    if (input.tableName !== undefined || input.orderStatus === 'COMPLETED' || Boolean(input.payment)) {
      await this.ensureDiningTableSchema();
    }
    const user = await this.getUserStoreScope(input.userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }
    const cancelOrderItemIds = Array.isArray(input.cancelOrderItemIds)
      ? input.cancelOrderItemIds.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n))
      : null;
    const isRestrictedTransactionUpdate =
      Boolean(input.payment) ||
      input.paymentStatus === 'PAID' ||
      input.paymentStatus === 'VOIDED' ||
      input.paymentStatus === 'REFUNDED' ||
      input.paymentStatus === 'PARTIALLY_REFUNDED' ||
      Boolean(cancelOrderItemIds?.length);
    if (this.isKitchenRole(user.role)) {
      throw new ForbiddenException('Kitchen accounts cannot edit orders, process payments, void, or refund.');
    }
    if (this.isInventoryManagerRole(user.role) && isRestrictedTransactionUpdate) {
      throw new ForbiddenException('Inventory Manager accounts can only view inventory workflows. Payment, refund, and void processing is restricted to POS Manager or POS Staff accounts.');
    }

    const updates: string[] = [];
    const values: any[] = [user.store_id, input.orderNumber];

    const addUpdate = (column: string, value: any) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (input.tableName !== undefined) addUpdate('table_name', input.tableName);
    const isPaymentUpdate = Boolean(input.payment);
    if (input.orderStatus !== undefined) addUpdate('order_status', input.orderStatus);
    if (input.paymentStatus !== undefined) addUpdate('payment_status', input.paymentStatus);
    if (isPaymentUpdate && input.paymentStatus === undefined) addUpdate('payment_status', 'PAID');
    if (isPaymentUpdate || input.paymentStatus === 'PAID') addUpdate('payment_at', new Date());
    if (input.orderStatus === 'PREPARING') addUpdate('preparing_started_at', new Date());
    if (input.orderStatus === 'READY') addUpdate('ready_at', new Date());
    if (input.orderStatus === 'SERVED') addUpdate('served_at', new Date());
    if (input.orderStatus === 'COMPLETED') addUpdate('completed_at', new Date());
    if (input.orderStatus === 'COMPLETED') addUpdate('table_ended_at', new Date());

    if (updates.length === 0 && !isPaymentUpdate && !cancelOrderItemIds?.length) {
      throw new BadRequestException('No order updates were provided.');
    }

    const newPaymentStatus = String(input.paymentStatus ?? '');
    const isVoidOrRefund = ['VOIDED', 'VOID', 'REFUNDED'].includes(newPaymentStatus);
    let itemCancellationDetails: { names: string[]; amount: number } | null = null;

    const rows = await this.withTransaction(async (client) => {
      type UpdatedOrderRow = {
        id: number;
        order_number: string;
        total_amount: string | number;
        subtotal: string | number;
        service_charge: string | number;
        discount_amount: string | number;
        tax_amount: string | number;
        customer_name: string | null;
      };

      // Capture the payment status before the update so a void/refund only restocks
      // when the order was actually paid (and so a repeated void is a no-op).
      const priorRows = await this.queryWithClient<{ payment_status: string | null; table_name: string | null; party_size: string | number | null; order_type: string | null; order_status: string | null }>(
        client,
        `SELECT payment_status, table_name, party_size, order_type, order_status FROM orders WHERE store_id = $1 AND order_number = $2 LIMIT 1`,
        [user.store_id, input.orderNumber],
      );
      const priorPaymentStatus = priorRows[0]?.payment_status ?? null;

      const updatedRows = updates.length > 0
        ? await this.queryWithClient<UpdatedOrderRow>(
            client,
            `
              UPDATE orders
              SET ${updates.join(', ')}
              WHERE store_id = $1
                AND order_number = $2
                AND (
                  ($${values.length + 1} = 'RETAIL_STORE' AND order_type = 'RETAIL')
                  OR ($${values.length + 1} = 'RESTAURANT' AND order_type <> 'RETAIL')
                )
              RETURNING id, order_number, total_amount, subtotal, service_charge, discount_amount, tax_amount, customer_name
            `,
            [...values, user.store_type],
          )
        : await this.queryWithClient<UpdatedOrderRow>(
            client,
            `
              SELECT id, order_number, total_amount, subtotal, service_charge, discount_amount, tax_amount, customer_name
              FROM orders
              WHERE store_id = $1
                AND order_number = $2
                AND (
                  ($3 = 'RETAIL_STORE' AND order_type = 'RETAIL')
                  OR ($3 = 'RESTAURANT' AND order_type <> 'RETAIL')
                )
              LIMIT 1
            `,
            [user.store_id, input.orderNumber, user.store_type],
          );

      if (updatedRows.length === 0) {
        return updatedRows;
      }

      const orderType = String(priorRows[0]?.order_type ?? '').toUpperCase();
      const nextStatus = String(input.orderStatus ?? '').toUpperCase();

      if (cancelOrderItemIds?.length) {
        if (String(priorRows[0]?.order_status ?? '').toUpperCase() !== 'PENDING') {
          throw new BadRequestException('Items can only be cancelled while the order is pending.');
        }

        const itemRows = await this.queryWithClient<{ id: number; product_name: string; quantity: string | number; line_total: string | number }>(
          client,
          `SELECT id, product_name, quantity, line_total FROM order_items WHERE order_id = $1 ORDER BY id ASC`,
          [updatedRows[0].id],
        );
        const selectedRows = itemRows.filter((item) => cancelOrderItemIds.includes(Number(item.id)));
        if (selectedRows.length === 0) {
          throw new BadRequestException('Select at least one order item to cancel.');
        }
        if (selectedRows.length >= itemRows.length) {
          throw new BadRequestException('Use full order cancellation when cancelling every item.');
        }

        await this.queryWithClient(
          client,
          `DELETE FROM order_items WHERE order_id = $1 AND id = ANY($2::bigint[])`,
          [updatedRows[0].id, selectedRows.map((item) => item.id)],
        );

        const totals = await this.queryWithClient<{ subtotal: string | number }>(
          client,
          `SELECT COALESCE(SUM(line_total), 0) AS subtotal FROM order_items WHERE order_id = $1`,
          [updatedRows[0].id],
        );
        const newSubtotal = Number(totals[0]?.subtotal ?? 0);
        const oldSubtotal = Number(updatedRows[0].subtotal ?? 0);
        const serviceRate = oldSubtotal > 0 ? Number(updatedRows[0].service_charge ?? 0) / oldSubtotal : 0;
        const discountRate = oldSubtotal > 0 ? Number(updatedRows[0].discount_amount ?? 0) / oldSubtotal : 0;
        const newServiceCharge = Number((newSubtotal * serviceRate).toFixed(2));
        const newDiscount = Number((newSubtotal * discountRate).toFixed(2));
        const taxAmount = Number(updatedRows[0].tax_amount ?? 0);
        const newTotal = Number((newSubtotal + newServiceCharge - newDiscount + taxAmount).toFixed(2));

        await this.queryWithClient(
          client,
          `
            UPDATE orders
            SET subtotal = $2,
                service_charge = $3,
                discount_amount = $4,
                total_amount = $5
            WHERE id = $1
          `,
          [updatedRows[0].id, newSubtotal, newServiceCharge, newDiscount, newTotal],
        );

        updatedRows[0].subtotal = newSubtotal;
        updatedRows[0].discount_amount = newDiscount;
        updatedRows[0].total_amount = newTotal;
        itemCancellationDetails = {
          names: selectedRows.map((item) => `${item.product_name} x${Number(item.quantity ?? 0)}`),
          amount: selectedRows.reduce((sum, item) => sum + Number(item.line_total ?? 0), 0),
        };
      }

      if (nextStatus === 'PREPARING') {
        await this.queryWithClient(
          client,
          `UPDATE orders
           SET preparing_started_at = COALESCE(preparing_started_at, NOW()),
               ordered_at = COALESCE(ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
               service_started_at = COALESCE(service_started_at, ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
               running_time_start = COALESCE(running_time_start, ordered_at, preparing_started_at, created_at, NOW()),
               table_started_at = CASE WHEN order_type IN ('DINE_IN', 'MIXED') THEN COALESCE(table_started_at, ordered_at, running_time_start, preparing_started_at, created_at, NOW()) ELSE table_started_at END,
               is_running = CASE WHEN running_time_end IS NULL THEN TRUE ELSE is_running END
           WHERE id = $1`,
          [updatedRows[0].id],
        );
      }
      if (nextStatus === 'READY') {
        await this.queryWithClient(
          client,
          `UPDATE orders
           SET ready_at = COALESCE(ready_at, NOW())
           WHERE id = $1`,
          [updatedRows[0].id],
        );
      }
      if (nextStatus === 'SERVED') {
        await this.queryWithClient(
          client,
          `UPDATE orders
           SET served_at = COALESCE(served_at, NOW()),
               ordered_at = COALESCE(ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
               order_status = CASE WHEN order_type = 'TAKEOUT' THEN 'COMPLETED' ELSE order_status END,
               completed_at = CASE WHEN order_type = 'TAKEOUT' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
               service_duration = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                 COALESCE(served_at, NOW())
                 - COALESCE(
                   CASE WHEN ordered_at <= COALESCE(served_at, NOW()) THEN ordered_at END,
                   CASE WHEN running_time_start <= COALESCE(served_at, NOW()) THEN running_time_start END,
                   CASE WHEN preparing_started_at <= COALESCE(served_at, NOW()) THEN preparing_started_at END,
                   created_at,
                   COALESCE(served_at, NOW())
                 )
               )))::BIGINT)
           WHERE id = $1`,
          [updatedRows[0].id],
        );
      }

      // A queued dine-in has no customer at a table yet. Its timer starts once
      // it is assigned to an actual table and that table becomes occupied.
      const priorTableName = String(priorRows[0]?.table_name ?? '');
      const isActualTable = (tableName: string) => Boolean(tableName) && !tableName.toLowerCase().startsWith('queue');
      if (
        ['DINE_IN', 'MIXED'].includes(orderType) &&
        input.tableName !== undefined &&
        isActualTable(String(input.tableName)) &&
        !isActualTable(priorTableName) &&
        !['COMPLETED', 'CANCELLED'].includes(nextStatus)
      ) {
        await this.queryWithClient(
          client,
          `
            UPDATE orders
            SET ordered_at = COALESCE(ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
                running_time_start = COALESCE(running_time_start, ordered_at, preparing_started_at, created_at, NOW()),
                table_started_at = COALESCE(table_started_at, ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
                preparing_started_at = COALESCE(preparing_started_at, ordered_at, running_time_start, created_at, NOW()),
                service_started_at = COALESCE(service_started_at, ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
                is_running = CASE WHEN running_time_start IS NULL THEN TRUE ELSE is_running END
            WHERE id = $1
              AND running_time_start IS NULL
              AND running_time_end IS NULL
          `,
          [updatedRows[0].id],
        );
      }
      const paymentCompletedNow =
        (isPaymentUpdate || String(input.paymentStatus ?? '').toUpperCase() === 'PAID') &&
        String(priorPaymentStatus ?? '').toUpperCase() !== 'PAID';
      const shouldStopRunningTimer =
        (orderType === 'TAKEOUT' && ['SERVED', 'COMPLETED'].includes(nextStatus)) ||
        (['DINE_IN', 'MIXED'].includes(orderType) && paymentCompletedNow) ||
        (['DINE_IN', 'MIXED'].includes(orderType) && String(priorPaymentStatus ?? '').toUpperCase() === 'PAID' && nextStatus === 'COMPLETED') ||
        // Cancellation is also a terminal lifecycle event; it never pauses a timer.
        nextStatus === 'CANCELLED';
      if (shouldStopRunningTimer) {
        await this.stopOrderRunningTimer(client, updatedRows[0].id);
        await this.queryWithClient(
          client,
          `
            UPDATE orders
            SET table_ended_at = CASE WHEN order_type IN ('DINE_IN', 'MIXED') THEN COALESCE(table_ended_at, NOW()) ELSE table_ended_at END,
                order_status = CASE
                  WHEN order_type IN ('DINE_IN', 'MIXED') AND $2::boolean THEN 'COMPLETED'
                  ELSE order_status
                END,
                completed_at = CASE
                  WHEN order_type IN ('DINE_IN', 'MIXED') AND $2::boolean THEN COALESCE(completed_at, NOW())
                  ELSE completed_at
                END,
                service_duration = CASE
                  WHEN order_type = 'TAKEOUT'
                    THEN COALESCE(service_duration, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                      NOW() - COALESCE(
                        CASE WHEN ordered_at <= NOW() THEN ordered_at END,
                        CASE WHEN running_time_start <= NOW() THEN running_time_start END,
                        CASE WHEN preparing_started_at <= NOW() THEN preparing_started_at END,
                        created_at,
                        NOW()
                      )
                    )))::BIGINT))
                  ELSE service_duration
                END
            WHERE id = $1
          `,
          [updatedRows[0].id, paymentCompletedNow],
        );
      }

      if (isPaymentUpdate) {
        const order = updatedRows[0];
        const paymentNumber = await this.createUniquePaymentNumber(client, input.payment.paymentNumber ?? `PAY-${order.order_number}`);
        await this.queryWithClient(
          client,
          `
            INSERT INTO payments (
              store_id, order_id, processed_by, payment_number, payment_method,
              amount_due, amount_paid, change_amount, payment_status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PAID')
          `,
          [
            user.store_id,
            order.id,
            user.id,
            paymentNumber,
            input.payment.method ?? 'Cash',
            Number(order.total_amount ?? 0),
            input.payment.amountPaid ?? Number(order.total_amount ?? 0),
            input.payment.changeAmount ?? 0,
          ],
        );

        // Inventory is reserved/deducted when the order is confirmed. Payment only
        // records settlement and must not replay deduction for Pay Later orders.
      }

      const nextTableName = input.tableName ?? priorRows[0]?.table_name ?? null;
      const nextPartySize = Number(input.partySize ?? priorRows[0]?.party_size ?? 0);
      if (input.tableName && !String(input.tableName).toLowerCase().startsWith('queue') && input.orderStatus !== 'COMPLETED') {
        await this.occupyDiningTable(client, user, input.tableName, Number.isFinite(nextPartySize) ? nextPartySize : 0);
      }
      const hasDiningTable = Boolean(nextTableName && !String(nextTableName).toLowerCase().startsWith('queue'));
      if (hasDiningTable && input.orderStatus === 'COMPLETED' && !isPaymentUpdate && priorPaymentStatus !== 'PAID') {
        throw new BadRequestException('Cannot release a Pay Later table before payment is completed.');
      }
      const shouldReleaseDiningTable =
        input.orderStatus === 'COMPLETED' ||
        input.orderStatus === 'CANCELLED' ||
        (hasDiningTable && ['DINE_IN', 'MIXED'].includes(orderType) && paymentCompletedNow);
      if (shouldReleaseDiningTable) {
        await this.releaseDiningTable(client, user, nextTableName, Number.isFinite(nextPartySize) ? nextPartySize : 0);
      }

      // Void/refund of a paid order: return the deducted stock and reflect it on the
      // mirrored inventory Sale.
      const restockItemIds = Array.isArray(input.restockOrderItemIds)
        ? input.restockOrderItemIds.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n))
        : null;
      const isPartialRefund = newPaymentStatus === 'PARTIALLY_REFUNDED';

      if (restockItemIds && restockItemIds.length > 0) {
        // Per-item path (retail partial/whole refund or void with an item list).
        // Idempotent per item, so it doesn't need the PAID-transition guard.
        const reason =
          input.reason ?? input.refundReason ?? input.voidReason ??
          (isPartialRefund ? 'Partially refunded in POS' : newPaymentStatus === 'VOIDED' ? 'Voided in POS' : 'Refunded in POS');
        const saleStatus = isPartialRefund ? 'PARTIAL_REFUND' : 'REFUNDED';
        await this.restockPosOrderItems(client, user, updatedRows[0], restockItemIds, saleStatus, reason);
      } else if (!restockItemIds && isVoidOrRefund && priorPaymentStatus === 'PAID') {
        // Whole-order path (restaurant void/refund, or any void/refund without an item
        // list). Only fires on a PAID -> void/refund transition, so repeating is a no-op.
        const reason =
          input.reason ?? input.voidReason ?? input.refundReason ??
          (newPaymentStatus === 'REFUNDED' ? 'Refunded in POS' : 'Voided in POS');
        // Honor an explicit restock choice from the refund/void dialog; otherwise
        // fall back to the store-type default (retail returns to shelf, restaurant
        // treats cooked ingredients as a loss).
        const restock =
          typeof input.restock === 'boolean'
            ? input.restock
            : user.store_type === 'RETAIL_STORE';
        await this.restockVoidedPosOrder(client, user, updatedRows[0], newPaymentStatus, reason, restock);
      }

      return updatedRows;
    });

    if (rows.length === 0) {
      throw new NotFoundException('Order not found.');
    }

    const authorizedBy = input.authorizedByManagerName
      ? `\nAuthorized by: ${input.authorizedByManagerName}`
      : '';
    const itemCancellationLog = itemCancellationDetails as { names: string[]; amount: number } | null;

    if (cancelOrderItemIds?.length && itemCancellationLog) {
      await this.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Transactions',
        action: 'Partial Item Cancellation',
        details: `Partially cancelled Order #${rows[0].order_number}\nItems: ${itemCancellationLog.names.join(', ')}\nAmount: ${itemCancellationLog.amount.toFixed(2)}\nReason: ${input.reason ?? 'No reason provided'}${authorizedBy}`,
      });
    } else if (input.payment) {
      await this.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Payments',
        action: 'Payment Processed',
        details: `${input.payment.method ?? 'Cash'} Payment\nAmount: ${Number(input.payment.amountPaid ?? rows[0].total_amount ?? 0).toFixed(2)}\nOrder #${rows[0].order_number}`,
      });
    } else if (String(input.orderStatus ?? '').toUpperCase() === 'CANCELLED') {
      await this.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Transactions',
        action: 'Order Cancelled',
        details: `Cancelled Order #${rows[0].order_number}\nReason: ${input.reason ?? 'No reason provided'}${authorizedBy}`,
      });
    } else if (String(input.paymentStatus ?? '').toUpperCase() === 'REFUNDED' || String(input.paymentStatus ?? '').toUpperCase() === 'PARTIALLY_REFUNDED') {
      await this.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Void & Refund',
        action: 'Refund Processed',
        details: `Refund processed\nOrder #${rows[0].order_number}\nReason: ${input.refundReason ?? input.reason ?? 'Customer request'}${authorizedBy}`,
      });
    } else if (String(input.paymentStatus ?? '').toUpperCase() === 'VOIDED') {
      await this.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Void & Refund',
        action: 'Void Approved',
        details: `Voided Order #${rows[0].order_number}\nReason: ${input.voidReason ?? input.reason ?? 'No reason provided'}${authorizedBy}`,
      });
    } else if (input.orderStatus) {
      await this.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Transactions',
        action: `Order ${String(input.orderStatus).charAt(0).toUpperCase()}${String(input.orderStatus).slice(1).toLowerCase()}`,
        details: `Order #${rows[0].order_number} status changed to ${input.orderStatus}`,
      });
    }

    return rows[0];
  }

  async listPosOrders(userId: number) {
    await this.ensurePosOrderSchema();
    const user = await this.getUserStoreScope(userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }
    if (this.isKitchenRole(user.role)) {
      throw new ForbiddenException('Kitchen accounts can only view orders through the Kitchen Orders module.');
    }

    await this.reconcileRestaurantRunningTimers(user);

    return this.query<any>(
      `
        SELECT
          o.id,
          o.order_number,
          o.customer_name,
          o.order_type,
          o.table_name,
          o.party_size,
          o.subtotal,
          o.discount_amount,
          o.discount_type,
          o.tax_amount,
          o.service_charge,
          o.total_amount,
          o.order_status,
          o.payment_status,
          COALESCE(o.ordered_at, o.running_time_start, o.preparing_started_at, o.created_at) AS ordered_at,
          o.created_at,
          o.completed_at,
          o.payment_at,
          o.preparing_started_at,
          o.ready_at,
          o.service_started_at,
          o.served_at,
          o.service_duration,
          COALESCE(o.table_started_at, CASE WHEN o.order_type IN ('DINE_IN', 'MIXED') THEN COALESCE(o.ordered_at, o.running_time_start, o.preparing_started_at, o.created_at) END) AS table_started_at,
          COALESCE(
            o.table_ended_at,
            CASE
              WHEN o.order_type IN ('DINE_IN', 'MIXED')
                AND (o.running_time_end IS NOT NULL OR o.order_status = 'CANCELLED')
              THEN COALESCE(o.running_time_end, o.completed_at, o.payment_at, o.updated_at)
            END
          ) AS table_ended_at,
          o.running_time_start,
          o.running_time_end,
          o.running_duration,
          o.is_running,
          o.estimated_prep_minutes,
          o.estimated_ready_at,
          p.payment_number,
          p.payment_method,
          p.amount_paid,
          p.change_amount,
          COALESCE(payment_user.full_name, cashier_user.full_name) AS cashier_name,
          COALESCE(
            json_agg(
              json_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'variant_id', oi.variant_id,
                'product_name', oi.product_name,
                'category_name', oi.category_name,
                'size', oi.size,
                'color', oi.color,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'line_total', oi.line_total,
                'image_url', COALESCE(pv.image_url, prod.image_url),
                'item_type', oi.item_type,
                'notes', oi.notes,
                'prep_time_minutes', oi.prep_time_minutes,
                'customization_prep_minutes', oi.customization_prep_minutes,
                'added_ingredients', COALESCE(customizations.added, '[]'::json),
                'removed_ingredients', COALESCE(customizations.removed, '[]'::json),
                'changed_ingredients', COALESCE(customizations.changed, '[]'::json),
                'replaced_ingredients', COALESCE(customizations.replaced, '[]'::json),
                'modifiers', COALESCE(customizations.modifiers, '[]'::json)
              )
              ORDER BY oi.id ASC
            ) FILTER (WHERE oi.id IS NOT NULL),
            '[]'::json
          ) AS items
        FROM orders o
        LEFT JOIN payments p ON p.order_id = o.id
        LEFT JOIN users cashier_user ON cashier_user.id = o.cashier_id
        LEFT JOIN users payment_user ON payment_user.id = p.processed_by
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(json_agg(DISTINCT CONCAT(
              COALESCE(oic.notes, oic.replacement_ingredient_name, oic.original_ingredient_name, 'Add-on'),
              CASE WHEN oic.new_quantity IS NOT NULL THEN CONCAT(' ', oic.new_quantity::text, COALESCE(CONCAT(' ', oic.unit), '')) ELSE '' END
            )) FILTER (WHERE oic.customization_type IN ('ADD', 'EXTRA')), '[]'::json) AS added,
            COALESCE(json_agg(DISTINCT COALESCE(oic.original_ingredient_name, oic.notes)) FILTER (WHERE oic.customization_type = 'REMOVE'), '[]'::json) AS removed,
            COALESCE(json_agg(DISTINCT COALESCE(oic.notes, CONCAT(
              COALESCE(oic.original_ingredient_name, 'Ingredient'), ': ',
              COALESCE(oic.original_quantity::text, '0'), COALESCE(CONCAT(' ', oic.unit), ''), ' -> ',
              COALESCE(oic.new_quantity::text, '0'), COALESCE(CONCAT(' ', oic.unit), '')
            ))) FILTER (WHERE oic.customization_type IN ('CHANGE_QUANTITY', 'QUANTITY_CHANGE')), '[]'::json) AS changed,
            COALESCE(json_agg(DISTINCT CONCAT(
              COALESCE(oic.original_ingredient_name, 'Ingredient'), ' -> ',
              COALESCE(oic.replacement_ingredient_name, 'Replacement')
            )) FILTER (WHERE oic.customization_type = 'REPLACE'), '[]'::json) AS replaced,
            COALESCE(json_agg(DISTINCT oic.notes) FILTER (
              WHERE oic.customization_type = 'NOTE' AND oic.notes IS NOT NULL
            ), '[]'::json) AS modifiers
          FROM order_item_customizations oic
          WHERE oic.order_item_id = oi.id
        ) customizations ON TRUE
        LEFT JOIN products prod ON prod.id = oi.product_id
        LEFT JOIN product_variants pv ON pv.id = oi.variant_id
        WHERE o.store_id = $1
          AND (
            ($2 = 'RETAIL_STORE' AND o.order_type = 'RETAIL')
            OR ($2 = 'RESTAURANT' AND o.order_type <> 'RETAIL')
          )
        GROUP BY o.id, p.payment_number, p.payment_method, p.amount_paid, p.change_amount, cashier_user.full_name, payment_user.full_name
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 500
      `,
      [user.store_id, user.store_type],
    );
  }

  private async replaceProductIngredients(client: PoolClient, storeId: number, productId: number, ingredients: any[]) {
    await this.queryWithClient(
      client,
      `
        DELETE FROM product_ingredients
        WHERE store_id = $1
          AND product_id = $2
      `,
      [storeId, productId],
    );

    for (const ingredient of ingredients) {
      if (!ingredient.ingredient_id && !ingredient.ingredientId) {
        continue;
      }

      const inventoryRows = await this.queryWithClient<any>(
        client,
        `
          SELECT ingredient_name, unit
          FROM ingredients_inventory
          WHERE id = $1
            AND store_id = $2
          LIMIT 1
        `,
        [ingredient.ingredient_id ?? ingredient.ingredientId, storeId],
      );

      const inventory = inventoryRows[0];
      if (!inventory) {
        continue;
      }

      const quantity = Number(ingredient.quantity_required ?? ingredient.quantityRequired ?? ingredient.default_quantity ?? 0);

      await this.queryWithClient(
        client,
        `
          INSERT INTO product_ingredients (
            store_id, product_id, ingredient_id, ingredient_name, quantity_required,
            default_quantity, unit, additional_cost, is_required, is_removable
          )
          VALUES ($1, $2, $3, $4, $5, $5, $6, $7, COALESCE($8, TRUE), COALESCE($9, TRUE))
        `,
        [
          storeId,
          productId,
          ingredient.ingredient_id ?? ingredient.ingredientId,
          inventory.ingredient_name,
          quantity,
          ingredient.unit ?? inventory.unit,
          ingredient.additional_cost ?? ingredient.additionalCost ?? 0,
          ingredient.is_required ?? ingredient.isRequired,
          ingredient.is_removable ?? ingredient.isRemovable,
        ],
      );
    }
  }

  private async recordRestaurantInstructionModifiers(client: PoolClient, storeId: number, orderItemId: number, item: any) {
    const modifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
    for (const modifier of modifiers) {
      if (!['note', 'size_variant'].includes(String(modifier?.type ?? '').toLowerCase())) continue;
      const label = String(modifier?.name ?? '').trim();
      if (!label) continue;
      await this.queryWithClient(
        client,
        `
          INSERT INTO order_item_customizations (
            store_id, order_item_id, customization_type, notes,
            original_quantity, new_quantity, additional_cost
          )
          VALUES ($1, $2, 'NOTE', $3, 0, 0, $4)
        `,
        [storeId, orderItemId, label, Number(modifier.priceDelta ?? 0)],
      );
    }
  }

  private async validateRestaurantModifiers(client: PoolClient, storeId: number, item: any) {
    const selectedModifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
    const submittedIngredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    const hasSubmittedAddOn = submittedIngredients.some((ingredient: any) =>
      String(ingredient.customization_type ?? ingredient.customizationType ?? '').toUpperCase() === 'ADD',
    );
    const hasSubmittedBasicAdjustment = submittedIngredients.some((ingredient: any) => {
      const type = String(ingredient.customization_type ?? ingredient.customizationType ?? '').toUpperCase();
      return ingredient.removed === true || type === 'REMOVE' || type === 'CHANGE_QUANTITY' || type === 'QUANTITY_CHANGE';
    });
    if (selectedModifiers.length === 0) {
      if (hasSubmittedAddOn) throw new BadRequestException('An add-on selection is required for added ingredients.');
      if (hasSubmittedBasicAdjustment) throw new BadRequestException('A configured modifier is required for ingredient adjustments.');
      return;
    }
    const productId = Number(item.productId ?? item.id ?? 0);
    if (!Number.isFinite(productId) || productId <= 0) {
      throw new BadRequestException('A valid menu item is required for modifiers.');
    }

    const rows = await this.queryWithClient<{ modifiers: any[]; product_price: string | number }>(
      client,
      `
        SELECT COALESCE(recipe.modifiers, '[]'::jsonb) AS modifiers,
               product.price AS product_price
        FROM products product
        LEFT JOIN "InventoryItem" menu_item ON menu_item.id = product.inventory_item_id
        LEFT JOIN LATERAL (
          SELECT configured.modifiers
          FROM "Recipe" configured
          WHERE COALESCE(configured."isActive", TRUE) = TRUE
            AND (menu_item."businessId" IS NULL OR configured."businessId" = menu_item."businessId")
            AND (
              configured."menuItemId" = product.inventory_item_id
              OR lower(trim(COALESCE(configured.name, ''))) = lower(trim(COALESCE(product.name, '')))
            )
          ORDER BY CASE WHEN configured."menuItemId" = product.inventory_item_id THEN 0 ELSE 1 END,
                   configured."updatedAt" DESC NULLS LAST
          LIMIT 1
        ) recipe ON TRUE
        WHERE product.id = $1 AND product.store_id = $2
        LIMIT 1
      `,
      [productId, storeId],
    );
    const configuredModifiers = Array.isArray(rows[0]?.modifiers) ? rows[0].modifiers : [];
    const configuredById = new Map(configuredModifiers.map((modifier: any) => [String(modifier.id), modifier]));
    const sameNumber = (left: unknown, right: unknown) => Math.abs(Number(left ?? 0) - Number(right ?? 0)) < 0.000001;
    const selectedIds = new Set<string>();
    const approvedAddOnIngredientIds = new Set<number>();
    const approvedAdjustmentIngredientIds = new Set<number>();
    const configuredBasePrice = Number(rows[0]?.product_price ?? 0);
    let configuredSurchargePerItem = 0;
    const configuredSelectedSizeVariants = selectedModifiers
      .map((selected: any) => configuredById.get(String(selected?.id ?? '')))
      .filter((modifier: any) => modifier?.type === 'size_variant');
    if (configuredSelectedSizeVariants.length > 1) {
      throw new BadRequestException('Only one size variant may be selected for a menu item.');
    }
    const selectedSizeVariant: any = configuredSelectedSizeVariants[0];
    const selectedSizeMultiplier = selectedSizeVariant ? Number(selectedSizeVariant.sizeMultiplier ?? 1) : 1;
    if (!Number.isFinite(selectedSizeMultiplier) || selectedSizeMultiplier <= 0) {
      throw new BadRequestException('The selected size has an invalid BOM multiplier.');
    }
    const explicitlyAdjustedIngredientIds = new Set<number>();

    if (!sameNumber(item.price, configuredBasePrice)) {
      throw new BadRequestException('The menu item price changed. Please refresh the order and try again.');
    }

    for (const selected of selectedModifiers) {
      const selectedId = String(selected?.id ?? '');
      if (!selectedId || selectedIds.has(selectedId)) {
        throw new BadRequestException('Duplicate or invalid modifier selection.');
      }
      selectedIds.add(selectedId);
      const configured: any = configuredById.get(selectedId);
      if (!configured) {
        throw new BadRequestException(`Modifier ${String(selected?.name ?? '') || 'selection'} is not allowed for this menu item.`);
      }
      if (String(selected.name ?? '') !== String(configured.name ?? '')) {
        throw new BadRequestException('A modifier label does not match the configured recipe option.');
      }
      if (String(configured.type ?? 'note') !== String(selected.type ?? 'note')) {
        throw new BadRequestException(`Modifier ${configured.name ?? selected.name} has an invalid behavior.`);
      }
      if (configured.type === 'size_variant'
        && (!sameNumber(selected.sizeMultiplier, configured.sizeMultiplier)
          || !sameNumber(selected.sellingPrice, configured.sellingPrice))) {
        throw new BadRequestException(`Size variant ${configured.name ?? selected.name} does not match its configured multiplier or selling price.`);
      }
      const selectedCount = configured.type === 'add_on' ? Number(selected.selectedQuantity ?? 1) : 1;
      const configuredPrice = configured.type === 'add_on' || configured.type === 'size_variant'
        ? Number(configured.priceDelta ?? 0)
        : 0;
      if (!sameNumber(selected.priceDeltaPercent, configured.priceDeltaPercent)) {
        throw new BadRequestException(`Modifier ${configured.name ?? selected.name} has an invalid percentage price.`);
      }
      if (configured.type !== 'add_on') {
        if (!sameNumber(selected.priceDelta, configuredPrice)) {
          throw new BadRequestException(`Modifier ${configured.name ?? selected.name} has an invalid price.`);
        }
        configuredSurchargePerItem += (
          configuredPrice
          + configuredBasePrice * (Number(configured.priceDeltaPercent ?? 0) / 100)
        ) * selectedCount;
      }
      if (configured.type === 'add_on') {
        const selectedQuantity = Number(selected.selectedQuantity ?? 1);
        const maximum = Number(configured.maxQuantity);
        if (!Number.isInteger(maximum) || maximum <= 0) {
          throw new BadRequestException(`${configured.name ?? 'Add-on'} does not have a configured maximum count.`);
        }
        if (!Number.isInteger(selectedQuantity) || selectedQuantity < 1 || selectedQuantity > maximum) {
          throw new BadRequestException(`${configured.name ?? 'Add-on'} allows a maximum of ${maximum}.`);
        }
        if (!configured.itemId || String(selected.itemId ?? '') !== String(configured.itemId)) {
          throw new BadRequestException(`${configured.name ?? 'Add-on'} is not linked to the configured inventory item.`);
        }
        if (!sameNumber(selected.quantity, configured.quantity) || String(selected.unit ?? '') !== String(configured.unit ?? '')) {
          throw new BadRequestException(`${configured.name ?? 'Add-on'} has an invalid portion.`);
        }

        const inventoryRows = await this.queryWithClient<{ id: number; weighted_average_cost: string | number }>(
          client,
          `
            SELECT ii.id, COALESCE(inv.price, 0) AS weighted_average_cost
            FROM ingredients_inventory ii
            LEFT JOIN "InventoryItem" inv ON inv.id = ii.inventory_item_id
            WHERE ii.store_id = $1 AND ii.inventory_item_id = $2
            LIMIT 1
          `,
          [storeId, configured.itemId],
        );
        const ingredientId = Number(inventoryRows[0]?.id ?? 0);
        approvedAddOnIngredientIds.add(ingredientId);
        if (!sameNumber(selected.priceDelta, configured.priceDelta)) {
          throw new BadRequestException(`${configured.name ?? 'Add-on'} has an invalid configured price.`);
        }
        configuredSurchargePerItem += (
          Number(configured.priceDelta ?? 0)
          + configuredBasePrice * (Number(configured.priceDeltaPercent ?? 0) / 100)
        ) * selectedCount;
        const expectedPortion = Number(configured.quantity ?? 0) * selectedQuantity;
        const expectedAdditionalCost = Number(configured.priceDelta ?? 0) * selectedQuantity;
        const submittedIngredient = submittedIngredients.find((ingredient: any) =>
          String(ingredient.customization_type ?? ingredient.customizationType ?? '').toUpperCase() === 'ADD'
          && Number(ingredient.replacement_ingredient_id ?? ingredient.replacementIngredientId ?? ingredient.ingredient_id ?? ingredient.ingredientId ?? 0) === ingredientId,
        );
        if (!ingredientId || !submittedIngredient) {
          throw new BadRequestException(`${configured.name ?? 'Add-on'} is missing its configured inventory deduction.`);
        }
        if (!sameNumber(submittedIngredient.quantity, expectedPortion)
          || String(submittedIngredient.unit ?? '') !== String(configured.unit ?? '')
          || !sameNumber(submittedIngredient.additional_price ?? submittedIngredient.additionalCost, expectedAdditionalCost)) {
          throw new BadRequestException(`${configured.name ?? 'Add-on'} does not match its configured portion or price.`);
        }
      } else if (configured.type === 'remove' || configured.type === 'ingredient_level' || configured.type === 'less') {
        if (!configured.itemId || String(selected.itemId ?? '') !== String(configured.itemId)) {
          throw new BadRequestException(`${configured.name ?? 'Ingredient adjustment'} is not linked to the configured recipe ingredient.`);
        }
        const inventoryRows = await this.queryWithClient<{ id: number; quantity_required: string | number | null }>(
          client,
          `SELECT ii.id, pi.quantity_required
           FROM ingredients_inventory ii
           LEFT JOIN product_ingredients pi
             ON pi.store_id = ii.store_id AND pi.product_id = $3 AND pi.ingredient_id = ii.id
           WHERE ii.store_id = $1 AND ii.inventory_item_id = $2
           LIMIT 1`,
          [storeId, configured.itemId, productId],
        );
        const ingredientId = Number(inventoryRows[0]?.id ?? 0);
        approvedAdjustmentIngredientIds.add(ingredientId);
        explicitlyAdjustedIngredientIds.add(ingredientId);
        const submittedIngredient = submittedIngredients.find((ingredient: any) =>
          Number(ingredient.ingredient_id ?? ingredient.ingredientId ?? 0) === ingredientId,
        );
        if (!ingredientId || !submittedIngredient) {
          throw new BadRequestException(`${configured.name ?? 'Ingredient adjustment'} does not match a basic recipe ingredient.`);
        }
        const originalQuantity = Number(submittedIngredient.original_quantity ?? submittedIngredient.originalQuantity ?? 0);
        const submittedQuantity = Number(submittedIngredient.quantity ?? 0);
        const configuredOriginalQuantity = Number(inventoryRows[0]?.quantity_required ?? originalQuantity);
        const isIngredientLevel = configured.type === 'ingredient_level' || configured.type === 'less';
        const levelPercent = configured.type === 'less' ? 50 : Number(configured.levelPercent ?? 100);
        const exactSizeQuantity = selectedSizeVariant?.ingredientQuantities?.[String(configured.itemId ?? '')];
        const configuredVariantQuantity = exactSizeQuantity != null && Number.isFinite(Number(exactSizeQuantity))
          ? Number(exactSizeQuantity)
          : configuredOriginalQuantity * selectedSizeMultiplier;
        const validAdjustment = isIngredientLevel
          ? originalQuantity > 0
            && sameNumber(originalQuantity, configuredOriginalQuantity)
            && levelPercent >= 0 && levelPercent <= 100
            && sameNumber(submittedQuantity, configuredVariantQuantity * (levelPercent / 100))
          : submittedIngredient.removed === true || submittedQuantity <= 0;
        if (!validAdjustment) {
          throw new BadRequestException(`${configured.name ?? 'Ingredient adjustment'} does not match its configured action.`);
        }
      }
    }

    if (selectedSizeVariant) {
      const baseIngredients = await this.queryWithClient<{ ingredient_id: number; inventory_item_id: string | null; quantity_required: string | number }>(
        client,
        `SELECT pi.ingredient_id, ii.inventory_item_id, pi.quantity_required
         FROM product_ingredients pi
         JOIN ingredients_inventory ii ON ii.id = pi.ingredient_id AND ii.store_id = pi.store_id
         WHERE pi.store_id = $1 AND pi.product_id = $2 AND pi.ingredient_id IS NOT NULL`,
        [storeId, productId],
      );
      for (const baseIngredient of baseIngredients) {
        const ingredientId = Number(baseIngredient.ingredient_id);
        approvedAdjustmentIngredientIds.add(ingredientId);
        if (explicitlyAdjustedIngredientIds.has(ingredientId)) continue;
        const submittedIngredient = submittedIngredients.find((ingredient: any) =>
          Number(ingredient.ingredient_id ?? ingredient.ingredientId ?? 0) === ingredientId,
        );
        if (!submittedIngredient) {
          throw new BadRequestException(`${selectedSizeVariant.name ?? 'Size variant'} is missing a recipe ingredient.`);
        }
        const originalQuantity = Number(submittedIngredient.original_quantity ?? submittedIngredient.originalQuantity ?? 0);
        const configuredOriginalQuantity = Number(baseIngredient.quantity_required ?? 0);
        const exactSizeQuantity = selectedSizeVariant.ingredientQuantities?.[String(baseIngredient.inventory_item_id ?? '')];
        const configuredVariantQuantity = exactSizeQuantity != null && Number.isFinite(Number(exactSizeQuantity))
          ? Number(exactSizeQuantity)
          : configuredOriginalQuantity * selectedSizeMultiplier;
        if (!sameNumber(originalQuantity, configuredOriginalQuantity)
          || !sameNumber(submittedIngredient.quantity, configuredVariantQuantity)) {
          throw new BadRequestException(`${selectedSizeVariant.name ?? 'Size variant'} does not match its configured ingredient quantities.`);
        }
      }
    }

    const unauthorizedAddOn = submittedIngredients.find((ingredient: any) => {
      if (String(ingredient.customization_type ?? ingredient.customizationType ?? '').toUpperCase() !== 'ADD') return false;
      const ingredientId = Number(ingredient.replacement_ingredient_id ?? ingredient.replacementIngredientId ?? ingredient.ingredient_id ?? ingredient.ingredientId ?? 0);
      return !approvedAddOnIngredientIds.has(ingredientId);
    });
    if (unauthorizedAddOn) {
      throw new BadRequestException('An add-on is not approved for this menu item.');
    }
    const unauthorizedAdjustment = submittedIngredients.find((ingredient: any) => {
      const type = String(ingredient.customization_type ?? ingredient.customizationType ?? '').toUpperCase();
      const adjusted = ingredient.removed === true || type === 'REMOVE' || type === 'CHANGE_QUANTITY' || type === 'QUANTITY_CHANGE';
      const ingredientId = Number(ingredient.ingredient_id ?? ingredient.ingredientId ?? 0);
      return adjusted && !approvedAdjustmentIngredientIds.has(ingredientId);
    });
    if (unauthorizedAdjustment) {
      throw new BadRequestException('An ingredient adjustment is not approved for this menu item.');
    }
    const itemQuantity = Number(item.quantity ?? 1);
    const expectedLineTotal = (configuredBasePrice + configuredSurchargePerItem) * itemQuantity;
    if (!Number.isFinite(itemQuantity) || itemQuantity <= 0 || !sameNumber(item.lineTotal, expectedLineTotal)) {
      throw new BadRequestException('The modified item total is invalid. Please review the order again.');
    }
  }

  private async replaceProductVariants(client: PoolClient, productId: number, variants: any[]) {
    await this.queryWithClient(
      client,
      `
        DELETE FROM product_variants
        WHERE product_id = $1
      `,
      [productId],
    );

    for (const [index, variant] of variants.entries()) {
      const hasVariantValue = variant.size || variant.color || variant.image_url || variant.sku || variant.barcode || variant.price || variant.stock_quantity;
      if (!hasVariantValue) {
        continue;
      }

      const generatedCode = this.buildVariantCode(productId, index);

      await this.queryWithClient(
        client,
        `
          INSERT INTO product_variants (
            product_id, size, color, sku, barcode, image_url, price, stock_quantity, low_stock_limit, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, TRUE))
        `,
        [
          productId,
          variant.size ?? null,
          variant.color ?? null,
          variant.sku || generatedCode,
          variant.barcode || generatedCode,
          variant.image_url ?? null,
          Number(variant.price ?? 0),
          Number(variant.stock_quantity ?? 0),
          Number(variant.low_stock_limit ?? 5),
          variant.is_active ?? true,
        ],
      );
    }
  }

  private buildVariantCode(productId: number, index: number) {
    return `${String(productId).padStart(8, '0')}${String(index + 1).padStart(4, '0')}`;
  }

  private async deductRetailProduct(
    client: PoolClient,
    storeId: number,
    orderId: number,
    orderItemId: number,
    item: any,
    productId: number,
    variantId: number,
    quantity: number,
    movements: PosSaleMovement[],
    inventorySyncSettings: InventorySyncSettings,
  ) {
    const variantRows = await this.queryWithClient<{ stock_quantity: number; product_id: number; size: string | null; color: string | null; inventory_item_id: string | null }>(
      client,
      `
        SELECT pv.stock_quantity, pv.product_id, pv.size, pv.color
             , COALESCE(pv.inventory_item_id, p.inventory_item_id) AS inventory_item_id
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id = $1
          AND p.id = $2
          AND p.store_id = $3
        FOR UPDATE
      `,
      [variantId, productId, storeId],
    );

    const variant = variantRows[0];
    if (!variant) {
      throw new NotFoundException('Product variant was not found for this store.');
    }

    if (!inventorySyncSettings.allowNegativeStock && Number(variant.stock_quantity ?? 0) < quantity) {
      throw new BadRequestException('Not enough variant stock for this order.');
    }

    await this.queryWithClient(
      client,
      `
        UPDATE product_variants
        SET stock_quantity = stock_quantity - $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [quantity, variantId],
    );

    if (variant.inventory_item_id) {
      const invRows = await this.queryWithClient<{ quantity: string | number; unit: string | null; locationId: string; businessId: string }>(
        client,
        `SELECT quantity, unit, "locationId", "businessId" FROM "InventoryItem" WHERE id = $1 FOR UPDATE`,
        [variant.inventory_item_id],
      );
      const inv = invRows[0];
      if (inv) {
        const previousQuantity = Number(inv.quantity ?? 0);
        const newQuantity = Math.max(previousQuantity - quantity, 0);
        await this.queryWithClient(
          client,
          `
            UPDATE "InventoryItem"
            SET quantity = $1,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = $2
          `,
          [newQuantity, variant.inventory_item_id],
        );

        const unitPrice = Number(item?.price ?? 0);
        movements.push({
          inventoryItemId: variant.inventory_item_id,
          businessId: inv.businessId,
          locationId: inv.locationId,
          module: 'RETAIL',
          unit: inv.unit,
          quantity,
          previousQuantity,
          newQuantity,
          movementType: 'SALE',
          reason: 'POS sale',
          emitStockMovement: true,
          saleItem: {
            name: item?.name ?? 'Item',
            quantity,
            unitPrice,
            totalPrice: unitPrice * quantity,
          },
        });
      }
    }

    await this.queryWithClient(
      client,
      `
        INSERT INTO inventory_deductions (
          store_id, order_id, order_item_id, product_id, variant_id, deduction_type, quantity_deducted, unit
        )
        VALUES ($1, $2, $3, $4, $5, 'RETAIL_VARIANT_SALE', $6, $7)
      `,
      [storeId, orderId, orderItemId, productId, variantId, quantity, 'pcs'],
    );

    await this.queryWithClient(
      client,
      `
        INSERT INTO inventory_transactions (
          store_id, product_id, variant_id, transaction_type, quantity, remarks
        )
        VALUES ($1, $2, $3, 'SALE', $4, $5)
      `,
      [storeId, productId, variantId, quantity, `Order ${orderId}`],
    );
  }

  private async resolveProductIngredientId(
    client: PoolClient,
    storeId: number,
    productId: number | null,
    productIngredientId: number | null,
    originalIngredientId: number | null,
  ) {
    if (!productId) return null;

    if (productIngredientId) {
      const rows = await this.queryWithClient<{ id: number }>(
        client,
        `
          SELECT id
          FROM product_ingredients
          WHERE id = $1
            AND store_id = $2
            AND product_id = $3
          LIMIT 1
        `,
        [productIngredientId, storeId, productId],
      );
      if (rows[0]?.id) return rows[0].id;
    }

    if (!originalIngredientId) return null;

    const linkedRows = await this.queryWithClient<{ id: number }>(
      client,
      `
        SELECT id
        FROM product_ingredients
        WHERE store_id = $1
          AND product_id = $2
          AND ingredient_id = $3
        LIMIT 1
      `,
      [storeId, productId, originalIngredientId],
    );
    return linkedRows[0]?.id ?? null;
  }

  private async recordRestaurantIngredientCustomizations(client: PoolClient, storeId: number, orderItemId: number, item: any) {
    const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    const finiteNumberOrNull = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    for (const ingredient of ingredients) {
      const originalId = finiteNumberOrNull(ingredient.ingredient_id ?? ingredient.ingredientId);
      const replacementId = finiteNumberOrNull(ingredient.replacement_ingredient_id ?? ingredient.replacementIngredientId);
      const productIngredientId = await this.resolveProductIngredientId(
        client,
        storeId,
        finiteNumberOrNull(item.productId ?? item.id),
        finiteNumberOrNull(ingredient.product_ingredient_id ?? ingredient.productIngredientId ?? (originalId ? ingredient.id : null)),
        originalId,
      );

      const removed = ingredient.removed === true || Number(ingredient.quantity ?? 0) <= 0;
      const originalQuantity = Number(ingredient.original_quantity ?? ingredient.originalQuantity ?? ingredient.quantity ?? 0);
      const ingredientQuantity = Number(ingredient.quantity ?? 0);
      const additionalCost = Number(ingredient.additional_price ?? ingredient.additionalCost ?? 0);
      const customizationType = ingredient.customization_type ?? ingredient.customizationType ?? null;
      const isAddedIngredient = ['ADD', 'EXTRA'].includes(String(customizationType ?? '').toUpperCase());
      const persistedOriginalId = isAddedIngredient ? null : originalId;
      const persistedReplacementId = isAddedIngredient ? (replacementId ?? originalId) : replacementId;
      const persistedProductIngredientId = isAddedIngredient ? null : productIngredientId;
      const hasCustomization = Boolean(
        customizationType ||
          removed ||
          replacementId ||
          additionalCost !== 0 ||
          (Number.isFinite(originalQuantity) && Number.isFinite(ingredientQuantity) && ingredientQuantity !== originalQuantity),
      );

      if (!hasCustomization || (!originalId && !replacementId && !productIngredientId)) {
        continue;
      }

      await this.queryWithClient(
        client,
        `
          INSERT INTO order_item_customizations (
            store_id, order_item_id, product_ingredient_id, original_ingredient_id,
            replacement_ingredient_id, customization_type, original_ingredient_name,
            replacement_ingredient_name, original_quantity, new_quantity, unit,
            additional_cost, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `,
        [
          storeId,
          orderItemId,
          persistedProductIngredientId,
          persistedOriginalId,
          persistedReplacementId,
          customizationType ?? (removed ? 'REMOVE' : replacementId ? 'REPLACE' : 'CHANGE_QUANTITY'),
          ingredient.original_name ?? ingredient.name ?? null,
          ingredient.replacement_name ?? null,
          Number.isFinite(originalQuantity) ? originalQuantity : null,
          Number.isFinite(ingredientQuantity) ? ingredientQuantity : 0,
          ingredient.unit ?? null,
          additionalCost,
          ingredient.notes ?? null,
        ],
      );
    }
    await this.recordRestaurantInstructionModifiers(client, storeId, orderItemId, item);
  }

  private async deductRestaurantIngredients(
    client: PoolClient,
    storeId: number,
    orderId: number,
    orderItemId: number,
    item: any,
    movements: PosSaleMovement[],
    inventorySyncSettings: InventorySyncSettings,
    options: { recordCustomizations?: boolean } = {},
  ) {
    const itemQuantity = Number(item.quantity ?? 1);
    const shouldRecordCustomizations = options.recordCustomizations !== false;
    let ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    const finiteNumberOrNull = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    // Record the menu dish itself as a sale line item (the recipe's menu InventoryItem),
    // so restaurant sales show real items in the inventory Sales report. The dish isn't
    // stock-tracked — ingredient consumption below handles depletion — so no movement.
    const dishProductId = Number(item.productId ?? item.id ?? 0);
    if (dishProductId) {
      const dishRows = await this.queryWithClient<{ inventory_item_id: string | null }>(
        client,
        `SELECT inventory_item_id FROM products WHERE id = $1 AND store_id = $2`,
        [dishProductId, storeId],
      );
      const menuItemId = dishRows[0]?.inventory_item_id ?? null;
      if (menuItemId) {
        const menuRows = await this.queryWithClient<{ unit: string | null; locationId: string; businessId: string }>(
          client,
          `SELECT unit, "locationId", "businessId" FROM "InventoryItem" WHERE id = $1`,
          [menuItemId],
        );
        const menu = menuRows[0];
        if (menu) {
          const unitPrice = Number(item.price ?? item.unit_price ?? 0);
          movements.push({
            inventoryItemId: menuItemId,
            businessId: menu.businessId,
            locationId: menu.locationId,
            module: 'RESTAURANT',
            unit: menu.unit,
            quantity: itemQuantity,
            previousQuantity: 0,
            newQuantity: 0,
            movementType: 'SALE',
            reason: 'POS sale',
            emitStockMovement: false,
            saleItem: {
              name: item.name ?? item.product_name ?? 'Menu item',
              quantity: itemQuantity,
              unitPrice,
              totalPrice: unitPrice * itemQuantity,
            },
          });
        }
      }
    }

    if (ingredients.length === 0 && dishProductId) {
      ingredients = await this.queryWithClient<any>(
        client,
        `
          SELECT
            pi.id AS product_ingredient_id,
            pi.ingredient_id,
            COALESCE(ii.ingredient_name, pi.ingredient_name) AS name,
            pi.quantity_required AS quantity,
            pi.quantity_required AS original_quantity,
            pi.unit
          FROM product_ingredients pi
          LEFT JOIN ingredients_inventory ii ON ii.id = pi.ingredient_id
          WHERE pi.store_id = $1
            AND pi.product_id = $2
          ORDER BY pi.id ASC
        `,
        [storeId, dishProductId],
      );
    }

    for (const ingredient of ingredients) {
      const originalId = finiteNumberOrNull(ingredient.ingredient_id ?? ingredient.ingredientId);
      const replacementId = finiteNumberOrNull(ingredient.replacement_ingredient_id ?? ingredient.replacementIngredientId);
      const productIngredientId = await this.resolveProductIngredientId(
        client,
        storeId,
        finiteNumberOrNull(item.productId ?? item.id),
        finiteNumberOrNull(ingredient.product_ingredient_id ?? ingredient.productIngredientId ?? (originalId ? ingredient.id : null)),
        originalId,
      );
      const ingredientId = replacementId ?? originalId;
      const removed = ingredient.removed === true || Number(ingredient.quantity ?? 0) <= 0;
      const quantity = removed ? 0 : Number(ingredient.quantity ?? ingredient.quantity_required ?? 0) * itemQuantity;
      const originalQuantity = Number(ingredient.original_quantity ?? ingredient.originalQuantity ?? ingredient.quantity ?? 0);
      const ingredientQuantity = Number(ingredient.quantity ?? 0);
      const additionalCost = Number(ingredient.additional_price ?? ingredient.additionalCost ?? 0);
      const customizationType = ingredient.customization_type ?? ingredient.customizationType ?? null;
      const isAddedIngredient = ['ADD', 'EXTRA'].includes(String(customizationType ?? '').toUpperCase());
      const persistedOriginalId = isAddedIngredient ? null : originalId;
      const persistedReplacementId = isAddedIngredient ? (replacementId ?? originalId) : replacementId;
      const persistedProductIngredientId = isAddedIngredient ? null : productIngredientId;
      const hasCustomization = Boolean(
        customizationType ||
          removed ||
          replacementId ||
          additionalCost !== 0 ||
          (Number.isFinite(originalQuantity) && Number.isFinite(ingredientQuantity) && ingredientQuantity !== originalQuantity),
      );

      if (!ingredientId && !productIngredientId) {
        continue;
      }

      if (shouldRecordCustomizations && hasCustomization) {
        await this.queryWithClient(
          client,
          `
            INSERT INTO order_item_customizations (
              store_id, order_item_id, product_ingredient_id, original_ingredient_id,
              replacement_ingredient_id, customization_type, original_ingredient_name,
              replacement_ingredient_name, original_quantity, new_quantity, unit,
              additional_cost, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `,
          [
            storeId,
            orderItemId,
            persistedProductIngredientId,
            persistedOriginalId,
            persistedReplacementId,
            customizationType ?? (removed ? 'REMOVE' : replacementId ? 'REPLACE' : 'CHANGE_QUANTITY'),
            ingredient.original_name ?? ingredient.name ?? null,
            ingredient.replacement_name ?? null,
            Number.isFinite(originalQuantity) ? originalQuantity : null,
            Number.isFinite(ingredientQuantity) ? ingredientQuantity : 0,
            ingredient.unit ?? null,
            additionalCost,
            ingredient.notes ?? null,
          ],
        );
      }

      if (quantity <= 0 || !ingredientId) {
        continue;
      }

      const inventoryRows = await this.queryWithClient<{
        quantity_available: string | number;
        unit: string;
        inventory_item_id: string | null;
        expiryDate: Date | string | null;
      }>(
        client,
        `
          SELECT ii.quantity_available, ii.unit, ii.inventory_item_id, inv."expiryDate"
          FROM ingredients_inventory ii
          LEFT JOIN "InventoryItem" inv ON inv.id = ii.inventory_item_id
          WHERE ii.id = $1
            AND ii.store_id = $2
          FOR UPDATE OF ii
        `,
        [ingredientId, storeId],
      );

      const inventory = inventoryRows[0];
      if (!inventory) {
        throw new NotFoundException('Ingredient was not found for this store.');
      }

      const expiryDate = inventory.expiryDate ? new Date(inventory.expiryDate) : null;
      if (expiryDate && !Number.isNaN(expiryDate.getTime())) {
        expiryDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (expiryDate < today) {
          throw new BadRequestException('Ingredient inventory for this order is expired.');
        }
      }

      if (!inventorySyncSettings.allowNegativeStock && Number(inventory.quantity_available ?? 0) < quantity) {
        throw new BadRequestException('Not enough ingredient inventory for this order.');
      }

      await this.queryWithClient(
        client,
        `
          UPDATE ingredients_inventory
          SET quantity_available = quantity_available - $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
            AND store_id = $3
        `,
        [quantity, ingredientId, storeId],
      );

      if (inventory.inventory_item_id) {
        const invRows = await this.queryWithClient<{ quantity: string | number; unit: string | null; locationId: string; businessId: string }>(
          client,
          `SELECT quantity, unit, "locationId", "businessId" FROM "InventoryItem" WHERE id = $1 FOR UPDATE`,
          [inventory.inventory_item_id],
        );
        const inv = invRows[0];
        if (inv) {
          const previousQuantity = Number(inv.quantity ?? 0);
          const nextQuantity = previousQuantity - quantity;
          const newQuantity = inventorySyncSettings.allowNegativeStock ? nextQuantity : Math.max(nextQuantity, 0);
          await this.queryWithClient(
            client,
            `
              UPDATE "InventoryItem"
              SET quantity = $1,
                  "updatedAt" = CURRENT_TIMESTAMP
              WHERE id = $2
            `,
            [newQuantity, inventory.inventory_item_id],
          );

          movements.push({
            inventoryItemId: inventory.inventory_item_id,
            businessId: inv.businessId,
            locationId: inv.locationId,
            module: 'RESTAURANT',
            unit: inv.unit ?? ingredient.unit ?? null,
            quantity,
            previousQuantity,
            newQuantity,
            movementType: 'RECIPE_CONSUMPTION',
            reason: `Recipe consumption (${ingredient.original_name ?? ingredient.name ?? 'ingredient'})`,
            emitStockMovement: true,
            saleItem: null,
          });
        }
      }

      await this.queryWithClient(
        client,
        `
          INSERT INTO inventory_deductions (
            store_id, order_id, order_item_id, ingredient_id, product_id,
            deduction_type, quantity_deducted, unit
          )
          VALUES ($1, $2, $3, $4, $5, 'RESTAURANT_INGREDIENT_SALE', $6, $7)
        `,
        [storeId, orderId, orderItemId, ingredientId, item.productId ?? item.id ?? null, quantity, ingredient.unit ?? inventory.unit],
      );
    }
    if (shouldRecordCustomizations) {
      await this.recordRestaurantInstructionModifiers(client, storeId, orderItemId, item);
    }
  }

  // Deducts stock and writes the inventory Sale/StockMovement records for an order
  // that is being paid AFTER creation (the deferred-payment path in updatePosOrder).
  // Items/ingredients aren't in the payment request, so they are loaded from the DB.
  // Restaurant deductions replay saved per-item customizations over the default recipe.
  // Idempotent: skips entirely if this order was already mirrored into "Sale".
  private async applyInventoryForPaidPosOrder(
    client: PoolClient,
    user: AuthenticatedUser,
    order: { id: number; order_number: string; total_amount: string | number; subtotal: string | number; discount_amount: string | number; tax_amount: string | number; customer_name: string | null },
    payment: any,
  ) {
    if (!user.store_id || !user.store_type) {
      return;
    }

    const alreadyMirrored = await this.queryWithClient<{ exists: boolean }>(
      client,
      `SELECT EXISTS (SELECT 1 FROM "Sale" WHERE "transactionNumber" = CONCAT('POS-', $1::text)) AS exists`,
      [order.order_number],
    );
    if (alreadyMirrored[0]?.exists) {
      return;
    }

    const inventorySyncSettings = await this.getInventorySyncSettingsForStore(client, user.store_id);
    if (!inventorySyncSettings.autoDeductInventoryOnSale) {
      return;
    }

    const items = await this.queryWithClient<{ id: number; product_id: number; variant_id: number | null; product_name: string; quantity: number; unit_price: string | number }>(
      client,
      `SELECT id, product_id, variant_id, product_name, quantity, unit_price FROM order_items WHERE order_id = $1`,
      [order.id],
    );

    const movements: PosSaleMovement[] = [];
    for (const oi of items) {
      if (user.store_type === 'RETAIL_STORE') {
        if (oi.variant_id == null) continue;
        await this.deductRetailProduct(
          client,
          user.store_id,
          order.id,
          oi.id,
          { name: oi.product_name, price: Number(oi.unit_price ?? 0) },
          oi.product_id,
          oi.variant_id,
          Number(oi.quantity ?? 1),
          movements,
          inventorySyncSettings,
        );
      } else {
        const ingredients = await this.queryWithClient<{
          product_ingredient_id: number;
          ingredient_id: number;
          ingredient_name: string;
          quantity: string | number;
          unit: string | null;
        }>(
          client,
          `
            SELECT id AS product_ingredient_id, ingredient_id, ingredient_name, quantity_required AS quantity, unit
            FROM product_ingredients
            WHERE product_id = $1
              AND store_id = $2
          `,
          [oi.product_id, user.store_id],
        );
        const customizations = await this.queryWithClient<{
          product_ingredient_id: number | null;
          original_ingredient_id: number | null;
          replacement_ingredient_id: number | null;
          customization_type: string;
          original_ingredient_name: string | null;
          replacement_ingredient_name: string | null;
          original_quantity: string | number | null;
          new_quantity: string | number | null;
          unit: string | null;
          additional_cost: string | number | null;
          notes: string | null;
        }>(
          client,
          `
            SELECT product_ingredient_id, original_ingredient_id, replacement_ingredient_id,
                   customization_type, original_ingredient_name, replacement_ingredient_name,
                   original_quantity, new_quantity, unit, additional_cost, notes
            FROM order_item_customizations
            WHERE order_item_id = $1
          `,
          [oi.id],
        );
        const customizedIngredients: any[] = ingredients.map((ingredient) => ({
          product_ingredient_id: ingredient.product_ingredient_id,
          ingredient_id: ingredient.ingredient_id,
          name: ingredient.ingredient_name,
          quantity: Number(ingredient.quantity ?? 0),
          original_quantity: Number(ingredient.quantity ?? 0),
          unit: ingredient.unit,
        }));

        for (const customization of customizations) {
          const type = String(customization.customization_type ?? '').toUpperCase();
          const matchIndex = customizedIngredients.findIndex((ingredient) =>
            (customization.product_ingredient_id && Number(ingredient.product_ingredient_id) === Number(customization.product_ingredient_id)) ||
            (customization.original_ingredient_id && Number(ingredient.ingredient_id) === Number(customization.original_ingredient_id)),
          );
          const newQuantity = Number(customization.new_quantity ?? 0);

          if (type === 'REMOVE' && matchIndex >= 0) {
            customizedIngredients[matchIndex] = {
              ...customizedIngredients[matchIndex],
              removed: true,
              quantity: 0,
              customization_type: 'REMOVE',
              notes: customization.notes ?? undefined,
            };
            continue;
          }

          if (type === 'REPLACE' && matchIndex >= 0) {
            customizedIngredients[matchIndex] = {
              ...customizedIngredients[matchIndex],
              replacement_ingredient_id: customization.replacement_ingredient_id,
              replacement_name: customization.replacement_ingredient_name,
              quantity: Number.isFinite(newQuantity) && newQuantity > 0 ? newQuantity : customizedIngredients[matchIndex].quantity,
              customization_type: 'REPLACE',
              notes: customization.notes ?? undefined,
            };
            continue;
          }

          if ((type === 'CHANGE_QUANTITY' || type === 'QUANTITY_CHANGE') && matchIndex >= 0) {
            customizedIngredients[matchIndex] = {
              ...customizedIngredients[matchIndex],
              quantity: Number.isFinite(newQuantity) ? Math.max(0, newQuantity) : customizedIngredients[matchIndex].quantity,
              customization_type: 'CHANGE_QUANTITY',
              notes: customization.notes ?? undefined,
            };
            continue;
          }

          if ((type === 'ADD' || type === 'EXTRA') && customization.replacement_ingredient_id) {
            customizedIngredients.push({
              product_ingredient_id: null,
              ingredient_id: customization.replacement_ingredient_id,
              name: customization.replacement_ingredient_name ?? 'Added ingredient',
              quantity: Number.isFinite(newQuantity) && newQuantity > 0 ? newQuantity : 1,
              original_quantity: 0,
              unit: customization.unit,
              customization_type: 'ADD',
              additional_price: Number(customization.additional_cost ?? 0),
              notes: customization.notes ?? undefined,
            });
          }
        }
        await this.deductRestaurantIngredients(
          client,
          user.store_id,
          order.id,
          oi.id,
          {
            productId: oi.product_id,
            name: oi.product_name,
            price: Number(oi.unit_price ?? 0),
            quantity: Number(oi.quantity ?? 1),
            ingredients: customizedIngredients,
          },
          movements,
          inventorySyncSettings,
          { recordCustomizations: false },
        );
      }
    }

    await this.writeInventorySaleRecords(client, {
      user,
      orderNumber: order.order_number,
      input: {
        subtotal: order.subtotal,
        discount: order.discount_amount,
        tax: order.tax_amount,
        total: order.total_amount,
        customerName: order.customer_name,
        payment,
      },
      movements,
    });
  }

  // Returns one deducted line's stock: restores the variant/ingredient + the shared
  // InventoryItem and writes a VOID_RESTOCK movement tagged with referenceId (which
  // the caller uses for idempotency). Used by both the whole-order and per-item paths.
  private async reverseDeduction(
    client: PoolClient,
    d: { variant_id: number | null; ingredient_id: number | null; quantity_deducted: string | number; unit: string | null },
    referenceId: string,
    reason: string,
    notes: string,
    module: 'RETAIL' | 'RESTAURANT',
  ) {
    const qty = Number(d.quantity_deducted ?? 0);
    if (qty <= 0) return;

    let inventoryItemId: string | null = null;
    if (d.variant_id != null) {
      await this.queryWithClient(
        client,
        `UPDATE product_variants SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [qty, d.variant_id],
      );
      const vr = await this.queryWithClient<{ inventory_item_id: string | null }>(
        client,
        `SELECT COALESCE(pv.inventory_item_id, p.inventory_item_id) AS inventory_item_id
         FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = $1`,
        [d.variant_id],
      );
      inventoryItemId = vr[0]?.inventory_item_id ?? null;
    } else if (d.ingredient_id != null) {
      await this.queryWithClient(
        client,
        `UPDATE ingredients_inventory SET quantity_available = quantity_available + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [qty, d.ingredient_id],
      );
      const ir = await this.queryWithClient<{ inventory_item_id: string | null }>(
        client,
        `SELECT inventory_item_id FROM ingredients_inventory WHERE id = $1`,
        [d.ingredient_id],
      );
      inventoryItemId = ir[0]?.inventory_item_id ?? null;
    }

    if (!inventoryItemId) return;

    const invRows = await this.queryWithClient<{ quantity: string | number; unit: string | null; locationId: string; businessId: string }>(
      client,
      `SELECT quantity, unit, "locationId", "businessId" FROM "InventoryItem" WHERE id = $1 FOR UPDATE`,
      [inventoryItemId],
    );
    const inv = invRows[0];
    if (!inv) return;

    const previousQuantity = Number(inv.quantity ?? 0);
    const newQuantity = previousQuantity + qty;
    await this.queryWithClient(
      client,
      `UPDATE "InventoryItem" SET quantity = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
      [newQuantity, inventoryItemId],
    );

    await this.queryWithClient(
      client,
      `
        INSERT INTO "StockMovement" (
          id, type, quantity, "previousQuantity", "newQuantity", unit, reason,
          "referenceType", "referenceId", notes, "itemId", "locationId", "businessId",
          module, "createdById"
        )
        VALUES ($1, 'VOID_RESTOCK', $2, $3, $4, $5, $6, 'POS_VOID', $7, $8, $9, $10, $11, $12::"BusinessModule", NULL)
      `,
      [randomUUID(), qty, previousQuantity, newQuantity, inv.unit ?? d.unit, reason, referenceId, notes, inventoryItemId, inv.locationId, inv.businessId, module],
    );
  }

  // Reverses the stock deducted by a paid POS order when it is voided/fully refunded:
  // restores everything in inventory_deductions and marks the mirrored "Sale" REFUNDED.
  // Caller guards on a PAID transition, so re-running is a no-op.
  private async restockVoidedPosOrder(
    client: PoolClient,
    user: AuthenticatedUser,
    order: { id: number; order_number: string },
    newPaymentStatus: string,
    reason: string,
    restock: boolean,
  ) {
    const module = user.store_type === 'RETAIL_STORE' ? 'RETAIL' : 'RESTAURANT';

    // Whether stock goes back depends on the caller's decision (per-refund choice or
    // store-type default). When false, the deductions stand as a loss and only the
    // money is reversed (Sale -> REFUNDED below).
    const deductions = restock
      ? await this.queryWithClient<{ variant_id: number | null; ingredient_id: number | null; quantity_deducted: string | number; unit: string | null }>(
          client,
          `SELECT variant_id, ingredient_id, quantity_deducted, unit FROM inventory_deductions WHERE order_id = $1`,
          [order.id],
        )
      : [];

    for (const d of deductions) {
      await this.reverseDeduction(client, d, order.order_number, reason, `POS order ${order.order_number} ${newPaymentStatus}`, module);
    }

    // Reflect the reversal on the mirrored sale (SaleStatus has no VOID value, so a
    // POS void and a full refund both map to REFUNDED).
    await this.queryWithClient(
      client,
      `UPDATE "Sale" SET status = 'REFUNDED', "refundReason" = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "transactionNumber" = CONCAT('POS-', $2::text)`,
      [reason, order.order_number],
    );
  }

  // Restocks specific line items of a paid order for retail. Restaurant refunds keep
  // ingredients consumed, so selected dishes are reported as refunded without stock return.
  private async restockPosOrderItems(
    client: PoolClient,
    user: AuthenticatedUser,
    order: { id: number; order_number: string },
    orderItemIds: number[],
    saleStatus: 'REFUNDED' | 'PARTIAL_REFUND',
    reason: string,
  ) {
    if (user.store_type === 'RETAIL_STORE') {
      for (const orderItemId of orderItemIds) {
        const referenceId = `POS-${order.order_number}-item-${orderItemId}`;
        const already = await this.queryWithClient<{ exists: boolean }>(
          client,
          `SELECT EXISTS (SELECT 1 FROM "StockMovement" WHERE "referenceType" = 'POS_VOID' AND "referenceId" = $1) AS exists`,
          [referenceId],
        );
        if (already[0]?.exists) continue;

        const deductions = await this.queryWithClient<{ variant_id: number | null; ingredient_id: number | null; quantity_deducted: string | number; unit: string | null }>(
          client,
          `SELECT variant_id, ingredient_id, quantity_deducted, unit FROM inventory_deductions WHERE order_id = $1 AND order_item_id = $2`,
          [order.id, orderItemId],
        );
        for (const d of deductions) {
          await this.reverseDeduction(client, d, referenceId, reason, `POS order ${order.order_number} item ${orderItemId} refunded`, 'RETAIL');
        }
      }
    }

    await this.queryWithClient(
      client,
      `UPDATE "Sale"
       SET status = CASE WHEN status = 'REFUNDED' THEN 'REFUNDED' ELSE $1::"SaleStatus" END,
           "refundReason" = $2, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "transactionNumber" = CONCAT('POS-', $3::text)`,
      [saleStatus, reason, order.order_number],
    );
  }

  // Mirrors a paid POS order into the inventory module's reporting/ledger tables
  // so POS sales show up in the inventory "Sale" list and "StockMovement" history.
  // Retail products become "SaleItem" rows + SALE movements; restaurant orders
  // record RECIPE_CONSUMPTION movements for each consumed ingredient. Runs inside
  // the order transaction and no-ops when no inventory-linked items were deducted.
  private async writeInventorySaleRecords(
    client: PoolClient,
    params: { user: AuthenticatedUser; orderNumber: string; input: any; movements: PosSaleMovement[] },
  ) {
    const { user, orderNumber, input, movements } = params;
    if (movements.length === 0) {
      return;
    }

    const businessId = movements[0].businessId;
    const locationId = movements[0].locationId;
    const module = user.store_type === 'RETAIL_STORE' ? 'RETAIL' : 'RESTAURANT';
    const total = Number(input.total ?? 0);
    const paymentMethod = input.payment?.method ?? 'Cash';
    const amountPaid = Number(input.payment?.amountPaid ?? total);
    const change = Number(input.payment?.changeAmount ?? 0);
    const transactionNumber = `POS-${orderNumber}`;
    const existingSale = await this.queryWithClient<{ id: string }>(
      client,
      `
        SELECT id
        FROM "Sale"
        WHERE "businessId" = $1
          AND "transactionNumber" = $2
        LIMIT 1
      `,
      [businessId, transactionNumber],
    );

    if (existingSale.length > 0) {
      return;
    }

    const saleId = randomUUID();
    await this.queryWithClient(
      client,
      `
        INSERT INTO "Sale" (
          id, "transactionNumber", "locationId", "cashierId", subtotal, discount, tax,
          total, "paymentMethod", "amountPaid", change, customer, status, "businessId",
          module, "updatedAt"
        )
        VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, 'COMPLETED', $12, $13::"BusinessModule", CURRENT_TIMESTAMP)
      `,
      [
        saleId,
        transactionNumber,
        locationId,
        Number(input.subtotal ?? 0),
        Number(input.discount ?? 0),
        Number(input.tax ?? 0),
        total,
        paymentMethod,
        amountPaid,
        change,
        input.customerName ?? null,
        businessId,
        module,
      ],
    );

    for (const movement of movements) {
      if (movement.saleItem) {
        await this.queryWithClient(
          client,
          `
            INSERT INTO "SaleItem" (id, "saleId", "inventoryItemId", name, quantity, "unitPrice", "totalPrice")
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            randomUUID(),
            saleId,
            movement.inventoryItemId,
            movement.saleItem.name,
            movement.saleItem.quantity,
            movement.saleItem.unitPrice,
            movement.saleItem.totalPrice,
          ],
        );
      }

      if (!movement.emitStockMovement) {
        continue;
      }

      await this.queryWithClient(
        client,
        `
          INSERT INTO "StockMovement" (
            id, type, quantity, "previousQuantity", "newQuantity", unit, reason,
            "referenceType", "referenceId", notes, "itemId", "locationId", "businessId",
            module, "createdById"
          )
          VALUES ($1, $2::"StockMovementType", $3, $4, $5, $6, $7, 'POS_SALE', $8, $9, $10, $11, $12, $13::"BusinessModule", NULL)
        `,
        [
          randomUUID(),
          movement.movementType,
          movement.quantity,
          movement.previousQuantity,
          movement.newQuantity,
          movement.unit,
          movement.reason,
          saleId,
          `POS order ${orderNumber}`,
          movement.inventoryItemId,
          movement.locationId,
          movement.businessId,
          movement.module,
        ],
      );
    }
  }

  private async createUniqueOrderNumber(client: PoolClient, requestedOrderNumber: unknown) {
    await client.query('LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE');
    await client.query('LOCK TABLE "Sale" IN SHARE ROW EXCLUSIVE MODE');

    const requestedDigits = String(requestedOrderNumber ?? '').replace(/\D/g, '');
    const requestedNumeric = requestedDigits ? Number(requestedDigits) : null;
    const maxRows = await this.queryWithClient<{ max_order_number: string | number | null }>(
      client,
      `
        SELECT COALESCE(MAX(order_number), 100000) AS max_order_number
        FROM (
          SELECT NULLIF(regexp_replace(order_number, '\\D', '', 'g'), '')::BIGINT AS order_number
          FROM orders

          UNION ALL

          SELECT NULLIF(regexp_replace("transactionNumber", '\\D', '', 'g'), '')::BIGINT AS order_number
          FROM "Sale"
          WHERE "transactionNumber" LIKE 'POS-%'
        ) used_numbers
      `,
    );
    const maxOrderNumber = Number(maxRows[0]?.max_order_number ?? 100000);
    let candidate = Math.max(
      Number.isFinite(requestedNumeric) && requestedNumeric ? requestedNumeric : 100001,
      Number.isFinite(maxOrderNumber) ? maxOrderNumber + 1 : 100001,
    );

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidateText = String(candidate).padStart(6, '0');
      const existing = await this.queryWithClient<{ id: number }>(
        client,
        `
          SELECT id
          FROM orders
          WHERE regexp_replace(order_number, '\\D', '', 'g') = $1
          UNION ALL
          SELECT 1 AS id
          FROM "Sale"
          WHERE "transactionNumber" = CONCAT('POS-', $1::text)
          LIMIT 1
        `,
        [candidateText],
      );

      if (existing.length === 0) {
        return candidateText;
      }

      candidate += 1;
    }

    return String(Date.now());
  }

  private async createUniquePaymentNumber(client: PoolClient, requestedPaymentNumber: unknown) {
    const basePaymentNumber = String(requestedPaymentNumber ?? '').trim() || `PAY-${Date.now()}`;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? basePaymentNumber : `${basePaymentNumber}-${attempt + 1}`;
      const existing = await this.queryWithClient<{ id: number }>(
        client,
        `
          SELECT id
          FROM payments
          WHERE payment_number = $1
          LIMIT 1
        `,
        [candidate],
      );

      if (existing.length === 0) {
        return candidate;
      }
    }

    return `${basePaymentNumber}-${Date.now()}`;
  }

  private async ensureStoreInformationRow(storeId: number, fallbackStoreName: string | null, client?: PoolClient) {
    const sql = `
      INSERT INTO store_information (
        store_id,
        business_name,
        business_description,
        address,
        contact_number,
        email,
        receipt_thank_you_message,
        receipt_footer_message,
        operating_hours,
        currency,
        theme_color,
        tax_rate,
        service_charge_rate
      )
      SELECT
        $1,
        $2,
        'Your one-stop shop for quality ukay-ukay finds! We offer affordable and stylish pre-loved items for the whole family.',
        '123 Sampaguita St., Barangay Guadalupe, Cebu City, Cebu, Philippines',
        '0917 123 4567',
        'ukayhub.main@gmail.com',
        'Thank you for shopping with us!',
        'We appreciate your support. Come again!',
        'Mon-Sun, 9:00 AM - 8:00 PM',
        'PHP',
        '#008967',
        0,
        0
      WHERE NOT EXISTS (
        SELECT 1 FROM store_information WHERE store_id = $1
      )
    `;
    const params = [storeId, fallbackStoreName ?? 'Ukay Hub - Main Branch'];

    if (client) {
      await this.queryWithClient(client, sql, params);
      return;
    }

    await this.query(
      `
        ${sql}
      `,
      params,
    );
  }

  private async ensureStoreSettingsRow(storeId: number, storeType: string | null) {
    await this.ensureStoreSettingsSchema();

    await this.query(
      `
        INSERT INTO store_settings (
          store_id,
          store_type,
          enable_customer_recommendation,
          enable_table_management,
          enable_refund,
          enable_void,
          enable_discount,
          enable_estimated_prep_time,
          prep_time_strategy,
          customization_prep_time_minutes,
          enable_service_charge,
          service_charge_rate,
          service_charge_percentage,
          enable_tax,
          tax_rate,
          enable_dine_in,
          enable_takeout,
          enable_ingredient_customization,
          enable_receipt_printing,
          enabled_payment_methods,
          payment_method_accounts,
          auto_deduct_inventory_on_sale,
          allow_negative_stock,
          default_low_stock_threshold,
          default_inventory_unit,
          cycle_count_interval_days,
          auto_reorder_threshold_percent,
          enable_expiry_tracking,
          default_markup_percent
        )
        VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'parallel', 2, TRUE, 0, 0, TRUE, 0, TRUE, TRUE, TRUE, TRUE, ARRAY['Cash', 'GCash', 'Maya', 'Bank Transfer']::TEXT[], '{}'::JSONB, TRUE, FALSE, 3, 'unit', 30, 20, FALSE, 30)
        ON CONFLICT (store_id) DO UPDATE
        SET store_type = COALESCE(store_settings.store_type, EXCLUDED.store_type),
            service_charge_rate = COALESCE(store_settings.service_charge_rate, store_settings.service_charge_percentage, 0),
            service_charge_percentage = COALESCE(store_settings.service_charge_percentage, store_settings.service_charge_rate, 0),
            enabled_payment_methods = COALESCE(store_settings.enabled_payment_methods, EXCLUDED.enabled_payment_methods),
            payment_method_accounts = COALESCE(store_settings.payment_method_accounts, EXCLUDED.payment_method_accounts),
            auto_deduct_inventory_on_sale = COALESCE(store_settings.auto_deduct_inventory_on_sale, EXCLUDED.auto_deduct_inventory_on_sale),
            allow_negative_stock = COALESCE(store_settings.allow_negative_stock, EXCLUDED.allow_negative_stock),
            default_low_stock_threshold = COALESCE(store_settings.default_low_stock_threshold, EXCLUDED.default_low_stock_threshold),
            default_inventory_unit = COALESCE(store_settings.default_inventory_unit, EXCLUDED.default_inventory_unit),
            cycle_count_interval_days = COALESCE(store_settings.cycle_count_interval_days, EXCLUDED.cycle_count_interval_days),
            auto_reorder_threshold_percent = COALESCE(store_settings.auto_reorder_threshold_percent, EXCLUDED.auto_reorder_threshold_percent),
            enable_expiry_tracking = COALESCE(store_settings.enable_expiry_tracking, EXCLUDED.enable_expiry_tracking),
            default_markup_percent = COALESCE(store_settings.default_markup_percent, EXCLUDED.default_markup_percent),
            updated_at = CURRENT_TIMESTAMP
      `,
      [storeId, storeType],
    );
  }

  private async ensureStoreSettingsSchema() {
    await this.query(
      `
        ALTER TABLE store_settings
          ADD COLUMN IF NOT EXISTS store_type VARCHAR(50),
          ADD COLUMN IF NOT EXISTS enable_customer_recommendation BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS enable_table_management BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS enable_refund BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS enable_void BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS enable_discount BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS enable_estimated_prep_time BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS prep_time_strategy VARCHAR(20) DEFAULT 'parallel',
          ADD COLUMN IF NOT EXISTS customization_prep_time_minutes INT DEFAULT 2,
          ADD COLUMN IF NOT EXISTS enable_service_charge BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS service_charge_rate DECIMAL(5,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS service_charge_percentage DECIMAL(5,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS enable_tax BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS enable_dine_in BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS enable_takeout BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS enable_ingredient_customization BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS enable_receipt_printing BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS enabled_payment_methods TEXT[] DEFAULT ARRAY['Cash', 'GCash', 'Maya', 'Bank Transfer'],
          ADD COLUMN IF NOT EXISTS payment_method_accounts JSONB DEFAULT '{}'::JSONB,
          ADD COLUMN IF NOT EXISTS auto_deduct_inventory_on_sale BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS default_low_stock_threshold INTEGER DEFAULT 3,
          ADD COLUMN IF NOT EXISTS default_inventory_unit VARCHAR(50) DEFAULT 'unit',
          ADD COLUMN IF NOT EXISTS cycle_count_interval_days INTEGER DEFAULT 30,
          ADD COLUMN IF NOT EXISTS auto_reorder_threshold_percent DECIMAL(5,2) DEFAULT 20,
          ADD COLUMN IF NOT EXISTS enable_expiry_tracking BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS default_markup_percent DECIMAL(5,2) DEFAULT 30,
          ADD COLUMN IF NOT EXISTS theme_mode VARCHAR(20) DEFAULT 'basic',
          ADD COLUMN IF NOT EXISTS theme_preset VARCHAR(50) DEFAULT 'default',
          ADD COLUMN IF NOT EXISTS appearance VARCHAR(20) DEFAULT 'light',
          ADD COLUMN IF NOT EXISTS primary_color VARCHAR(20) DEFAULT '#008967',
          ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(20) DEFAULT '#005656',
          ADD COLUMN IF NOT EXISTS sidebar_color VARCHAR(20) DEFAULT '#0f172a',
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `,
    );
  }

  private async ensureUserAuthTokenColumns() {
    await this.query(
      `
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT,
          ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS reset_token_hash TEXT,
          ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ
      `,
    );
  }

  private async ensureUserPreferencesSchema() {
    await this.query(
      `
        CREATE TABLE IF NOT EXISTS user_preferences (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          compact_mode BOOLEAN NOT NULL DEFAULT FALSE,
          low_stock_alerts BOOLEAN NOT NULL DEFAULT TRUE,
          default_workspace VARCHAR(20) NOT NULL DEFAULT 'pos',
          theme_mode VARCHAR(20) NOT NULL DEFAULT 'basic',
          theme_preset VARCHAR(50) DEFAULT 'default',
          appearance VARCHAR(20) NOT NULL DEFAULT 'light',
          primary_color VARCHAR(20) NOT NULL DEFAULT '#008967',
          secondary_color VARCHAR(20) NOT NULL DEFAULT '#005656',
          sidebar_color VARCHAR(20) NOT NULL DEFAULT '#0f172a',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
    );
  }

  private async getStoreThemePreferences(storeId: number, storeType: string | null): Promise<StoreThemePreferences | null> {
    await this.ensureStoreSettingsRow(storeId, storeType);

    const rows = await this.query<StoreThemePreferences>(
      `
        SELECT
          theme_mode,
          theme_preset,
          appearance,
          primary_color,
          secondary_color,
          sidebar_color,
          updated_at
        FROM store_settings
        WHERE store_id = $1
          AND (store_type = $2 OR store_type IS NULL)
        LIMIT 1
      `,
      [storeId, storeType],
    );

    return rows[0] ?? null;
  }

  private normalizeUserPreferences(input: Partial<UserPreferences> | null | undefined): UserPreferences {
    const theme = this.normalizeThemePreferences(input);

    return {
      compact_mode: Boolean(input?.compact_mode ?? false),
      low_stock_alerts: input?.low_stock_alerts === undefined || input?.low_stock_alerts === null ? true : Boolean(input.low_stock_alerts),
      default_workspace: input?.default_workspace === 'inventory' || input?.default_workspace === 'reports' ? input.default_workspace : 'pos',
      ...theme,
    };
  }

  private normalizeThemePreferences(input: Partial<ThemePreferences> | null | undefined): ThemePreferences {
    return {
      theme_mode: input?.theme_mode === 'advanced' ? 'advanced' : 'basic',
      theme_preset: typeof input?.theme_preset === 'string' && input.theme_preset.trim() ? input.theme_preset : DEFAULT_THEME_PREFERENCES.theme_preset,
      appearance: input?.appearance === 'system' || input?.appearance === 'dark' ? input.appearance : 'light',
      primary_color: this.normalizeHexColor(input?.primary_color, DEFAULT_THEME_PREFERENCES.primary_color),
      secondary_color: this.normalizeHexColor(input?.secondary_color, DEFAULT_THEME_PREFERENCES.secondary_color),
      sidebar_color: this.normalizeHexColor(input?.sidebar_color, DEFAULT_THEME_PREFERENCES.sidebar_color),
    };
  }

  private normalizeHexColor(value: unknown, fallback: string) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }

  private async ensurePosOrderSchema() {
    await this.query(
      `
        CREATE TABLE IF NOT EXISTS ingredients_inventory (
          id BIGSERIAL PRIMARY KEY,
          store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
          ingredient_name VARCHAR(150) NOT NULL,
          quantity_available DECIMAL(12,3) NOT NULL DEFAULT 0,
          unit VARCHAR(50) NOT NULL DEFAULT 'pcs',
          low_stock_limit DECIMAL(12,3) DEFAULT 0,
          cost_per_unit DECIMAL(10,2) DEFAULT 0,
          is_available BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
    );
    await this.query(
      `
        CREATE TABLE IF NOT EXISTS product_ingredients (
          id BIGSERIAL PRIMARY KEY,
          store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
          product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
          ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE SET NULL,
          ingredient_name VARCHAR(150) NOT NULL,
          quantity_required DECIMAL(10,3) DEFAULT 0,
          default_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
          unit VARCHAR(50) NOT NULL DEFAULT 'pcs',
          additional_cost DECIMAL(10,2) DEFAULT 0,
          is_required BOOLEAN DEFAULT TRUE,
          is_removable BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
    );
    await this.query(
      `
        CREATE TABLE IF NOT EXISTS ingredient_alternatives (
          id BIGSERIAL PRIMARY KEY,
          store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
          product_ingredient_id BIGINT REFERENCES product_ingredients(id) ON DELETE CASCADE,
          parent_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE CASCADE,
          alternative_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE CASCADE,
          alternative_name VARCHAR(150) NOT NULL DEFAULT '',
          default_quantity DECIMAL(10,2),
          unit VARCHAR(50),
          additional_cost DECIMAL(10,2) DEFAULT 0,
          is_available BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
    );
    await this.query(
      `
        ALTER TABLE product_ingredients
          ADD COLUMN IF NOT EXISTS ingredient_id BIGINT,
          ADD COLUMN IF NOT EXISTS quantity_required DECIMAL(10,3) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS default_quantity DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'pcs',
          ADD COLUMN IF NOT EXISTS additional_cost DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS is_removable BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS recipe_ingredient_id TEXT
      `,
    );
    await this.query(
      `
        ALTER TABLE orders
          ADD COLUMN IF NOT EXISTS party_size INT,
          ADD COLUMN IF NOT EXISTS table_name VARCHAR(50),
          ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS discount_type VARCHAR(100),
          ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS service_charge DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS payment_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS preparing_started_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS service_started_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS served_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS service_duration BIGINT,
          ADD COLUMN IF NOT EXISTS estimated_prep_minutes INT,
          ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS table_started_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS table_ended_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS running_time_start TIMESTAMP,
          ADD COLUMN IF NOT EXISTS running_time_end TIMESTAMP,
          ADD COLUMN IF NOT EXISTS running_duration BIGINT,
          ADD COLUMN IF NOT EXISTS is_running BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `,
    );
    await this.query(
      `
        UPDATE orders
        SET ordered_at = COALESCE(running_time_start, preparing_started_at, created_at)
        WHERE ordered_at IS NULL
          AND order_type <> 'RETAIL'
          AND COALESCE(running_time_start, preparing_started_at, created_at) IS NOT NULL
      `,
    );
    await this.query(
      `
        ALTER TABLE order_items
          ADD COLUMN IF NOT EXISTS variant_id BIGINT,
          ADD COLUMN IF NOT EXISTS category_name VARCHAR(100),
          ADD COLUMN IF NOT EXISTS size VARCHAR(50),
          ADD COLUMN IF NOT EXISTS color VARCHAR(50),
          ADD COLUMN IF NOT EXISTS item_type VARCHAR(50),
          ADD COLUMN IF NOT EXISTS notes TEXT,
          ADD COLUMN IF NOT EXISTS prep_time_minutes INT,
          ADD COLUMN IF NOT EXISTS customization_prep_minutes INT DEFAULT 0,
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `,
    );
    await this.query(
      `
        CREATE TABLE IF NOT EXISTS order_item_customizations (
          id BIGSERIAL PRIMARY KEY,
          store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
          order_item_id BIGINT REFERENCES order_items(id) ON DELETE CASCADE,
          product_ingredient_id BIGINT REFERENCES product_ingredients(id) ON DELETE SET NULL,
          ingredient_alternative_id BIGINT REFERENCES ingredient_alternatives(id) ON DELETE SET NULL,
          original_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE SET NULL,
          replacement_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE SET NULL,
          customization_type VARCHAR(50) NOT NULL,
          original_ingredient_name VARCHAR(150),
          replacement_ingredient_name VARCHAR(150),
          original_quantity DECIMAL(10,2),
          new_quantity DECIMAL(10,2),
          unit VARCHAR(50),
          additional_cost DECIMAL(10,2) DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
    );
    await this.query(
      `
        ALTER TABLE order_item_customizations
          ADD COLUMN IF NOT EXISTS store_id BIGINT,
          ADD COLUMN IF NOT EXISTS product_ingredient_id BIGINT,
          ADD COLUMN IF NOT EXISTS ingredient_alternative_id BIGINT,
          ADD COLUMN IF NOT EXISTS original_ingredient_id BIGINT,
          ADD COLUMN IF NOT EXISTS replacement_ingredient_id BIGINT,
          ADD COLUMN IF NOT EXISTS original_ingredient_name VARCHAR(150),
          ADD COLUMN IF NOT EXISTS replacement_ingredient_name VARCHAR(150),
          ADD COLUMN IF NOT EXISTS original_quantity DECIMAL(10,2),
          ADD COLUMN IF NOT EXISTS new_quantity DECIMAL(10,2),
          ADD COLUMN IF NOT EXISTS unit VARCHAR(50),
          ADD COLUMN IF NOT EXISTS additional_cost DECIMAL(10,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS notes TEXT,
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `,
    );
    await this.query(`ALTER TABLE order_item_customizations ALTER COLUMN product_ingredient_id DROP NOT NULL`);
    await this.query(`ALTER TABLE order_item_customizations ALTER COLUMN ingredient_alternative_id DROP NOT NULL`);
    await this.query(`ALTER TABLE order_item_customizations ALTER COLUMN original_ingredient_id DROP NOT NULL`);
    await this.query(`ALTER TABLE order_item_customizations ALTER COLUMN replacement_ingredient_id DROP NOT NULL`);
    await this.query(
      `
        DO $$
        DECLARE constraint_row RECORD;
        BEGIN
          FOR constraint_row IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'order_item_customizations'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%customization_type%'
          LOOP
            EXECUTE format('ALTER TABLE order_item_customizations DROP CONSTRAINT %I', constraint_row.conname);
          END LOOP;
          EXECUTE $constraint$
            ALTER TABLE order_item_customizations
            ADD CONSTRAINT order_item_customizations_type_check
            CHECK (customization_type IN (
              'REMOVE', 'ADD', 'EXTRA', 'CHANGE_QUANTITY', 'QUANTITY_CHANGE',
              'REPLACE', 'NOTE', 'SPECIAL_INSTRUCTION'
            ))
          $constraint$;
        END $$
      `,
    );
  }

  // Optional deterministic link from a POS store to a specific inventory Business.
  // When set, it overrides the email/most-items heuristic used to resolve which
  // business backs a store's POS catalog and sales.
  private async ensureStoreInventoryLink(client?: PoolClient) {
    const sql = `ALTER TABLE stores ADD COLUMN IF NOT EXISTS inventory_business_id TEXT`;
    if (client) {
      await this.queryWithClient(client, sql);
    } else {
      await this.query(sql);
    }
  }

  private async ensureDefaultDiscountSettings(storeId: number) {
    await this.query(
      `
        INSERT INTO discount_settings (store_id, discount_name, discount_rate, is_enabled)
        SELECT $1, seed.discount_name, seed.discount_rate, TRUE
        FROM (
          VALUES
            ('PWD', 20),
            ('Senior Citizen', 20),
            ('Promo Discount', 10),
            ('Custom Discount', 0)
        ) AS seed(discount_name, discount_rate)
        WHERE NOT EXISTS (
          SELECT 1
          FROM discount_settings ds
          WHERE ds.store_id = $1
        )
      `,
      [storeId],
    );
  }

  private async getUserStoreScope(userId: number): Promise<AuthenticatedUser> {
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    const storeColumns = this.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for store scoping.');
    }

    const storeJoin = userColumns.storeIdColumn && storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.quoteIdentifier(userColumns.storeIdColumn)} LEFT JOIN store_information si ON si.store_id = s.id` : '';
    const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.normalizedStoreTypeSql(`s.${this.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : 'NULL AS store_type';
    const storeNameSelect = storeJoin
      ? storeColumns.storeNameColumn
        ? `COALESCE(si.business_name, s.${this.quoteIdentifier(storeColumns.storeNameColumn)}) AS store_name`
        : 'si.business_name AS store_name'
      : 'NULL AS store_name';

    const rows = await this.query<AuthenticatedUser>(
      `
        SELECT
          u.id,
          u.${this.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          u.email,
          u.${this.quoteIdentifier(userColumns.roleColumn)} AS role,
          ${userColumns.storeIdColumn ? `u.${this.quoteIdentifier(userColumns.storeIdColumn)} AS store_id` : 'NULL AS store_id'},
          ${userColumns.staffTypeColumn ? `u.${this.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type` : 'NULL AS staff_type'},
          ${storeTypeSelect},
          ${storeNameSelect}
        FROM users u
        ${storeJoin}
        WHERE u.id = $1
        LIMIT 1
      `,
      [userId],
    );

    if (rows.length === 0) {
      throw new InternalServerErrorException('User account was not found.');
    }

    return rows[0];
  }

  async listActivityLogsForUser(input: {
    userId: number;
    dateFrom?: string;
    dateTo?: string;
    actorUserId?: number;
    module?: string;
    action?: string;
    search?: string;
  }) {
    const requester = await this.getUserStoreScope(input.userId);
    const role = String(requester.role ?? '');
    const canViewAll = role === 'SUPERADMIN';
    const canViewStore = role === 'ADMIN' || role === 'POS_MANAGER' || role === 'POS_ADMIN';

    if (!canViewAll && (!canViewStore || !requester.store_id || !['RESTAURANT', 'RETAIL_STORE'].includes(String(requester.store_type)))) {
      throw new ForbiddenException('Only Superadmin, Store Admin, and POS Manager accounts can view activity logs.');
    }

    await this.ensureActivityLogSchema();

    const conditions: string[] = [];
    const values: unknown[] = [];
    const addValue = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (!canViewAll) {
      conditions.push(`store_id = ${addValue(requester.store_id)}`);
    }
    if (input.dateFrom?.trim()) {
      conditions.push(`created_at >= (${addValue(input.dateFrom.trim())}::date::timestamp - INTERVAL '8 hours')`);
    }
    if (input.dateTo?.trim()) {
      conditions.push(`created_at < (${addValue(input.dateTo.trim())}::date::timestamp + INTERVAL '1 day' - INTERVAL '8 hours')`);
    }
    if (Number.isFinite(input.actorUserId) && Number(input.actorUserId) > 0) {
      conditions.push(`user_id = ${addValue(Number(input.actorUserId))}`);
    }
    if (input.module?.trim()) {
      conditions.push(`module = ${addValue(input.module.trim())}`);
    }
    if (input.action?.trim()) {
      conditions.push(`action = ${addValue(input.action.trim())}`);
    }
    if (input.search?.trim()) {
      const param = addValue(`%${input.search.trim()}%`);
      conditions.push(`(user_name ILIKE ${param} OR user_role ILIKE ${param} OR module ILIKE ${param} OR action ILIKE ${param} OR details ILIKE ${param})`);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.query(
      `
        SELECT id, store_id, user_id, user_name, user_role, module, action, details, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
        FROM activity_logs
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT 500
      `,
      values,
    );
  }

  async recordActivityForUser(userId: number, module: ActivityModule | string, action: string, details: string) {
    try {
      const user = await this.getUserStoreScope(userId);
      await this.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module,
        action,
        details,
      });
    } catch {
      return;
    }
  }

  async recordActivity(input: ActivityLogInput) {
    try {
      await this.ensureActivityLogSchema();
      await this.query(
        `
          INSERT INTO activity_logs (store_id, user_id, user_name, user_role, module, action, details, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        `,
        [
          input.storeId ?? null,
          input.userId ?? null,
          input.userName ?? 'System',
          input.userRole ?? 'System',
          input.module,
          input.action,
          input.details,
        ],
      );
    } catch {
      return;
    }
  }

  private async ensureActivityLogSchema() {
    await this.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id BIGSERIAL PRIMARY KEY,
        store_id BIGINT NULL,
        user_id BIGINT NULL,
        user_name TEXT NOT NULL,
        user_role TEXT NOT NULL,
        module TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      )
    `);
    await this.query(`ALTER TABLE activity_logs ALTER COLUMN created_at SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`);
    await this.query(`CREATE INDEX IF NOT EXISTS activity_logs_store_created_idx ON activity_logs(store_id, created_at DESC)`);
    await this.query(`CREATE INDEX IF NOT EXISTS activity_logs_user_created_idx ON activity_logs(user_id, created_at DESC)`);
    await this.query(`CREATE INDEX IF NOT EXISTS activity_logs_module_idx ON activity_logs(module)`);
  }

  private async getSchemaColumns(): Promise<SchemaColumns> {
    if (this.schemaColumns) {
      return this.schemaColumns;
    }

    const columns = await this.query<ColumnInfo & { table_name: string }>(
      `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'stores')
      `,
    );
    const users = columns.filter((column) => column.table_name === 'users');
    const stores = columns.filter((column) => column.table_name === 'stores');

    this.schemaColumns = {
      users: new Set(users.map((column) => column.column_name.toLowerCase())),
      stores: new Set(stores.map((column) => column.column_name.toLowerCase())),
    };

    return this.schemaColumns;
  }

  private resolveUserColumns(columns: Set<string>) {
    const pick = (candidates: string[]) => candidates.find((candidate) => columns.has(candidate.toLowerCase())) ?? null;

    return {
      fullNameColumn: pick(['full_name', 'fullname', 'name']),
      roleColumn: pick(['role']),
      storeIdColumn: pick(['store_id']),
      staffTypeColumn: pick(['staff_type']),
      passwordColumn: pick(['hashed_password', 'password_hash', 'password']),
      voidPinHashColumn: pick(['void_pin_hash']),
      voidPinColumn: pick(['void_pin']),
      statusColumn: pick(['status']),
      activeColumn: pick(['is_active']),
    };
  }

  private async ensureVoidPinHashColumn() {
    await this.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS void_pin_hash TEXT,
      ADD COLUMN IF NOT EXISTS void_pin TEXT
    `);
    this.schemaColumns = null;
  }

  private async assertUniqueRetailVoidPin(storeId: number | null, voidPin: string, excludeUserId?: number) {
    if (!storeId) {
      throw new BadRequestException('Store scope is required for Unique PIN setup.');
    }

    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    if (!userColumns.roleColumn || !userColumns.storeIdColumn || !userColumns.voidPinHashColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for Unique PIN setup.');
    }

    const values: unknown[] = [storeId];
    const excludeSql = excludeUserId ? 'AND id <> $2' : '';
    if (excludeUserId) values.push(excludeUserId);

    const voidPinSelect = userColumns.voidPinColumn ? `, ${this.quoteIdentifier(userColumns.voidPinColumn)} AS void_pin` : ', NULL AS void_pin';
    const rows = await this.query<{ void_pin_hash: string | null; void_pin: string | null }>(
      `
        SELECT ${this.quoteIdentifier(userColumns.voidPinHashColumn)} AS void_pin_hash
          ${voidPinSelect}
        FROM users
        WHERE ${this.quoteIdentifier(userColumns.storeIdColumn)} = $1
          AND ${this.quoteIdentifier(userColumns.roleColumn)} IN ('POS_MANAGER', 'POS_ADMIN')
          AND (${this.quoteIdentifier(userColumns.voidPinHashColumn)} IS NOT NULL${userColumns.voidPinColumn ? ` OR ${this.quoteIdentifier(userColumns.voidPinColumn)} IS NOT NULL` : ''})
          ${excludeSql}
      `,
      values,
    );

    for (const row of rows) {
      if (row.void_pin === voidPin || (row.void_pin_hash && await bcrypt.compare(voidPin, row.void_pin_hash))) {
        throw new ConflictException('This Unique PIN is already assigned to another retail POS manager.');
      }
    }
  }

  private async generateUniqueRetailVoidPin(storeId: number | null, excludeUserId?: number) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const pin = String(randomInt(100000, 1000000));
      try {
        await this.assertUniqueRetailVoidPin(storeId, pin, excludeUserId);
        return pin;
      } catch (error) {
        if (error instanceof ConflictException) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException('Unable to generate a unique retail manager PIN. Please try again.');
  }

  async verifyRetailVoidPin(input: { userId: number; voidPin: string }) {
    const requester = await this.getUserStoreScope(input.userId);
    if (requester.store_type !== 'RETAIL_STORE' || !requester.store_id) {
      throw new ForbiddenException('Unique PIN authorization is only available for retail stores.');
    }
    if (!input.voidPin?.trim()) {
      throw new BadRequestException('Unique PIN is required.');
    }

    await this.ensureVoidPinHashColumn();
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.storeIdColumn || !userColumns.voidPinHashColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for Unique PIN authorization.');
    }

    const rows = await this.query<{ id: number; full_name: string; email: string; role: string; void_pin_hash: string }>(
      `
        SELECT
          id,
          ${this.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          email,
          ${this.quoteIdentifier(userColumns.roleColumn)} AS role,
          ${this.quoteIdentifier(userColumns.voidPinHashColumn)} AS void_pin_hash
        FROM users u
        WHERE ${this.quoteIdentifier(userColumns.storeIdColumn)} = $1
          AND ${this.quoteIdentifier(userColumns.roleColumn)} IN ('POS_MANAGER', 'POS_ADMIN')
          AND ${this.quoteIdentifier(userColumns.voidPinHashColumn)} IS NOT NULL
          ${this.activeUsersWhereClause(userColumns)}
      `,
      [requester.store_id],
    );

    for (const row of rows) {
      if (await bcrypt.compare(input.voidPin.trim(), row.void_pin_hash)) {
        await this.recordActivity({
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

  async verifyPosManagerPin(input: { userId: number; voidPin: string; action?: string }) {
    const requester = await this.getUserStoreScope(input.userId);
    if (!requester.store_id) {
      throw new ForbiddenException('Store scope is required for manager PIN authorization.');
    }
    if (!input.voidPin?.trim()) {
      throw new BadRequestException('Manager PIN is required.');
    }

    await this.ensureVoidPinHashColumn();
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.storeIdColumn || !userColumns.voidPinHashColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for manager PIN authorization.');
    }

    const rows = await this.query<{ id: number; full_name: string; email: string; role: string; void_pin_hash: string }>(
      `
        SELECT
          id,
          ${this.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          email,
          ${this.quoteIdentifier(userColumns.roleColumn)} AS role,
          ${this.quoteIdentifier(userColumns.voidPinHashColumn)} AS void_pin_hash
        FROM users u
        WHERE ${this.quoteIdentifier(userColumns.storeIdColumn)} = $1
          AND UPPER(${this.quoteIdentifier(userColumns.roleColumn)}) IN ('POS_MANAGER', 'POS_ADMIN', 'ADMIN')
          AND ${this.quoteIdentifier(userColumns.voidPinHashColumn)} IS NOT NULL
          ${this.activeUsersWhereClause(userColumns)}
      `,
      [requester.store_id],
    );

    for (const row of rows) {
      if (await bcrypt.compare(input.voidPin.trim(), row.void_pin_hash)) {
        await this.recordActivity({
          userId: requester.id,
          storeId: requester.store_id,
          userName: requester.full_name,
          userRole: requester.role,
          module: 'POS Authorization',
          action: input.action ?? 'Manager PIN Approved',
          details: `POS manager action authorized\nManager: ${row.full_name}`,
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

    throw new ForbiddenException('Invalid manager PIN.');
  }

  async getRetailManagerProfile(userId: number) {
    const requester = await this.getUserStoreScope(userId);
    if (requester.store_type !== 'RETAIL_STORE') {
      throw new ForbiddenException('Retail manager profile is only available for retail stores.');
    }
    return this.getPosManagerProfile(userId);
  }

  async getPosManagerProfile(userId: number) {
    const requester = await this.getUserStoreScope(userId);
    if (!requester.store_id) {
      throw new ForbiddenException('Store scope is required for manager profile.');
    }
    if (!this.isPosManagerRole(requester.role)) {
      throw new ForbiddenException('Only POS managers can view this profile.');
    }

    await this.ensureVoidPinHashColumn();
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    const storeColumns = this.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.storeIdColumn || !userColumns.staffTypeColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for manager profile.');
    }
    if (!userColumns.voidPinHashColumn || !userColumns.voidPinColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for Unique PIN display.');
    }

    const storeJoin = storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.quoteIdentifier(userColumns.storeIdColumn)}` : '';
    const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.normalizedStoreTypeSql(`s.${this.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : '$2::text AS store_type';
    const storeNameSelect = storeColumns.storeNameColumn ? `s.${this.quoteIdentifier(storeColumns.storeNameColumn)} AS store_name` : '$3::text AS store_name';
    const voidPinSelect = userColumns.voidPinColumn ? `u.${this.quoteIdentifier(userColumns.voidPinColumn)} AS void_pin` : 'NULL AS void_pin';
    const voidPinConfiguredSelect = userColumns.voidPinHashColumn ? `u.${this.quoteIdentifier(userColumns.voidPinHashColumn)} IS NOT NULL AS void_pin_configured` : 'FALSE AS void_pin_configured';

    const rows = await this.query<AuthenticatedUser & { void_pin: string | null; void_pin_configured: boolean }>(
      `
        SELECT
          u.id,
          u.${this.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          u.email,
          u.${this.quoteIdentifier(userColumns.roleColumn)} AS role,
          u.${this.quoteIdentifier(userColumns.storeIdColumn)} AS store_id,
          u.${this.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type,
          ${storeTypeSelect},
          ${storeNameSelect},
          ${voidPinSelect},
          ${voidPinConfiguredSelect},
          ${this.userStatusSelect(userColumns)}
        FROM users u
        ${storeJoin}
        WHERE u.id = $1
          AND u.${this.quoteIdentifier(userColumns.storeIdColumn)} = $4
        LIMIT 1
      `,
      [userId, requester.store_type, requester.store_name, requester.store_id],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Manager profile was not found.');
    }

    if (!rows[0].void_pin?.trim()) {
      const uniquePin = await this.generateUniqueRetailVoidPin(requester.store_id, userId);
      await this.query(
        `
          UPDATE users
          SET
            ${this.quoteIdentifier(userColumns.voidPinHashColumn)} = $1,
            ${this.quoteIdentifier(userColumns.voidPinColumn)} = $2
          WHERE id = $3
            AND ${this.quoteIdentifier(userColumns.storeIdColumn)} = $4
        `,
        [await bcrypt.hash(uniquePin, 10), uniquePin, userId, requester.store_id],
      );
      rows[0].void_pin = uniquePin;
      rows[0].void_pin_configured = true;
    }

    return rows[0];
  }

  async generateRetailManagerUniquePin(userId: number) {
    const requester = await this.getUserStoreScope(userId);
    if (requester.store_type !== 'RETAIL_STORE') {
      throw new ForbiddenException('Unique PIN generation is only available for retail stores.');
    }
    return this.generatePosManagerUniquePin(userId);
  }

  async generatePosManagerUniquePin(userId: number) {
    const requester = await this.getUserStoreScope(userId);
    if (!requester.store_id) {
      throw new ForbiddenException('Store scope is required for Unique PIN generation.');
    }
    if (!this.isPosManagerRole(requester.role)) {
      throw new ForbiddenException('Only POS managers can generate a Unique PIN.');
    }

    await this.ensureVoidPinHashColumn();
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    if (!userColumns.voidPinHashColumn || !userColumns.voidPinColumn || !userColumns.storeIdColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for Unique PIN generation.');
    }

    const uniquePin = await this.generateUniqueRetailVoidPin(requester.store_id, userId);
    await this.query(
      `
        UPDATE users
        SET
          ${this.quoteIdentifier(userColumns.voidPinHashColumn)} = $1,
          ${this.quoteIdentifier(userColumns.voidPinColumn)} = $2
        WHERE id = $3
          AND ${this.quoteIdentifier(userColumns.storeIdColumn)} = $4
      `,
      [await bcrypt.hash(uniquePin, 10), uniquePin, userId, requester.store_id],
    );

    return {
      id: userId,
      void_pin: uniquePin,
      void_pin_configured: true,
    };
  }

  private userStatusSelect(userColumns: { statusColumn: string | null; activeColumn?: string | null }, alias = 'u') {
    const prefix = alias ? `${alias}.` : '';
    if (userColumns.statusColumn) {
      return `${prefix}${this.quoteIdentifier(userColumns.statusColumn)} AS status`;
    }
    if (userColumns.activeColumn) {
      return `CASE WHEN COALESCE(${prefix}${this.quoteIdentifier(userColumns.activeColumn)}, TRUE) THEN 'ACTIVE' ELSE 'INACTIVE' END AS status`;
    }
    return `'ACTIVE' AS status`;
  }

  private activeUsersWhereClause(userColumns: { statusColumn: string | null; activeColumn?: string | null }, alias = 'u') {
    if (userColumns.statusColumn) {
      return ` AND COALESCE(${alias}.${this.quoteIdentifier(userColumns.statusColumn)}, 'ACTIVE') = 'ACTIVE'`;
    }
    if (userColumns.activeColumn) {
      return ` AND COALESCE(${alias}.${this.quoteIdentifier(userColumns.activeColumn)}, TRUE) = TRUE`;
    }
    return '';
  }

  private userActiveUpdateAssignment(userColumns: { statusColumn: string | null; activeColumn?: string | null }, active: boolean) {
    if (userColumns.statusColumn) {
      return `${this.quoteIdentifier(userColumns.statusColumn)} = '${active ? 'ACTIVE' : 'INACTIVE'}'`;
    }
    if (userColumns.activeColumn) {
      return `${this.quoteIdentifier(userColumns.activeColumn)} = ${active ? 'TRUE' : 'FALSE'}`;
    }
    return null;
  }

  private async deactivateAdminAndStoreStaff(
    adminUserId: number,
    storeId: number | null,
    userColumns: ReturnType<DatabaseService['resolveUserColumns']>,
  ) {
    const activeAssignment = this.userActiveUpdateAssignment(userColumns, false);
    if (!activeAssignment || !userColumns.roleColumn) {
      throw new InternalServerErrorException('Users table is missing required status columns.');
    }

    const roleColumn = this.quoteIdentifier(userColumns.roleColumn);

    if (storeId && userColumns.storeIdColumn) {
      const storeIdColumn = this.quoteIdentifier(userColumns.storeIdColumn);
      const rows = await this.query<{ id: number }>(
        `
          UPDATE users
          SET ${activeAssignment}
          WHERE (
            (id = $1 AND ${roleColumn} IN (${STORE_ADMIN_ROLES_WITH_LEGACY_SQL}))
            OR (${roleColumn} IN (${STORE_USER_ROLES_WITH_LEGACY_SQL}) AND ${storeIdColumn} = $2)
          )
          RETURNING id
        `,
        [adminUserId, storeId],
      );

      if (!rows.some((row) => Number(row.id) === adminUserId)) {
        throw new NotFoundException('Admin account was not found.');
      }

      return rows.map((row) => row.id);
    }

    const rows = await this.query<{ id: number }>(
      `
        UPDATE users
        SET ${activeAssignment}
        WHERE id = $1
          AND ${roleColumn} IN (${STORE_ADMIN_ROLES_WITH_LEGACY_SQL})
        RETURNING id
      `,
      [adminUserId],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Admin account was not found.');
    }

    return rows.map((row) => row.id);
  }

  private async activateAdminAndStoreStaff(
    adminUserId: number,
    storeId: number | null,
    userColumns: ReturnType<DatabaseService['resolveUserColumns']>,
  ) {
    const activeAssignment = this.userActiveUpdateAssignment(userColumns, true);
    if (!activeAssignment || !userColumns.roleColumn) {
      throw new InternalServerErrorException('Users table is missing required status columns.');
    }

    const roleColumn = this.quoteIdentifier(userColumns.roleColumn);

    if (storeId && userColumns.storeIdColumn) {
      const storeIdColumn = this.quoteIdentifier(userColumns.storeIdColumn);
      const rows = await this.query<{ id: number }>(
        `
          UPDATE users
          SET ${activeAssignment}
          WHERE (
            (id = $1 AND ${roleColumn} IN (${STORE_ADMIN_ROLES_WITH_LEGACY_SQL}))
            OR (${roleColumn} IN (${STORE_USER_ROLES_WITH_LEGACY_SQL}) AND ${storeIdColumn} = $2)
          )
          RETURNING id
        `,
        [adminUserId, storeId],
      );

      if (!rows.some((row) => Number(row.id) === adminUserId)) {
        throw new NotFoundException('Admin account was not found.');
      }

      return rows.map((row) => row.id);
    }

    const rows = await this.query<{ id: number }>(
      `
        UPDATE users
        SET ${activeAssignment}
        WHERE id = $1
          AND ${roleColumn} IN (${STORE_ADMIN_ROLES_WITH_LEGACY_SQL})
        RETURNING id
      `,
      [adminUserId],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Admin account was not found.');
    }

    return rows.map((row) => row.id);
  }

  private async deactivateStaffForStore(
    staffUserId: number,
    storeId: number,
    userColumns: ReturnType<DatabaseService['resolveUserColumns']>,
  ) {
    const activeAssignment = this.userActiveUpdateAssignment(userColumns, false);
    if (!activeAssignment || !userColumns.roleColumn || !userColumns.storeIdColumn) {
      return [];
    }

    const roleColumn = this.quoteIdentifier(userColumns.roleColumn);
    const storeIdColumn = this.quoteIdentifier(userColumns.storeIdColumn);

    return this.query<{ id: number }>(
      `
        UPDATE users
        SET ${activeAssignment}
        WHERE id = $1
          AND ${roleColumn} IN (${STORE_USER_ROLES_WITH_LEGACY_SQL})
          AND ${storeIdColumn} = $2
        RETURNING id
      `,
      [staffUserId, storeId],
    );
  }

  private async activateStaffForStore(
    staffUserId: number,
    storeId: number,
    userColumns: ReturnType<DatabaseService['resolveUserColumns']>,
  ) {
    const activeAssignment = this.userActiveUpdateAssignment(userColumns, true);
    if (!activeAssignment || !userColumns.roleColumn || !userColumns.storeIdColumn) {
      return [];
    }

    const roleColumn = this.quoteIdentifier(userColumns.roleColumn);
    const storeIdColumn = this.quoteIdentifier(userColumns.storeIdColumn);

    return this.query<{ id: number }>(
      `
        UPDATE users
        SET ${activeAssignment}
        WHERE id = $1
          AND ${roleColumn} IN (${STORE_USER_ROLES_WITH_LEGACY_SQL})
          AND ${storeIdColumn} = $2
        RETURNING id
      `,
      [staffUserId, storeId],
    );
  }

  private async hardDeleteUserByRole(
    userId: number,
    role: 'ADMIN' | 'STAFF',
    storeId: number | null,
    userColumns: ReturnType<DatabaseService['resolveUserColumns']>,
  ) {
    if (!userColumns.roleColumn) {
      throw new InternalServerErrorException('Users table is missing a role column.');
    }

    const roleColumn = this.quoteIdentifier(userColumns.roleColumn);
    const conditions = [`id = $1`, `${roleColumn} = $2`];
    const params: unknown[] = [userId, role];

    if (role === 'STAFF') {
      if (!userColumns.storeIdColumn || storeId === null) {
        throw new InternalServerErrorException('Staff deletion requires a store scope.');
      }

      conditions.push(`${this.quoteIdentifier(userColumns.storeIdColumn)} = $3`);
      params.push(storeId);
    }

    try {
      return await this.query<{ id: number }>(
        `
          DELETE FROM users
          WHERE ${conditions.join(' AND ')}
          RETURNING id
        `,
        params,
      );
    } catch (error) {
      this.handleDatabaseWriteError(error, 'Unable to remove user account.');
    }
  }

  private async hardDeleteStoreUser(
    userId: number,
    storeId: number,
    userColumns: ReturnType<DatabaseService['resolveUserColumns']>,
  ) {
    if (!userColumns.roleColumn || !userColumns.storeIdColumn) {
      throw new InternalServerErrorException('Store user deletion requires role and store columns.');
    }

    try {
      return await this.query<{ id: number }>(
        `
          DELETE FROM users
          WHERE id = $1
            AND ${this.quoteIdentifier(userColumns.roleColumn)} IN (${STORE_USER_ROLES_WITH_LEGACY_SQL})
            AND ${this.quoteIdentifier(userColumns.storeIdColumn)} = $2
          RETURNING id
        `,
        [userId, storeId],
      );
    } catch (error) {
      this.handleDatabaseWriteError(error, 'Unable to remove user account.');
    }
  }

  private staffTypeForRole(role: StaffRole, staffType: StaffType): StaffType {
    if (role === 'POS_MANAGER') return 'POS_STAFF';
    if (role === 'INVENTORY_MANAGER') return 'INVENTORY_STAFF';
    if (role === 'KITCHEN') return 'KITCHEN_STAFF';
    return staffType;
  }

  private async ensureKitchenRoleConstraints() {
    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    if (!userColumns.roleColumn) return;

    await this.query(`
      DO $$
      DECLARE
        role_constraint_name text;
        staff_type_constraint_name text;
      BEGIN
        SELECT con.conname
          INTO role_constraint_name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'users'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%role%'
        LIMIT 1;

        IF role_constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', role_constraint_name);
        END IF;

        ALTER TABLE users
          ADD CONSTRAINT users_role_check
          CHECK (role IN ('SUPERADMIN', 'ADMIN', 'STAFF', 'KITCHEN', 'POS_MANAGER', 'INVENTORY_MANAGER', 'POS_ADMIN', 'INVENTORY_ADMIN'));

        SELECT con.conname
          INTO staff_type_constraint_name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'users'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%staff_type%'
        LIMIT 1;

        IF staff_type_constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', staff_type_constraint_name);
        END IF;

        ALTER TABLE users
          ADD CONSTRAINT users_staff_type_check
          CHECK (staff_type IS NULL OR staff_type IN ('POS_STAFF', 'INVENTORY_STAFF', 'KITCHEN_STAFF'));
      END $$;
    `);
  }

  private resolveStoreColumns(columns: Set<string>) {
    const pick = (candidates: string[]) => candidates.find((candidate) => columns.has(candidate.toLowerCase())) ?? null;

    return {
      joinable: columns.has('id'),
      storeTypeColumn: pick(['store_type', 'type', 'store_kind']),
      storeNameColumn: pick(['store_name', 'name']),
      storeDescriptionColumn: pick(['store_description', 'description']),
      logoUrlColumn: pick(['logo_url', 'store_logo_url']),
      contactNumberColumn: pick(['contact_number', 'phone_number', 'phone']),
      emailAddressColumn: pick(['email_address', 'store_email', 'email']),
      addressColumn: pick(['address', 'store_address']),
      updatedAtColumn: pick(['updated_at']),
    };
  }

  private quoteIdentifier(identifier: string) {
    return `"${identifier.replaceAll('"', '""')}"`;
  }

  private toDatabaseStoreType(storeType: 'RESTAURANT' | 'RETAIL_STORE') {
    return storeType === 'RETAIL_STORE' ? 'RETAIL' : storeType;
  }

  private normalizedStoreTypeSql(expression: string) {
    return `CASE WHEN ${expression} = 'RETAIL' THEN 'RETAIL_STORE' ELSE ${expression} END`;
  }

  private handleDatabaseWriteError(error: unknown, fallbackMessage: string): never {
    const databaseError = error as { code?: string; detail?: string; message?: string };

    if (databaseError.code === '23503') {
      const isUserAccountWrite = /account|staff|admin|user/i.test(fallbackMessage);
      if (!isUserAccountWrite) {
        throw new ConflictException(
          `${fallbackMessage} One of the selected records is no longer linked to the current store data. Please refresh the POS menu and try again.`,
        );
      }

      throw new ConflictException(
        'This account is linked to other records and cannot be permanently deleted. Use Deactivate instead; if deactivation is unavailable, run backend/sql/add-user-is-active.sql first.',
      );
    }

    if (databaseError.code === '23505') {
      throw new ConflictException(databaseError.detail ?? 'A record with the same unique value already exists.');
    }

    if (databaseError.code === '23514') {
      throw new InternalServerErrorException(databaseError.detail ?? databaseError.message ?? fallbackMessage);
    }

    if (databaseError.code === '23502') {
      throw new InternalServerErrorException(databaseError.detail ?? databaseError.message ?? fallbackMessage);
    }

    if (databaseError.message) {
      throw new InternalServerErrorException(`${fallbackMessage} ${databaseError.message}`);
    }

    throw new InternalServerErrorException(fallbackMessage);
  }

  private generateTemporaryPassword() {
    return Math.random().toString(36).slice(-10);
  }
}
