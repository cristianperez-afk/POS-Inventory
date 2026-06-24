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
} from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
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

type StaffType = 'POS_STAFF' | 'INVENTORY_STAFF';
type StaffRole = 'STAFF' | 'POS_MANAGER' | 'INVENTORY_MANAGER';

const LEGACY_STORE_ADMIN_ROLES = ['ADMIN'] as const;
const STORE_MANAGER_ROLES = ['POS_MANAGER', 'INVENTORY_MANAGER'] as const;
const STORE_STAFF_ROLES = ['STAFF'] as const;
const STORE_USER_ROLES = [...STORE_STAFF_ROLES, ...STORE_MANAGER_ROLES] as const;
const STORE_USER_ROLES_WITH_LEGACY_SQL = "'STAFF', 'POS_MANAGER', 'INVENTORY_MANAGER', 'POS_ADMIN', 'INVENTORY_ADMIN'";
const STORE_ADMIN_ROLES_WITH_LEGACY_SQL = "'POS_MANAGER', 'INVENTORY_MANAGER', 'ADMIN'";

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
    return role === 'POS_MANAGER' || role === 'INVENTORY_MANAGER' || role === 'ADMIN';
  }

  private isPosManagerRole(role: unknown) {
    return role === 'POS_MANAGER' || role === 'ADMIN';
  }

  private isInventoryManagerRole(role: unknown) {
    return role === 'INVENTORY_MANAGER' || role === 'ADMIN';
  }

  async getLoginUserByEmail(email: string): Promise<AuthenticatedUser & { password_hash: string } | null> {
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
      return await this.withTransaction(async (client) => {
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

    if (!admin.store_id) {
      throw new InternalServerErrorException('Admin account is not linked to a store.');
    }

    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);
    const storeColumns = this.resolveStoreColumns(schema.stores);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.storeIdColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for staff listing.');
    }

    const storeJoin = storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.quoteIdentifier(userColumns.storeIdColumn)}` : '';
    const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.normalizedStoreTypeSql(`s.${this.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : 'NULL AS store_type';
    const storeNameSelect = storeColumns.storeNameColumn ? `s.${this.quoteIdentifier(storeColumns.storeNameColumn)} AS store_name` : 'NULL AS store_name';

    return this.query<AuthenticatedUser>(
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
  }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isPosManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only POS Manager accounts can create staff.');
    }

    const schema = await this.getSchemaColumns();
    const userColumns = this.resolveUserColumns(schema.users);

    if (!userColumns.fullNameColumn || !userColumns.roleColumn || !userColumns.passwordColumn || !userColumns.storeIdColumn || !userColumns.staffTypeColumn) {
      throw new InternalServerErrorException('Users table is missing required columns for staff creation.');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const role = input.role ?? 'STAFF';
    const staffType = this.staffTypeForRole(role, input.staffType);

    const rows = await this.query<AuthenticatedUser>(
      `
        INSERT INTO users (
          ${this.quoteIdentifier(userColumns.fullNameColumn)},
          email,
          ${this.quoteIdentifier(userColumns.roleColumn)},
          ${this.quoteIdentifier(userColumns.passwordColumn)},
          ${this.quoteIdentifier(userColumns.storeIdColumn)},
          ${this.quoteIdentifier(userColumns.staffTypeColumn)}
        )
        VALUES ($1, $2, $6, $3, $4, $5)
        RETURNING
          id,
          ${this.quoteIdentifier(userColumns.fullNameColumn)} AS full_name,
          email,
          ${this.quoteIdentifier(userColumns.roleColumn)} AS role,
          ${this.quoteIdentifier(userColumns.storeIdColumn)} AS store_id,
          ${this.quoteIdentifier(userColumns.staffTypeColumn)} AS staff_type,
          $7::text AS store_type,
          $8::text AS store_name,
          ${this.userStatusSelect(userColumns, '')}
      `,
      [input.fullName, input.email, passwordHash, admin.store_id, staffType, role, admin.store_type, admin.store_name],
    );

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
  }) {
    const admin = await this.getUserStoreScope(input.adminUserId);

    if (!this.isPosManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only POS Manager accounts can update staff.');
    }

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

    if (input.password?.trim()) {
      if (!userColumns.passwordColumn) {
        throw new InternalServerErrorException('Users table is missing a password column.');
      }

      values.push(await bcrypt.hash(input.password, 10));
      updates.push(`${this.quoteIdentifier(userColumns.passwordColumn)} = $${values.length}`);
    }

    values.push(input.staffUserId, admin.store_id);
    const staffIdParam = `$${values.length - 1}`;
    const storeIdParam = `$${values.length}`;

    try {
      const storeJoin = storeColumns.joinable ? `LEFT JOIN stores s ON s.id = u.${this.quoteIdentifier(userColumns.storeIdColumn)}` : '';
      const storeTypeSelect = storeColumns.storeTypeColumn ? `${this.normalizedStoreTypeSql(`s.${this.quoteIdentifier(storeColumns.storeTypeColumn)}`)} AS store_type` : 'NULL AS store_type';
      const storeNameSelect = storeColumns.storeNameColumn ? `s.${this.quoteIdentifier(storeColumns.storeNameColumn)} AS store_name` : 'NULL AS store_name';

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

    if (!this.isPosManagerRole(admin.role) || !admin.store_id) {
      throw new ForbiddenException('Only POS Manager accounts can remove staff for their store.');
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

      return { id: rows[0].id, status: 'INACTIVE', deactivated: true, deleted: false };
    }

    try {
      const rows = await this.hardDeleteStoreUser(input.staffUserId, admin.store_id, userColumns);

      if (rows.length === 0) {
        throw new NotFoundException('Staff account was not found for this store.');
      }

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

    if (!this.isPosManagerRole(admin.role) || !admin.store_id) {
      throw new ForbiddenException('Only POS Manager accounts can remove staff for their store.');
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

    if (!this.isPosManagerRole(admin.role) || !admin.store_id) {
      throw new ForbiddenException('Only POS Manager accounts can activate staff for their store.');
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
    enableServiceCharge?: boolean;
    serviceChargeRate?: number;
    enableTax?: boolean;
    taxRate?: number;
    enableDineIn?: boolean;
    enableTakeout?: boolean;
    enableIngredientCustomization?: boolean;
    enableReceiptPrinting?: boolean;
    enabledPaymentMethods?: string[];
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
          enable_service_charge = COALESCE($6, enable_service_charge),
          service_charge_rate = COALESCE($7, service_charge_rate),
          service_charge_percentage = COALESCE($7, service_charge_percentage),
          enable_tax = COALESCE($8, enable_tax),
          tax_rate = COALESCE($9, tax_rate),
          enable_dine_in = COALESCE($10, enable_dine_in),
          enable_takeout = COALESCE($11, enable_takeout),
          enable_ingredient_customization = COALESCE($12, enable_ingredient_customization),
          enable_receipt_printing = COALESCE($13, enable_receipt_printing),
          enabled_payment_methods = COALESCE($14, enabled_payment_methods),
          store_type = COALESCE(store_type, $15),
          updated_at = CURRENT_TIMESTAMP
        WHERE store_id = $16
          AND (store_type = $15 OR store_type IS NULL)
        RETURNING *
      `,
      [
        input.enableCustomerRecommendation,
        input.enableTableManagement,
        input.enableRefund,
        input.enableVoid,
        input.enableDiscount,
        input.enableServiceCharge,
        input.serviceChargeRate,
        input.enableTax,
        input.taxRate,
        input.enableDineIn,
        input.enableTakeout,
        input.enableIngredientCustomization,
        input.enableReceiptPrinting,
        input.enabledPaymentMethods ?? null,
        admin.store_type,
        admin.store_id,
      ],
    );

    return rows[0];
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
          SELECT MIN(FLOOR(ii.quantity_available / NULLIF(pi.quantity_required, 0))) AS available_quantity
          FROM product_ingredients pi
          JOIN ingredients_inventory ii ON ii.id = pi.ingredient_id
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

    if (user.store_type === 'RESTAURANT') {
      await this.syncRestaurantRecipesIntoPosCatalog(user);
    } else if (user.store_type === 'RETAIL_STORE') {
      await this.syncRetailInventoryIntoPosCatalog(user);
    }

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
            pv.stock_quantity AS available_quantity
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
          CASE
            WHEN p.store_type = 'RESTAURANT' THEN COALESCE(availability.available_quantity, 0)
            ELSE COALESCE(p.stock_quantity, 0)
          END AS available_quantity
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN "Recipe" r
          ON r."menuItemId" = p.inventory_item_id
         AND COALESCE(r."isActive", TRUE) = TRUE
        LEFT JOIN "InventoryItem" menu_item
          ON menu_item.id = p.inventory_item_id
        LEFT JOIN LATERAL (
          SELECT MIN(FLOOR(ii.quantity_available / NULLIF(pi.quantity_required, 0))) AS available_quantity
          FROM product_ingredients pi
          JOIN ingredients_inventory ii ON ii.id = pi.ingredient_id
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
      [user.store_id, user.store_type],
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
              ii.quantity_available,
              COALESCE(ii.is_available, TRUE) AS is_available
            FROM product_ingredients pi
            LEFT JOIN ingredients_inventory ii ON ii.id = pi.ingredient_id
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

    return products.map((product) => ({
      ...product,
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

    const rows = await this.query<any>(
      `
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          p.store_id,
          p.store_type,
          COALESCE(r.modifiers, '[]'::jsonb) AS modifiers,
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
                'quantity_available', ii.quantity_available,
                'is_available', COALESCE(ii.is_available, TRUE),
                'stock_status',
                  CASE
                    WHEN ii.id IS NULL THEN 'missing'
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
        LEFT JOIN "Recipe" r
          ON r."menuItemId" = p.inventory_item_id
         AND COALESCE(r."isActive", TRUE) = TRUE
        LEFT JOIN product_ingredients pi
          ON pi.product_id = p.id
         AND pi.store_id = p.store_id
        LEFT JOIN ingredients_inventory ii
          ON ii.id = pi.ingredient_id
         AND ii.store_id = p.store_id
        WHERE p.id = $1
          AND p.store_id = $2
        GROUP BY p.id, p.name, p.store_id, p.store_type, r.modifiers
        LIMIT 1
      `,
      [input.productId, user.store_id],
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
            ii.quantity_available,
            COALESCE(ii.is_available, TRUE) AS is_available
          FROM product_ingredients pi
          LEFT JOIN ingredients_inventory ii
            ON ii.id = pi.ingredient_id
           AND ii.store_id = pi.store_id
          WHERE pi.product_id = $1
            AND pi.store_id = $2
          ORDER BY pi.id ASC
        `,
        [input.productId, user.store_id],
      );

      rows[0].ingredients = recipeRows;
    }

    return rows[0];
  }

  async listPosIngredients(userId: number) {
    const user = await this.getUserStoreScope(userId);

    if (!user.store_id || user.store_type !== 'RESTAURANT') {
      return [];
    }

    return this.query(
      `
        SELECT
          id,
          inventory_item_id,
          ingredient_name AS name,
          quantity_available,
          unit,
          cost_per_unit,
          is_available
        FROM ingredients_inventory
        WHERE store_id = $1
          AND COALESCE(is_available, TRUE) = TRUE
          AND quantity_available > 0
        ORDER BY ingredient_name ASC
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
    return this.mapDiningTable(rows[0]);
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
    return this.mapDiningTable(rows[0]);
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
    if (this.isInventoryManagerRole(user.role)) {
      throw new ForbiddenException('Inventory Manager accounts can only view inventory workflows. Payment processing is restricted to POS Manager or POS Staff accounts.');
    }

    try {
      return await this.withTransaction(async (client) => {
        const isPaid = Boolean(input.payment);
        const hasOpenTableSession = Boolean(input.tableName && !String(input.tableName).toLowerCase().startsWith('queue'));
        const orderStatus = input.orderStatus ?? (isPaid && !hasOpenTableSession ? 'COMPLETED' : 'PENDING');
        const paymentStatus = input.paymentStatus ?? (isPaid ? 'PAID' : 'NOT_PAID');
        const orderNumber = await this.createUniqueOrderNumber(client, input.orderNumber);
        const partySize = Number(input.partySize ?? input.party_size ?? input.requiredSeats ?? 0);
        const orderRows = await this.queryWithClient<{ id: number }>(
          client,
          `
            INSERT INTO orders (
              store_id, cashier_id, order_number, customer_name, order_type, table_name,
              party_size, subtotal, discount_amount, discount_type, tax_amount, service_charge,
              total_amount, order_status, payment_status, payment_at, completed_at,
              table_started_at, preparing_started_at, ready_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            RETURNING id
          `,
          [
            user.store_id,
            user.id,
            orderNumber,
            input.customerName ?? null,
            input.orderType ?? (user.store_type === 'RETAIL_STORE' ? 'RETAIL' : 'TAKEOUT'),
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
            isPaid ? new Date() : null,
            orderStatus === 'COMPLETED' ? new Date() : null,
            hasOpenTableSession ? new Date() : null,
            orderStatus === 'PREPARING' ? new Date() : null,
            orderStatus === 'READY' ? new Date() : null,
          ],
        );
        const orderId = orderRows[0].id;
        const inventorySaleMovements: PosSaleMovement[] = [];

      for (const item of input.items ?? []) {
        const itemRows = await this.queryWithClient<{ id: number }>(
          client,
          `
            INSERT INTO order_items (
              order_id, product_id, variant_id, product_name, category_name, size, color,
              quantity, unit_price, line_total, item_type, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
            (item.price ?? 0) * (item.quantity ?? 1),
            item.orderType ?? null,
            item.notes ?? null,
          ],
        );
        const orderItemId = itemRows[0].id;

        if (isPaid) {
          if (user.store_type === 'RETAIL_STORE') {
            await this.deductRetailProduct(client, user.store_id!, orderId, orderItemId, item, item.productId ?? item.id, item.variantId ?? item.variant_id, item.quantity ?? 1, inventorySaleMovements);
          } else {
            await this.deductRestaurantIngredients(client, user.store_id!, orderId, orderItemId, item, inventorySaleMovements);
          }
        } else if (user.store_type === 'RESTAURANT') {
          await this.recordRestaurantIngredientCustomizations(client, user.store_id!, orderItemId, item);
        }
      }

      if (isPaid) {
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
    } catch (error) {
      this.handleDatabaseWriteError(error, 'Unable to save order.');
    }
  }

  async getNextPosOrderNumber(userId: number) {
    const user = await this.getUserStoreScope(userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }

    const rows = await this.query<{ next_order_number: string | number }>(
      `
        SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number, '\\D', '', 'g'), '')::BIGINT), 100000) + 1 AS next_order_number
        FROM orders
        WHERE store_id = $1
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
    const isRestrictedTransactionUpdate =
      Boolean(input.payment) ||
      input.paymentStatus === 'PAID' ||
      input.paymentStatus === 'VOIDED' ||
      input.paymentStatus === 'REFUNDED';
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
    if (input.orderStatus === 'COMPLETED') addUpdate('completed_at', new Date());
    if (input.orderStatus === 'COMPLETED') addUpdate('table_ended_at', new Date());
    if (input.tableName !== undefined && input.tableName && !String(input.tableName).toLowerCase().startsWith('queue')) addUpdate('table_started_at', new Date());

    if (updates.length === 0 && !isPaymentUpdate) {
      throw new BadRequestException('No order updates were provided.');
    }

    const newPaymentStatus = String(input.paymentStatus ?? '');
    const isVoidOrRefund = ['VOIDED', 'VOID', 'REFUNDED'].includes(newPaymentStatus);

    const rows = await this.withTransaction(async (client) => {
      type UpdatedOrderRow = {
        id: number;
        order_number: string;
        total_amount: string | number;
        subtotal: string | number;
        discount_amount: string | number;
        tax_amount: string | number;
        customer_name: string | null;
      };

      // Capture the payment status before the update so a void/refund only restocks
      // when the order was actually paid (and so a repeated void is a no-op).
      const priorRows = await this.queryWithClient<{ payment_status: string | null; table_name: string | null; party_size: string | number | null }>(
        client,
        `SELECT payment_status, table_name, party_size FROM orders WHERE store_id = $1 AND order_number = $2 LIMIT 1`,
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
              RETURNING id, order_number, total_amount, subtotal, discount_amount, tax_amount, customer_name
            `,
            [...values, user.store_type],
          )
        : await this.queryWithClient<UpdatedOrderRow>(
            client,
            `
              SELECT id, order_number, total_amount, subtotal, discount_amount, tax_amount, customer_name
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

        // Deferred payment (e.g. dine-in / open tab paid later): deduct stock and
        // mirror into the inventory "Sale"/"StockMovement" tables, just like a paid-
        // at-creation order. Guarded so it never double-deducts.
        await this.applyInventoryForPaidPosOrder(client, user, order, input.payment);
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
      if (input.orderStatus === 'COMPLETED') {
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
      } else if (isVoidOrRefund && priorPaymentStatus === 'PAID') {
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

    return rows[0];
  }

  async listPosOrders(userId: number) {
    await this.ensurePosOrderSchema();
    const user = await this.getUserStoreScope(userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }

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
          o.created_at,
          o.completed_at,
          o.payment_at,
          o.preparing_started_at,
          o.ready_at,
          o.table_started_at,
          o.table_ended_at,
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
                'notes', oi.notes
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

  private async deductRetailProduct(client: PoolClient, storeId: number, orderId: number, orderItemId: number, item: any, productId: number, variantId: number, quantity: number, movements: PosSaleMovement[]) {
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

    if (Number(variant.stock_quantity ?? 0) < quantity) {
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
          productIngredientId,
          originalId,
          replacementId,
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
  }

  private async deductRestaurantIngredients(
    client: PoolClient,
    storeId: number,
    orderId: number,
    orderItemId: number,
    item: any,
    movements: PosSaleMovement[],
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
            productIngredientId,
            originalId,
            replacementId,
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

      const inventoryRows = await this.queryWithClient<{ quantity_available: string | number; unit: string; inventory_item_id: string | null }>(
        client,
        `
          SELECT quantity_available, unit, inventory_item_id
          FROM ingredients_inventory
          WHERE id = $1
            AND store_id = $2
          FOR UPDATE
        `,
        [ingredientId, storeId],
      );

      const inventory = inventoryRows[0];
      if (!inventory) {
        throw new NotFoundException('Ingredient was not found for this store.');
      }

      if (Number(inventory.quantity_available ?? 0) < quantity) {
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
          const newQuantity = Math.max(previousQuantity - quantity, 0);
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

  // Restocks specific line items of a paid order (retail partial/whole refund or void).
  // Idempotent per item via a per-item referenceId, so refunding more items later or
  // retrying never double-restocks. Always restocks (retail goods are returned).
  private async restockPosOrderItems(
    client: PoolClient,
    user: AuthenticatedUser,
    order: { id: number; order_number: string },
    orderItemIds: number[],
    saleStatus: 'REFUNDED' | 'PARTIAL_REFUND',
    reason: string,
  ) {
    const module = user.store_type === 'RETAIL_STORE' ? 'RETAIL' : 'RESTAURANT';

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
        await this.reverseDeduction(client, d, referenceId, reason, `POS order ${order.order_number} item ${orderItemId} refunded`, module);
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
        `POS-${orderNumber}`,
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

    const requestedDigits = String(requestedOrderNumber ?? '').replace(/\D/g, '');
    const requestedNumeric = requestedDigits ? Number(requestedDigits) : null;
    const maxRows = await this.queryWithClient<{ max_order_number: string | number | null }>(
      client,
      `
        SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number, '\\D', '', 'g'), '')::BIGINT), 100000) AS max_order_number
        FROM orders
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
          enable_service_charge,
          service_charge_rate,
          service_charge_percentage,
          enable_tax,
          tax_rate,
          enable_dine_in,
          enable_takeout,
          enable_ingredient_customization,
          enable_receipt_printing,
          enabled_payment_methods
        )
        VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 0, 0, TRUE, 0, TRUE, TRUE, TRUE, TRUE, ARRAY['Cash', 'GCash', 'Maya', 'Bank Transfer']::TEXT[])
        ON CONFLICT (store_id) DO UPDATE
        SET store_type = COALESCE(store_settings.store_type, EXCLUDED.store_type),
            service_charge_rate = COALESCE(store_settings.service_charge_rate, store_settings.service_charge_percentage, 0),
            service_charge_percentage = COALESCE(store_settings.service_charge_percentage, store_settings.service_charge_rate, 0),
            enabled_payment_methods = COALESCE(store_settings.enabled_payment_methods, EXCLUDED.enabled_payment_methods),
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
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `,
    );
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
          ADD COLUMN IF NOT EXISTS payment_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS preparing_started_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS table_started_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS table_ended_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      statusColumn: pick(['status']),
      activeColumn: pick(['is_active']),
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
    return staffType;
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

