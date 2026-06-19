import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueryResultRow } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';

type HeadersLike = Record<string, string | string[] | undefined>;
type BusinessModule = 'RETAIL' | 'RESTAURANT';

type Scope = {
  businessId: string;
  module: BusinessModule;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    businessId: string;
    modules: string[];
    lastLogin: string;
  };
};

type Paged<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

@Injectable()
export class InventoryApiService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getCurrentUser(headers: HeadersLike) {
    const scope = await this.resolveScope(headers);
    return { user: scope.user };
  }

  async listInventory(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const where = ['i."businessId" = $1'];
    const params: unknown[] = [scope.businessId];

    if (query.itemType) {
      params.push(query.itemType);
      where.push(`i."itemType" = $${params.length}::"InventoryItemType"`);
    }

    if (query.search) {
      params.push(`%${query.search}%`);
      where.push(`(i.name ILIKE $${params.length} OR i.sku ILIKE $${params.length} OR i.barcode ILIKE $${params.length})`);
    }

    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT
          i.id, i.name, i."itemType", i.sku, i.barcode, i.category,
          i."targetCustomer", i.subcategory, i.size, i.condition,
          i.quantity, i.price, i."costPrice", i."imageUrl", i.unit,
          i."minStock", i."maxStock", i."reorderPoint", i."expiryDate",
          i."storageTemperature", i."dateAdded", i."locationId",
          i."createdAt", i."updatedAt",
          json_build_object(
            'id', l.id,
            'name', l.name,
            'address', l.address,
            'manager', l.manager,
            'phone', l.phone,
            'itemCount', l."itemCount"
          ) AS location
        FROM "InventoryItem" i
        LEFT JOIN "Location" l ON l.id = i."locationId"
        WHERE ${where.join(' AND ')}
        ORDER BY i."createdAt" DESC
      `,
      params,
    );

    return this.paged(rows);
  }

  async createInventoryItem(headers: HeadersLike, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    const locationId = String(body.locationId ?? (await this.getDefaultLocationId(scope.businessId)));
    const id = randomUUID();

    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        INSERT INTO "InventoryItem" (
          id, name, "itemType", sku, barcode, category, "targetCustomer",
          subcategory, size, condition, quantity, price, "costPrice",
          "imageUrl", unit, "minStock", "maxStock", "reorderPoint",
          "expiryDate", "storageTemperature", "locationId", "businessId"
        )
        VALUES (
          $1, $2, $3::"InventoryItemType", $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18,
          $19, $20, $21, $22
        )
        RETURNING *
      `,
      [
        id,
        String(body.name ?? 'Untitled Item'),
        String(body.itemType ?? 'RETAIL_ITEM'),
        body.sku ?? null,
        body.barcode ?? null,
        String(body.category ?? 'Uncategorized'),
        body.targetCustomer ?? null,
        body.subcategory ?? null,
        body.size ?? null,
        body.condition ?? null,
        Number(body.quantity ?? 0),
        Number(body.price ?? 0),
        body.costPrice === undefined ? null : Number(body.costPrice),
        body.imageUrl ?? null,
        body.unit ?? null,
        body.minStock === undefined ? null : Number(body.minStock),
        body.maxStock === undefined ? null : Number(body.maxStock),
        body.reorderPoint === undefined ? null : Number(body.reorderPoint),
        body.expiryDate ?? null,
        body.storageTemperature ?? null,
        locationId,
        scope.businessId,
      ],
    );

    return rows[0];
  }

  async updateInventoryItem(id: string, body: Record<string, unknown>) {
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        UPDATE "InventoryItem"
        SET
          name = COALESCE($2, name),
          category = COALESCE($3, category),
          quantity = COALESCE($4, quantity),
          price = COALESCE($5, price),
          "costPrice" = COALESCE($6, "costPrice"),
          unit = COALESCE($7, unit),
          "minStock" = COALESCE($8, "minStock"),
          "maxStock" = COALESCE($9, "maxStock"),
          "reorderPoint" = COALESCE($10, "reorderPoint"),
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [
        id,
        body.name ?? null,
        body.category ?? null,
        body.quantity === undefined ? null : Number(body.quantity),
        body.price === undefined ? null : Number(body.price),
        body.costPrice === undefined ? null : Number(body.costPrice),
        body.unit ?? null,
        body.minStock === undefined ? null : Number(body.minStock),
        body.maxStock === undefined ? null : Number(body.maxStock),
        body.reorderPoint === undefined ? null : Number(body.reorderPoint),
      ],
    );

    if (!rows[0]) throw new NotFoundException('Inventory item was not found.');
    return rows[0];
  }

  async listLocations(headers: HeadersLike) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT l.*, json_build_object('items', COUNT(i.id)::int) AS "_count"
        FROM "Location" l
        LEFT JOIN "InventoryItem" i ON i."locationId" = l.id
        WHERE l."businessId" = $1
        GROUP BY l.id
        ORDER BY l.name ASC
      `,
      [scope.businessId],
    );
    return this.paged(rows);
  }

  async listUsers(headers: HeadersLike) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT id, name, email, role, status, "lastLogin"
        FROM "User"
        WHERE "businessId" = $1
        ORDER BY name ASC
      `,
      [scope.businessId],
    );
    return this.paged(rows);
  }

  async listCategories(headers: HeadersLike, module?: string) {
    const scope = await this.resolveScope(headers);
    return this.safeQuery<Record<string, unknown>>(
      `
        SELECT id, name, description, module, "createdAt", "updatedAt"
        FROM "Category"
        WHERE "businessId" = $1
          AND ($2::text IS NULL OR module = $2::"BusinessModule")
        ORDER BY name ASC
      `,
      [scope.businessId, module ?? scope.module],
    );
  }

  async createCategory(headers: HeadersLike, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        INSERT INTO "Category" (id, name, description, module, "businessId")
        VALUES ($1, $2, $3, $4::"BusinessModule", $5)
        ON CONFLICT ("businessId", name, module)
        DO UPDATE SET description = EXCLUDED.description, "updatedAt" = CURRENT_TIMESTAMP
        RETURNING *
      `,
      [
        randomUUID(),
        String(body.name ?? 'Uncategorized'),
        body.description ?? null,
        String(body.module ?? scope.module),
        scope.businessId,
      ],
    );
    return rows[0];
  }

  async listRecipes(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT
          r.*,
          COALESCE(ingredients.items, '[]'::json) AS ingredients,
          row_to_json(menu_item.*) AS "menuItem"
        FROM "Recipe" r
        LEFT JOIN "InventoryItem" menu_item ON menu_item.id = r."menuItemId"
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'id', ri.id,
              'itemId', ri."itemId",
              'quantity', ri.quantity,
              'unit', ri.unit,
              'unitCost', ri."unitCost",
              'totalCost', ri."totalCost",
              'item', row_to_json(item.*)
            )
            ORDER BY item.name
          ) AS items
          FROM "RecipeIngredient" ri
          JOIN "InventoryItem" item ON item.id = ri."itemId"
          WHERE ri."recipeId" = r.id
        ) ingredients ON TRUE
        WHERE r."businessId" = $1
          AND ($2::text IS NULL OR r."isActive" = ($2::boolean))
        ORDER BY r.name ASC
      `,
      [scope.businessId, query.active ?? null],
    );
    return this.paged(rows);
  }

  async listKitchenOrders(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT
          ko.*,
          row_to_json(r.*) AS recipe,
          row_to_json(l.*) AS location,
          row_to_json(t.*) AS table
        FROM "KitchenOrder" ko
        JOIN "Recipe" r ON r.id = ko."recipeId"
        LEFT JOIN "Location" l ON l.id = ko."locationId"
        LEFT JOIN "DiningTable" t ON t.id = ko."tableId"
        WHERE ko."businessId" = $1
          AND ($2::text IS NULL OR ko.status = $2::"KitchenOrderStatus")
        ORDER BY ko."createdAt" DESC
      `,
      [scope.businessId, query.status ?? null],
    );
    return this.paged(rows);
  }

  async listSuppliers(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT *
        FROM "Supplier"
        WHERE "businessId" = $1
          AND module = $2::"BusinessModule"
          AND ($3::text IS NULL OR "isActive" = $3::boolean)
        ORDER BY name ASC
      `,
      [scope.businessId, query.module ?? scope.module, query.isActive ?? null],
    );
    return this.paged(rows);
  }

  async listPurchaseOrders(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT
          po.*,
          row_to_json(s.*) AS supplier,
          COALESCE(items.items, '[]'::json) AS items
        FROM "PurchaseOrder" po
        LEFT JOIN "Supplier" s ON s.id = po."supplierId"
        LEFT JOIN LATERAL (
          SELECT json_agg(poi.* ORDER BY poi."createdAt") AS items
          FROM "PurchaseOrderItem" poi
          WHERE poi."purchaseOrderId" = po.id
        ) items ON TRUE
        WHERE po."businessId" = $1
          AND po.module = $2::"BusinessModule"
          AND ($3::text IS NULL OR po.status = $3::"PurchaseOrderStatus")
        ORDER BY po."createdAt" DESC
      `,
      [scope.businessId, query.module ?? scope.module, query.status ?? null],
    );
    return this.paged(rows);
  }

  async listGoodsReceipts(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT gr.*, COALESCE(items.items, '[]'::json) AS items
        FROM "GoodsReceipt" gr
        LEFT JOIN LATERAL (
          SELECT json_agg(gri.* ORDER BY gri."createdAt") AS items
          FROM "GoodsReceiptItem" gri
          WHERE gri."goodsReceiptId" = gr.id
        ) items ON TRUE
        WHERE gr."businessId" = $1
          AND gr.module = $2::"BusinessModule"
          AND ($3::text IS NULL OR gr."purchaseOrderId" = $3)
        ORDER BY gr."createdAt" DESC
      `,
      [scope.businessId, query.module ?? scope.module, query.purchaseOrderId ?? null],
    );
    return this.paged(rows);
  }

  async listTransfers(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT tr.*, row_to_json(fl.*) AS "fromLocation", row_to_json(tl.*) AS "toLocation"
        FROM "Transfer" tr
        LEFT JOIN "Location" fl ON fl.id = tr."fromLocationId"
        LEFT JOIN "Location" tl ON tl.id = tr."toLocationId"
        WHERE tr."businessId" = $1
          AND tr.module = $2::"BusinessModule"
          AND ($3::text IS NULL OR tr.status = $3::"TransferStatus")
        ORDER BY tr."createdAt" DESC
      `,
      [scope.businessId, query.module ?? scope.module, query.status ?? null],
    );
    return this.paged(rows);
  }

  async listSales(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT s.*, COALESCE(items.items, '[]'::json) AS items
        FROM "Sale" s
        LEFT JOIN LATERAL (
          SELECT json_agg(si.* ORDER BY si."createdAt") AS items
          FROM "SaleItem" si
          WHERE si."saleId" = s.id
        ) items ON TRUE
        WHERE s."businessId" = $1
          AND s.module = $2::"BusinessModule"
        ORDER BY s."createdAt" DESC
      `,
      [scope.businessId, query.module ?? scope.module],
    );
    return this.paged(rows);
  }

  async listStockMovements(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT sm.*, row_to_json(i.*) AS item, row_to_json(l.*) AS location
        FROM "StockMovement" sm
        LEFT JOIN "InventoryItem" i ON i.id = sm."itemId"
        LEFT JOIN "Location" l ON l.id = sm."locationId"
        WHERE sm."businessId" = $1
          AND sm.module = $2::"BusinessModule"
          AND ($3::text IS NULL OR sm.type = $3::"StockMovementType")
        ORDER BY sm."createdAt" DESC
      `,
      [scope.businessId, query.module ?? scope.module, query.type ?? null],
    );
    return this.paged(rows);
  }

  async createStockMovement(headers: HeadersLike, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        INSERT INTO "StockMovement" (
          id, type, quantity, "previousQuantity", "newQuantity", unit,
          reason, "referenceType", "referenceId", notes, "itemId",
          "locationId", "businessId", module, "createdById"
        )
        VALUES ($1, $2::"StockMovementType", $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::"BusinessModule", $15)
        RETURNING *
      `,
      [
        randomUUID(),
        String(body.type ?? 'ADJUSTMENT'),
        Number(body.quantity ?? 0),
        Number(body.previousQuantity ?? 0),
        Number(body.newQuantity ?? body.quantity ?? 0),
        body.unit ?? null,
        body.reason ?? null,
        body.referenceType ?? null,
        body.referenceId ?? null,
        body.notes ?? null,
        String(body.itemId ?? ''),
        String(body.locationId ?? (await this.getDefaultLocationId(scope.businessId))),
        scope.businessId,
        String(body.module ?? scope.module),
        scope.user.id,
      ],
    );
    return rows[0];
  }

  async listBundles(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT bp.*, COALESCE(items.items, '[]'::json) AS items
        FROM "BundlePackage" bp
        LEFT JOIN LATERAL (
          SELECT json_agg(bi.* ORDER BY bi."createdAt") AS items
          FROM "BundleItem" bi
          WHERE bi."bundleId" = bp.id
        ) items ON TRUE
        WHERE bp."businessId" = $1
          AND ($2::text IS NULL OR bp.status = $2::"BundleStatus")
        ORDER BY bp."createdAt" DESC
      `,
      [scope.businessId, query.status ?? null],
    );
    return this.paged(rows);
  }

  async listAdjustments(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT *
        FROM "StockAdjustment"
        WHERE "businessId" = $1
          AND module = $2::"BusinessModule"
          AND ($3::text IS NULL OR status = $3::"AdjustmentStatus")
        ORDER BY "createdAt" DESC
      `,
      [scope.businessId, query.module ?? scope.module, query.status ?? null],
    );
    return this.paged(rows);
  }

  async listRestaurantSettings(headers: HeadersLike) {
    const scope = await this.resolveScope(headers);
    return this.safeQuery<Record<string, unknown>>(
      `
        SELECT key, value
        FROM "RestaurantSetting"
        WHERE "businessId" = $1
        ORDER BY key ASC
      `,
      [scope.businessId],
    );
  }

  async upsertRestaurantSetting(headers: HeadersLike, key: string, value: unknown) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        INSERT INTO "RestaurantSetting" (id, key, value, "businessId")
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT ("businessId", key)
        DO UPDATE SET value = EXCLUDED.value, "updatedAt" = CURRENT_TIMESTAMP
        RETURNING key, value
      `,
      [randomUUID(), key, JSON.stringify(value ?? null), scope.businessId],
    );
    return rows[0];
  }

  async deleteById(tableName: string, id: string) {
    const rows = await this.safeQuery<Record<string, unknown>>(
      `DELETE FROM "${tableName}" WHERE id = $1 RETURNING *`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`${tableName} row was not found.`);
    return rows[0];
  }

  private async getDefaultLocationId(businessId: string) {
    const rows = await this.safeQuery<{ id: string }>(
      `
        SELECT id
        FROM "Location"
        WHERE "businessId" = $1
        ORDER BY "createdAt" ASC
        LIMIT 1
      `,
      [businessId],
    );
    if (!rows[0]) throw new NotFoundException('No inventory location exists for this business.');
    return rows[0].id;
  }

  private async resolveScope(headers: HeadersLike): Promise<Scope> {
    const storeType = this.headerValue(headers['x-pos-store-type']);
    const module: BusinessModule = storeType === 'RESTAURANT' ? 'RESTAURANT' : 'RETAIL';
    const bridgedEmail = this.headerValue(headers['x-pos-bridge-email']);
    const fallbackEmail = module === 'RESTAURANT' ? 'admin@restaurant.com' : 'admin@retail.com';
    const email = bridgedEmail || fallbackEmail;

    const userRows = await this.safeQuery<{
      id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      businessId: string;
      modules: BusinessModule[];
      lastLogin: string;
    }>(
      `
        SELECT
          u.id, u.name, u.email, u.role, u.status,
          u."businessId" AS "businessId",
          b.modules,
          u."lastLogin" AS "lastLogin"
        FROM "User" u
        JOIN "Business" b ON b.id = u."businessId"
        WHERE lower(u.email) = lower($1)
          AND u.status = 'Active'
        LIMIT 1
      `,
      [email],
    );

    let user = userRows[0];
    if (!user && email !== fallbackEmail) {
      const fallbackRows = await this.safeQuery<typeof userRows[number]>(
        `
          SELECT
            u.id, u.name, u.email, u.role, u.status,
            u."businessId" AS "businessId",
            b.modules,
            u."lastLogin" AS "lastLogin"
          FROM "User" u
          JOIN "Business" b ON b.id = u."businessId"
          WHERE lower(u.email) = lower($1)
            AND u.status = 'Active'
          LIMIT 1
        `,
        [fallbackEmail],
      );
      user = fallbackRows[0];
    }

    if (user) {
      return {
        businessId: user.businessId,
        module,
        user: {
          ...user,
          modules: user.modules ?? [module],
        },
      };
    }

    const businessRows = await this.safeQuery<{ id: string; modules: BusinessModule[] }>(
      `
        SELECT id, modules
        FROM "Business"
        WHERE $1::"BusinessModule" = ANY(modules)
        ORDER BY "createdAt" ASC
        LIMIT 1
      `,
      [module],
    );
    const business = businessRows[0];
    if (!business) throw new NotFoundException('No inventory business exists for this POS store type.');

    return {
      businessId: business.id,
      module,
      user: {
        id: 'pos-bridge',
        name: 'POS Bridge',
        email,
        role: 'Admin',
        status: 'Active',
        businessId: business.id,
        modules: business.modules ?? [module],
        lastLogin: new Date().toISOString(),
      },
    };
  }

  private async safeQuery<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      return await this.databaseService.query<T>(sql, params);
    } catch (error) {
      const dbError = error as { code?: string };
      if (dbError.code === '42P01') {
        return [];
      }
      throw error;
    }
  }

  private paged<T>(data: T[]): Paged<T> {
    return {
      data,
      total: data.length,
      page: 1,
      limit: data.length || 50,
      totalPages: 1,
    };
  }

  private headerValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
  }
}
