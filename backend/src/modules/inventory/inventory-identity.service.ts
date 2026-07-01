import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AuthRepository } from '../auth/auth.repository';
import { AuthenticatedUser } from '../../shared/common/types';
import { DatabaseService } from '../../shared/database/database.service';

type BusinessModule = 'RETAIL' | 'RESTAURANT';
type InventoryRole = 'Admin' | 'Manager' | 'Staff';

export type InventoryScope = {
  businessId: string;
  module: BusinessModule;
  user: {
    id: string;
    name: string;
    email: string;
    role: InventoryRole;
    status: string;
    businessId: string;
    modules: BusinessModule[];
    lastLogin: string;
  };
};

type InventoryBusinessRow = {
  id: string;
  name: string;
  modules: BusinessModule[];
  posStoreId: number | null;
};

type InventoryUserRow = {
  id: string;
  name: string;
  email: string;
  role: InventoryRole;
  status: string;
  businessId: string;
  modules: BusinessModule[];
  lastLogin: string;
  posUserId: number | null;
};

@Injectable()
export class InventoryIdentityService {
  // resolveScope() runs on every inventory API request. ensureBridgeColumns
  // and ensureBusinessDefaults are idempotent setup (schema columns/indexes,
  // "create if missing" seed rows) that only ever need to run once per
  // business per process lifetime.
  // ensureBusinessModule and ensureInventoryUser are intentionally kept live:
  // they keep role/status/business-module assignment in sync with POS changes.
  private bridgeColumnsReady = false;
  private readonly businessDefaultsReady = new Set<string>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authRepository: AuthRepository,
  ) {}

  async resolveScope(posUser: AuthenticatedUser): Promise<InventoryScope> {
    if (posUser.role === 'SUPERADMIN') {
      throw new ForbiddenException('Superadmin accounts do not have a store inventory scope.');
    }

    const freshUser = await this.authRepository.getActiveAuthUserById(posUser.id);
    if (!freshUser.store_id) {
      throw new ForbiddenException('This POS user is not assigned to a store.');
    }

    const module = this.mapStoreTypeToModule(freshUser.store_type);
    const role = this.mapRole(freshUser);

    return this.databaseService.withTransaction(async (client) => {
      if (!this.bridgeColumnsReady) {
        await this.ensureBridgeColumns(client);
        this.bridgeColumnsReady = true;
      }

      const business = await this.ensureBusiness(client, freshUser, module);
      await this.ensureBusinessModule(client, business.id, module);
      if (!this.businessDefaultsReady.has(business.id)) {
        await this.ensureBusinessDefaults(client, business.id, module);
        this.businessDefaultsReady.add(business.id);
      }
      const inventoryUser = await this.ensureInventoryUser(client, freshUser, business.id, role);

      return {
        businessId: business.id,
        module,
        user: {
          id: inventoryUser.id,
          name: inventoryUser.name,
          email: inventoryUser.email,
          role: inventoryUser.role,
          status: inventoryUser.status,
          businessId: business.id,
          modules: this.uniqueModules([...(business.modules ?? []), module]),
          lastLogin: inventoryUser.lastLogin,
        },
      };
    });
  }

  private async ensureBridgeColumns(client: PoolClient) {
    await client.query(`
      ALTER TABLE "Business"
        ADD COLUMN IF NOT EXISTS "posStoreId" INTEGER
    `);
    await client.query(`
      ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "posUserId" INTEGER
    `);
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "Business_posStoreId_key" ON "Business"("posStoreId")');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "User_posUserId_key" ON "User"("posUserId")');
  }

  private async ensureBusiness(client: PoolClient, posUser: AuthenticatedUser, module: BusinessModule) {
    const byStore = await this.databaseService.queryWithClient<InventoryBusinessRow>(
      client,
      `
        SELECT id, name, modules, "posStoreId"
        FROM "Business"
        WHERE "posStoreId" = $1
        LIMIT 1
      `,
      [posUser.store_id],
    );
    if (byStore[0]) return byStore[0];

    const byEmail = await this.databaseService.queryWithClient<InventoryBusinessRow>(
      client,
      `
        SELECT b.id, b.name, b.modules, b."posStoreId"
        FROM "User" u
        JOIN "Business" b ON b.id = u."businessId"
        WHERE lower(u.email) = lower($1)
        LIMIT 1
      `,
      [posUser.email],
    );

    if (byEmail[0]) {
      await client.query(
        `
          UPDATE "Business"
          SET "posStoreId" = COALESCE("posStoreId", $1),
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
        [posUser.store_id, byEmail[0].id],
      );
      return { ...byEmail[0], posStoreId: posUser.store_id };
    }

    const id = randomUUID();
    const name = this.businessName(posUser);
    const rows = await this.databaseService.queryWithClient<InventoryBusinessRow>(
      client,
      `
        INSERT INTO "Business" (id, name, modules, "posStoreId", "updatedAt")
        VALUES ($1, $2, ARRAY[$3::"BusinessModule"], $4, CURRENT_TIMESTAMP)
        RETURNING id, name, modules, "posStoreId"
      `,
      [id, name, module, posUser.store_id],
    );
    return rows[0];
  }

  private async ensureBusinessModule(client: PoolClient, businessId: string, module: BusinessModule) {
    await client.query(
      `
        UPDATE "Business"
        SET modules = CASE
              WHEN modules @> ARRAY[$2::"BusinessModule"] THEN modules
              ELSE array_append(modules, $2::"BusinessModule")
            END,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [businessId, module],
    );
  }

  private async ensureBusinessDefaults(client: PoolClient, businessId: string, module: BusinessModule) {
    await client.query(
      `
        INSERT INTO "Location" (id, name, address, manager, phone, "businessId", "updatedAt")
        SELECT $1, 'Main Location', '', '', '', $2, CURRENT_TIMESTAMP
        WHERE NOT EXISTS (
          SELECT 1 FROM "Location" WHERE "businessId" = $2
        )
      `,
      [randomUUID(), businessId],
    );

    const categories = module === 'RESTAURANT'
      ? ['Ingredients', 'Menu Items', 'Supplies']
      : ['Apparel', 'Accessories', 'General'];

    for (const category of categories) {
      await client.query(
        `
          INSERT INTO "Category" (id, name, description, module, "businessId", "updatedAt")
          VALUES ($1, $2, NULL, $3::"BusinessModule", $4, CURRENT_TIMESTAMP)
          ON CONFLICT ("businessId", name, module) DO NOTHING
        `,
        [randomUUID(), category, module, businessId],
      );
    }

    if (module === 'RESTAURANT') {
      await client.query(
        `
          INSERT INTO "RestaurantSetting" (id, key, value, "businessId", "updatedAt")
          VALUES
            ($1, 'low_stock_alerts', 'true'::jsonb, $4, CURRENT_TIMESTAMP),
            ($2, 'kitchen_order_sync', 'true'::jsonb, $4, CURRENT_TIMESTAMP),
            ($3, 'recipe_costing', 'true'::jsonb, $4, CURRENT_TIMESTAMP)
          ON CONFLICT ("businessId", key) DO NOTHING
        `,
        [randomUUID(), randomUUID(), randomUUID(), businessId],
      );
    }
  }

  private async ensureInventoryUser(
    client: PoolClient,
    posUser: AuthenticatedUser,
    businessId: string,
    role: InventoryRole,
  ) {
    const existing = await this.databaseService.queryWithClient<InventoryUserRow>(
      client,
      `
        SELECT
          u.id, u.name, u.email, u.role, u.status,
          u."businessId" AS "businessId",
          b.modules,
          u."lastLogin" AS "lastLogin",
          u."posUserId" AS "posUserId"
        FROM "User" u
        JOIN "Business" b ON b.id = u."businessId"
        WHERE u."posUserId" = $1
           OR lower(u.email) = lower($2)
        LIMIT 1
      `,
      [posUser.id, posUser.email],
    );

    if (existing[0]) {
      const updated = await this.databaseService.queryWithClient<InventoryUserRow>(
        client,
        `
          UPDATE "User"
          SET "posUserId" = $1,
              name = $2,
              email = $3,
              role = $4::"UserRole",
              status = 'Active',
              "businessId" = $5,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = $6
          RETURNING id, name, email, role, status, "businessId", "lastLogin", "posUserId"
        `,
        [posUser.id, posUser.full_name, posUser.email, role, businessId, existing[0].id],
      );
      return updated[0];
    }

    const rows = await this.databaseService.queryWithClient<InventoryUserRow>(
      client,
      `
        INSERT INTO "User" (
          id, "posUserId", name, email, "passwordHash", role, status, "businessId", "lastLogin", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6::"UserRole", 'Active', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, name, email, role, status, "businessId", "lastLogin", "posUserId"
      `,
      [
        randomUUID(),
        posUser.id,
        posUser.full_name,
        posUser.email,
        `pos-linked-${randomUUID()}`,
        role,
        businessId,
      ],
    );

    return rows[0];
  }

  private mapStoreTypeToModule(storeType: AuthenticatedUser['store_type']): BusinessModule {
    if (storeType === 'RESTAURANT') return 'RESTAURANT';
    return 'RETAIL';
  }

  private mapRole(user: AuthenticatedUser): InventoryRole {
    if (user.role === 'ADMIN') return 'Admin';
    if (user.role === 'POS_MANAGER' || user.role === 'INVENTORY_MANAGER') return 'Manager';
    return 'Staff';
  }

  private businessName(user: AuthenticatedUser) {
    const baseName = user.store_name?.trim() || `POS Store ${user.store_id}`;
    return `${baseName} (POS ${user.store_id})`;
  }

  private uniqueModules(modules: BusinessModule[]) {
    return Array.from(new Set(modules));
  }
}

