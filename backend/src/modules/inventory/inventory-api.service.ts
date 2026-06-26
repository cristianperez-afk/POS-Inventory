import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueryResultRow } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';

type HeadersLike = Record<string, string | string[] | undefined>;
type BusinessModule = 'RETAIL' | 'RESTAURANT';

// Raw item types presented through the restaurant inventory "Main > Sub" category
// tree (and therefore drives CATEGORY_HIERARCHY). MENU_ITEM dishes are excluded —
// they are managed on the menu/recipe screens, not in inventory.
const NORMALIZED_CATEGORY_ITEM_TYPES = ['INGREDIENT', 'SUPPLY'];
// Item types where a name uniquely identifies the item, so creation reuses an
// existing row instead of making a duplicate. Excludes retail/thrift items, whose
// identity also depends on size/condition/target customer.
const DEDUP_BY_NAME_ITEM_TYPES = ['INGREDIENT', 'SUPPLY'];

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

type LowStockCandidate = {
  id: string;
  name: string;
  unit: string | null;
  previousQuantity: number;
  newQuantity: number;
  reorderPoint: number | null;
  minStock: number | null;
};

@Injectable()
export class InventoryApiService {
  constructor(private readonly databaseService: DatabaseService) {}

  private async ensureInventoryItemOperationalColumns() {
    await this.safeQuery(
      `ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "expiryPeriod" TEXT`,
    );
    // Soft-delete / archive flag used by the inventory list (archived items are
    // hidden unless "Show archived" is on). Defaults to active.
    await this.safeQuery(
      `ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true`,
    );
  }

  async getCurrentUser(headers: HeadersLike) {
    const scope = await this.resolveScope(headers);
    return { user: scope.user };
  }

  async listInventory(headers: HeadersLike, query: Record<string, string | undefined>) {
    await this.ensureInventoryItemOperationalColumns();
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
          i.id, i.name, i.description, i."itemType", i.sku, i.barcode, i.category,
          i."targetCustomer", i.subcategory, i.size, i.condition,
          i.quantity, i.price, i."costPrice", i."imageUrl", i.unit,
          i."minStock", i."maxStock", i."reorderPoint", i."expiryDate",
          i."expiryPeriod", i."storageTemperature", i."dateAdded", i."locationId",
          i."isActive", i."createdAt", i."updatedAt",
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
    await this.ensureInventoryItemOperationalColumns();
    const scope = await this.resolveScope(headers);
    const itemType = String(body.itemType ?? 'RETAIL_ITEM');
    const name = String(body.name ?? 'Untitled Item').trim();

    // Reuse an existing raw item with the same name instead of creating a
    // duplicate (e.g. ordering the same new ingredient twice). Scoped to
    // ingredients/supplies — retail/thrift items can share a name across
    // size/condition variants, so name alone is not a safe identity there.
    if (DEDUP_BY_NAME_ITEM_TYPES.includes(itemType) && name && name !== 'Untitled Item') {
      const existing = await this.safeQuery<Record<string, unknown>>(
        `SELECT * FROM "InventoryItem"
         WHERE "businessId" = $1 AND "itemType" = $2::"InventoryItemType"
           AND lower(trim(name)) = lower($3)
         ORDER BY "createdAt" ASC
         LIMIT 1`,
        [scope.businessId, itemType, name.toLowerCase()],
      );
      if (existing[0]) return existing[0];
    }

    const locationId = String(body.locationId ?? (await this.getDefaultLocationId(scope.businessId)));
    const id = randomUUID();

    // Restaurant items are grouped by a "Main > Sub" category tree. Normalize the
    // incoming category into that shape and make sure the resolved Main/Sub exist
    // in CATEGORY_HIERARCHY, so every created item is countable AND visible in the
    // inventory list (the two used to drift apart for unregistered categories).
    let category = String(body.category ?? 'Uncategorized');
    let subcategory = body.subcategory == null ? null : String(body.subcategory);
    if (NORMALIZED_CATEGORY_ITEM_TYPES.includes(itemType)) {
      const normalized = this.normalizeItemCategory(itemType, body.category, body.subcategory);
      category = normalized.category;
      subcategory = normalized.subcategory;
      await this.registerCategoryInHierarchy(scope.businessId, normalized.main, normalized.sub);
    }

    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        INSERT INTO "InventoryItem" (
          id, name, description, "itemType", sku, barcode, category, "targetCustomer",
          subcategory, size, condition, quantity, price, "costPrice",
          "imageUrl", unit, "minStock", "maxStock", "reorderPoint",
          "expiryDate", "expiryPeriod", "storageTemperature", "locationId", "businessId",
          "updatedAt"
        )
        VALUES (
          $1, $2, $3, $4::"InventoryItemType", $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24,
          CURRENT_TIMESTAMP
        )
        RETURNING *
      `,
      [
        id,
        name,
        body.description ?? null,
        itemType,
        body.sku ?? null,
        body.barcode ?? null,
        category,
        body.targetCustomer ?? null,
        subcategory,
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
        body.expiryPeriod ?? null,
        body.storageTemperature ?? null,
        locationId,
        scope.businessId,
      ],
    );
    await this.syncInventoryItemToPos(id);
    return rows[0];
  }

  async updateInventoryItem(headers: HeadersLike, id: string, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    await this.ensureInventoryItemOperationalColumns();

    // Stock quantity can only be changed directly by an Admin or Manager. Staff must
    // route stock changes through the adjustment approval workflow, so we reject any
    // attempt by them to set a quantity different from the item's current value.
    let quantityChange: number | null = body.quantity === undefined ? null : Number(body.quantity);
    if (quantityChange !== null && !['Admin', 'Manager'].includes(scope.user.role)) {
      const current = await this.safeQuery<{ quantity: number }>(
        `SELECT quantity FROM "InventoryItem" WHERE id = $1 AND "businessId" = $2 LIMIT 1`,
        [id, scope.businessId],
      );
      if (!current[0]) throw new NotFoundException('Inventory item was not found.');
      if (Number(current[0].quantity) !== quantityChange) {
        throw new ForbiddenException(
          'Only an Admin or Manager can change stock quantity directly. Submit a stock adjustment for approval instead.',
        );
      }
      // Quantity is unchanged — leave it untouched.
      quantityChange = null;
    }

    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        UPDATE "InventoryItem"
        SET
          name = COALESCE($2, name),
          description = COALESCE($3, description),
          category = COALESCE($4, category),
          quantity = COALESCE($5, quantity),
          price = COALESCE($6, price),
          "costPrice" = COALESCE($7, "costPrice"),
          "imageUrl" = COALESCE($8, "imageUrl"),
          unit = COALESCE($9, unit),
          "minStock" = COALESCE($10, "minStock"),
          "maxStock" = COALESCE($11, "maxStock"),
          "reorderPoint" = COALESCE($12, "reorderPoint"),
          sku = COALESCE($13, sku),
          barcode = COALESCE($14, barcode),
          subcategory = COALESCE($15, subcategory),
          "targetCustomer" = COALESCE($16, "targetCustomer"),
          size = COALESCE($17, size),
          condition = COALESCE($18, condition),
          "locationId" = COALESCE($19, "locationId"),
          "expiryDate" = CASE WHEN $24 THEN NULL ELSE COALESCE($20, "expiryDate") END,
          "expiryPeriod" = CASE WHEN $24 THEN NULL ELSE COALESCE($21, "expiryPeriod") END,
          "storageTemperature" = COALESCE($22, "storageTemperature"),
          "isActive" = COALESCE($23, "isActive"),
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [
        id,
        body.name ?? null,
        body.description ?? null,
        body.category ?? null,
        quantityChange,
        body.price === undefined ? null : Number(body.price),
        body.costPrice === undefined ? null : Number(body.costPrice),
        body.imageUrl ?? null,
        body.unit ?? null,
        body.minStock === undefined ? null : Number(body.minStock),
        body.maxStock === undefined ? null : Number(body.maxStock),
        body.reorderPoint === undefined ? null : Number(body.reorderPoint),
        body.sku ?? null,
        body.barcode ?? null,
        body.subcategory ?? null,
        body.targetCustomer ?? null,
        body.size ?? null,
        body.condition ?? null,
        body.locationId ?? null,
        body.expiryDate ?? null,
        body.expiryPeriod ?? null,
        body.storageTemperature ?? null,
        body.isActive === undefined ? null : Boolean(body.isActive),
        Boolean(body.noExpiry),
      ],
    );

    if (!rows[0]) throw new NotFoundException('Inventory item was not found.');
    await this.syncInventoryItemToPos(id);
    return rows[0];
  }

  // Detailed receiving/cost history for a single inventory item, sourced from the
  // goods-receipt records each receive writes. Returns one row per received batch
  // (quantity received, unit cost from the PO line, total cost, date received) plus
  // the weighted-average cost used as the default inventory cost display.
  async getItemCostHistory(headers: HeadersLike, id: string) {
    const scope = await this.resolveScope(headers);

    const itemRows = await this.safeQuery<{
      id: string;
      name: string;
      unit: string | null;
      price: number;
      costPrice: number | null;
      quantity: number;
    }>(
      `
        SELECT id, name, unit, price, "costPrice", quantity
        FROM "InventoryItem"
        WHERE id = $1 AND "businessId" = $2
        LIMIT 1
      `,
      [id, scope.businessId],
    );
    const item = itemRows[0];
    if (!item) throw new NotFoundException('Inventory item was not found.');

    const entries = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT
          gri.id                                  AS id,
          gri."receivedQty"                       AS "quantityReceived",
          poi."unitPrice"                         AS "unitCost",
          (gri."receivedQty" * poi."unitPrice")   AS "totalCost",
          gr."createdAt"                          AS "dateReceived",
          gr."receiptNumber"                      AS "receiptNumber",
          po."orderNumber"                        AS "orderNumber",
          s.name                                  AS "supplierName"
        FROM "GoodsReceiptItem" gri
        JOIN "GoodsReceipt" gr ON gr.id = gri."goodsReceiptId"
        JOIN "PurchaseOrderItem" poi ON poi.id = gri."purchaseOrderItemId"
        JOIN "PurchaseOrder" po ON po.id = gr."purchaseOrderId"
        LEFT JOIN "Supplier" s ON s.id = po."supplierId"
        WHERE gri."inventoryItemId" = $1
          AND gr."businessId" = $2
          AND gri."receivedQty" > 0
        ORDER BY gr."createdAt" DESC
      `,
      [id, scope.businessId],
    );

    const normalized = entries.map((e) => ({
      ...e,
      quantityReceived: Number(e.quantityReceived ?? 0),
      unitCost: Number(e.unitCost ?? 0),
      totalCost: Number(e.totalCost ?? 0),
    }));

    const totalQuantityReceived = normalized.reduce((sum, e) => sum + e.quantityReceived, 0);
    const totalCost = normalized.reduce((sum, e) => sum + e.totalCost, 0);
    // Prefer a true weighted-average over received batches; fall back to the stored
    // cost/price when the item has no recorded receipts yet.
    const weightedAverageCost =
      totalQuantityReceived > 0
        ? totalCost / totalQuantityReceived
        : Number(item.costPrice ?? item.price ?? 0);

    return {
      itemId: item.id,
      name: item.name,
      unit: item.unit,
      currentStock: Number(item.quantity ?? 0),
      weightedAverageCost,
      totalReceipts: normalized.length,
      totalQuantityReceived,
      totalCost,
      entries: normalized,
    };
  }

  async listLocations(headers: HeadersLike) {
    const scope = await this.resolveScope(headers);
    const posUserId = this.headerValue(headers['x-pos-user-id']);
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

  async createLocation(headers: HeadersLike, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    const name = String(body.name ?? '').trim();
    if (!name) throw new BadRequestException('Location name is required.');
    const address = String(body.address ?? '').trim();
    const manager = String(body.manager ?? '').trim();
    const phone = String(body.phone ?? '').trim();

    const existing = await this.safeQuery<{ id: string }>(
      `SELECT id FROM "Location" WHERE "businessId" = $1 AND lower(name) = lower($2) LIMIT 1`,
      [scope.businessId, name],
    );
    if (existing[0]) {
      throw new ConflictException(`A location named "${name}" already exists`);
    }

    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        INSERT INTO "Location" (id, name, address, manager, phone, "businessId", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        RETURNING *, json_build_object('items', 0) AS "_count"
      `,
      [randomUUID(), name, address, manager, phone, scope.businessId],
    );
    return rows[0];
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
          COALESCE(availability."availableOrders", 0) AS "availableOrders",
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
              'physicalStock', COALESCE(item.quantity, 0),
              'usableStock',
                CASE
                  WHEN item."expiryDate" IS NOT NULL AND item."expiryDate"::date < CURRENT_DATE THEN 0
                  ELSE COALESCE(item.quantity, 0)
                END,
              'stockStatus',
                CASE
                  WHEN item.id IS NULL THEN 'missing'
                  WHEN item."expiryDate" IS NOT NULL AND item."expiryDate"::date < CURRENT_DATE THEN 'expired'
                  WHEN COALESCE(item.quantity, 0) < ri.quantity THEN 'insufficient'
                  WHEN COALESCE(item.quantity, 0) <= COALESCE(item."reorderPoint", item."minStock", 0) THEN 'low'
                  ELSE 'available'
                END,
              'item', row_to_json(item.*)
            )
            ORDER BY item.name
          ) AS items
          FROM "RecipeIngredient" ri
          JOIN "InventoryItem" item ON item.id = ri."itemId"
          WHERE ri."recipeId" = r.id
        ) ingredients ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            CASE
              WHEN COUNT(*) = 0 OR BOOL_OR(ri.quantity IS NULL OR ri.quantity <= 0) THEN 0
              ELSE GREATEST(
                0,
                FLOOR(MIN(
                  CASE
                    WHEN item."expiryDate" IS NOT NULL AND item."expiryDate"::date < CURRENT_DATE THEN 0
                    ELSE COALESCE(item.quantity, 0)::numeric
                  END / NULLIF(ri.quantity, 0)
                ))::integer
              )
            END AS "availableOrders"
          FROM "RecipeIngredient" ri
          JOIN "InventoryItem" item ON item.id = ri."itemId"
          WHERE ri."recipeId" = r.id
        ) availability ON TRUE
        WHERE r."businessId" = $1
          AND ($2::text IS NULL OR r."isActive" = ($2::boolean))
        ORDER BY r.name ASC
      `,
      [scope.businessId, query.active ?? null],
    );
    return this.paged(rows);
  }

  async createRecipe(headers: HeadersLike, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    if (scope.module !== 'RESTAURANT') {
      throw new BadRequestException('Recipes are only available for restaurant businesses.');
    }
    return this.saveRecipe(scope, undefined, body);
  }

  async updateRecipe(headers: HeadersLike, id: string, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    return this.saveRecipe(scope, id, body);
  }

  async deleteRecipe(headers: HeadersLike, id: string) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<{ id: string; menuItemId: string | null }>(
      `DELETE FROM "Recipe" WHERE id = $1 AND "businessId" = $2 RETURNING id, "menuItemId"`,
      [id, scope.businessId],
    );
    if (!rows[0]) throw new NotFoundException('Recipe was not found.');

    if (rows[0].menuItemId) {
      await this.safeQuery(
        `UPDATE products SET is_available = FALSE, updated_at = CURRENT_TIMESTAMP WHERE inventory_item_id = $1`,
        [rows[0].menuItemId],
      );
      await this.safeQuery(
        `DELETE FROM "InventoryItem" WHERE id = $1 AND "businessId" = $2`,
        [rows[0].menuItemId, scope.businessId],
      );
    }
    return rows[0];
  }

  private async saveRecipe(scope: Scope, recipeId: string | undefined, body: Record<string, unknown>) {
    const ingredients = Array.isArray(body.ingredients) ? body.ingredients as Record<string, unknown>[] : [];
    if (!String(body.name ?? '').trim() || !String(body.category ?? '').trim()) {
      throw new BadRequestException('Recipe name and category are required.');
    }
    if (ingredients.length === 0) {
      throw new BadRequestException('A recipe must have at least one ingredient.');
    }

    const defaultLocationId = await this.getDefaultLocationId(scope.businessId);
    const result = await this.databaseService.withTransaction(async (client) => {
      const current = recipeId
        ? await client.query<{ menuItemId: string | null }>(
            `SELECT "menuItemId" FROM "Recipe" WHERE id = $1 AND "businessId" = $2`,
            [recipeId, scope.businessId],
          )
        : null;
      if (recipeId && !current?.rows[0]) throw new NotFoundException('Recipe was not found.');

      const menuItemId = current?.rows[0]?.menuItemId ?? randomUUID();
      const locationId = String(body.locationId ?? defaultLocationId);
      await client.query(
        `
          INSERT INTO "InventoryItem" (
            id, name, description, "itemType", category, quantity, price, "imageUrl",
            unit, "locationId", "businessId", "updatedAt"
          ) VALUES ($1, $2, $3, 'MENU_ITEM', $4, 0, $5, $6, 'serving', $7, $8, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            price = EXCLUDED.price,
            "imageUrl" = EXCLUDED."imageUrl",
            "updatedAt" = CURRENT_TIMESTAMP
        `,
        [
          menuItemId,
          String(body.name).trim(),
          body.description ?? null,
          String(body.category).trim(),
          Number(body.sellingPrice ?? 0),
          body.imageUrl ?? null,
          locationId,
          scope.businessId,
        ],
      );

      const savedId = recipeId ?? randomUUID();
      const recipeRows = await client.query<Record<string, unknown>>(
        `
          INSERT INTO "Recipe" (
            id, name, category, servings, "yieldPercentage", "prepTimeMinutes",
            instructions, "targetFoodCost", "sellingPrice", "isActive", "imageUrl",
            modifiers, "menuItemId", "businessId", "updatedAt"
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, category = EXCLUDED.category, servings = EXCLUDED.servings,
            "yieldPercentage" = EXCLUDED."yieldPercentage", "prepTimeMinutes" = EXCLUDED."prepTimeMinutes",
            instructions = EXCLUDED.instructions, "targetFoodCost" = EXCLUDED."targetFoodCost",
            "sellingPrice" = EXCLUDED."sellingPrice", "isActive" = EXCLUDED."isActive",
            "imageUrl" = EXCLUDED."imageUrl", modifiers = EXCLUDED.modifiers,
            "menuItemId" = EXCLUDED."menuItemId", "updatedAt" = CURRENT_TIMESTAMP
          RETURNING *
        `,
        [
          savedId, String(body.name).trim(), String(body.category).trim(), Number(body.servings ?? 1),
          Number(body.yieldPercentage ?? 100), body.prepTimeMinutes == null ? null : Number(body.prepTimeMinutes),
          body.instructions ?? null, body.targetFoodCost == null ? null : Number(body.targetFoodCost),
          body.sellingPrice == null ? null : Number(body.sellingPrice), body.isActive !== false,
          body.imageUrl ?? null, JSON.stringify(body.modifiers ?? []), menuItemId, scope.businessId,
        ],
      );

      await client.query(`DELETE FROM "RecipeIngredient" WHERE "recipeId" = $1`, [savedId]);
      for (const ingredient of ingredients) {
        const itemId = String(ingredient.itemId ?? '');
        if (!itemId) throw new BadRequestException('Every recipe ingredient must link to an inventory item.');
        const quantity = Number(ingredient.quantity ?? 0);
        const unitCost = ingredient.unitCost == null ? null : Number(ingredient.unitCost);
        await client.query(
          `INSERT INTO "RecipeIngredient" (id, "recipeId", "itemId", quantity, unit, "unitCost", "totalCost", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
          [randomUUID(), savedId, itemId, quantity, ingredient.unit ?? null, unitCost, unitCost == null ? null : quantity * unitCost],
        );
      }
      return { recipe: recipeRows.rows[0], menuItemId, recipeId: savedId };
    });

    await this.syncInventoryItemToPos(result.menuItemId, result.recipeId, body.isActive !== false);
    return result.recipe;
  }

  /** Keep the inventory catalog and the numeric-ID POS compatibility catalog in lockstep. */
  private async syncInventoryItemToPos(itemId: string, recipeId?: string, isAvailable = true) {
    await this.databaseService.withTransaction(async (client) => {
      const itemResult = await client.query<{
        id: string; businessId: string; itemType: string; name: string; description: string | null;
        category: string; price: number; imageUrl: string | null; sku: string | null; barcode: string | null;
        unit: string | null; size: string | null; quantity: number; minStock: number | null;
      }>(`SELECT * FROM "InventoryItem" WHERE id = $1`, [itemId]);
      const item = itemResult.rows[0];
      if (!item || !['RETAIL_ITEM', 'MENU_ITEM'].includes(item.itemType)) return;

      const storeResult = await client.query<{ id: number; store_type: string }>(
        `
          SELECT s.id, CASE WHEN s.store_type = 'RETAIL' THEN 'RETAIL_STORE' ELSE s.store_type END AS store_type
          FROM stores s
          LEFT JOIN users pu ON pu.store_id = s.id
          LEFT JOIN "User" iu ON lower(iu.email) = lower(pu.email)
          WHERE iu."businessId" = $1
             OR (iu.id IS NULL AND s.store_type = CASE WHEN $2::text = 'RETAIL_ITEM' THEN 'RETAIL' ELSE 'RESTAURANT' END)
          ORDER BY CASE WHEN iu."businessId" = $1 THEN 0 ELSE 1 END, s.id
          LIMIT 1
        `,
        [item.businessId, item.itemType],
      );
      const store = storeResult.rows[0];
      if (!store) return;

      const categoryResult = await client.query<{ id: number }>(
        `
          INSERT INTO product_categories (store_id, store_type, name)
          SELECT $1, $2::varchar, $3::varchar
          WHERE NOT EXISTS (
            SELECT 1 FROM product_categories WHERE store_id = $1 AND store_type = $2::varchar AND lower(name) = lower($3::text)
          )
          RETURNING id
        `,
        [store.id, store.store_type, item.category],
      );
      const existingCategory = categoryResult.rows[0] ?? (await client.query<{ id: number }>(
        `SELECT id FROM product_categories WHERE store_id = $1 AND store_type = $2::varchar AND lower(name) = lower($3::text) LIMIT 1`,
        [store.id, store.store_type, item.category],
      )).rows[0];

      const productResult = await client.query<{ id: number }>(
        `
          INSERT INTO products (
            store_id, category_id, store_type, name, description, price, image_url, sku, barcode,
            unit, size, stock_quantity, low_stock_limit, is_available, inventory_item_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (store_id, inventory_item_id) WHERE inventory_item_id IS NOT NULL DO UPDATE SET
            category_id = EXCLUDED.category_id, name = EXCLUDED.name, description = EXCLUDED.description,
            price = EXCLUDED.price, image_url = EXCLUDED.image_url, sku = EXCLUDED.sku,
            barcode = EXCLUDED.barcode, unit = EXCLUDED.unit, size = EXCLUDED.size,
            stock_quantity = EXCLUDED.stock_quantity, low_stock_limit = EXCLUDED.low_stock_limit,
            is_available = EXCLUDED.is_available, updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `,
        [store.id, existingCategory?.id ?? null, store.store_type, item.name, item.description, item.price,
          item.imageUrl, item.sku, item.barcode, item.unit, item.size, Math.floor(Number(item.quantity ?? 0)), Math.floor(Number(item.minStock ?? 0)),
          isAvailable, item.id],
      );
      const productId = productResult.rows[0].id;

      if (item.itemType === 'RETAIL_ITEM') {
        await client.query(
          `
            INSERT INTO product_variants (
              product_id, size, sku, barcode, image_url, price, stock_quantity, low_stock_limit,
              is_active, inventory_item_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (product_id, inventory_item_id) WHERE inventory_item_id IS NOT NULL DO UPDATE SET
              size = EXCLUDED.size, sku = EXCLUDED.sku, barcode = EXCLUDED.barcode,
              image_url = EXCLUDED.image_url, price = EXCLUDED.price,
              stock_quantity = EXCLUDED.stock_quantity, low_stock_limit = EXCLUDED.low_stock_limit,
              is_active = EXCLUDED.is_active, updated_at = CURRENT_TIMESTAMP
          `,
          [productId, item.size, item.sku, item.barcode, item.imageUrl, item.price, Math.floor(Number(item.quantity ?? 0)), Math.floor(Number(item.minStock ?? 0)), isAvailable, item.id],
        );
      } else if (recipeId) {
        await client.query(`DELETE FROM product_ingredients WHERE product_id = $1`, [productId]);
        await client.query(
          `
            INSERT INTO product_ingredients (
              store_id, product_id, ingredient_id, ingredient_name, quantity_required,
              default_quantity, unit, additional_cost, is_required, is_removable, recipe_ingredient_id
            )
            SELECT $1, $2, ii.id, inv.name, ri.quantity, ri.quantity,
                   COALESCE(ri.unit, inv.unit, 'unit'), COALESCE(ri."unitCost", 0), TRUE, TRUE, ri.id
            FROM "RecipeIngredient" ri
            JOIN "InventoryItem" inv ON inv.id = ri."itemId"
            JOIN ingredients_inventory ii ON ii.store_id = $1 AND ii.inventory_item_id = inv.id
            WHERE ri."recipeId" = $3
          `,
          [store.id, productId, recipeId],
        );
      }
    });
  }

  async listKitchenOrders(headers: HeadersLike, query: Record<string, string | undefined>) {
    await this.ensurePosKitchenEstimateColumns();
    const scope = await this.resolveScope(headers);
    const posUserId = this.headerValue(headers['x-pos-user-id']);
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

    const posRows =
      scope.module === 'RESTAURANT'
        ? await this.safeQuery<Record<string, unknown>>(
            `
              WITH scoped_user AS (
                SELECT u.store_id
                FROM users u
                JOIN stores s ON s.id = u.store_id
                WHERE (u.id::text = $1 OR lower(u.email) = lower($2))
                  AND s.store_type = 'RESTAURANT'
                LIMIT 1
              ),
              pos_orders AS (
                SELECT
                  o.id,
                  o.order_number,
                  o.customer_name,
                  o.order_type,
                  o.table_name,
                  o.order_status,
                  o.total_amount,
                  o.payment_status,
                  COALESCE(o.ordered_at, o.running_time_start, o.preparing_started_at, o.created_at) AS ordered_at,
                  o.created_at,
                  o.updated_at,
                  o.completed_at,
                  o.payment_at,
                  o.preparing_started_at,
                  o.ready_at,
                  o.service_started_at,
                  o.served_at,
                  o.service_duration,
                  o.estimated_prep_minutes,
                  o.estimated_ready_at,
                  o.table_started_at,
                  o.table_ended_at,
                  o.running_time_start,
                  o.running_time_end,
                  o.running_duration,
                  o.is_running,
                  p.payment_number,
                  cashier.full_name AS cashier_name,
                  cashier.email AS cashier_email,
                  COUNT(oi.id)::int AS item_count,
                  COALESCE(SUM(oi.quantity), 0)::int AS quantity,
                  COALESCE(
                    json_agg(
                      json_build_object(
                        'id', oi.id,
                        'name', oi.product_name,
                        'quantity', oi.quantity,
                        'price', oi.unit_price,
                        'prepTimeMinutes', COALESCE(oi.prep_time_minutes, prod.preparation_time_minutes, 0),
                        'ingredients', COALESCE(default_ingredients.items, '[]'::json),
                        'notes', oi.notes,
                        'addedIngredients', COALESCE(customizations.added, '[]'::json),
                        'removedIngredients', COALESCE(customizations.removed, '[]'::json),
                        'changedIngredients', COALESCE(customizations.changed, '[]'::json),
                        'replacedIngredients', COALESCE(customizations.replaced, '[]'::json),
                        'modifiers', COALESCE(customizations.modifiers, '[]'::json),
                        'specialInstructions', COALESCE(customizations.instructions, '[]'::json)
                      )
                      ORDER BY oi.id ASC
                    ) FILTER (WHERE oi.id IS NOT NULL),
                    '[]'::json
                  ) AS items,
                  CASE
                    WHEN COUNT(oi.id) = 1 THEN MAX(oi.product_name)
                    ELSE CONCAT(COUNT(oi.id)::text, ' POS items')
                  END AS item_summary
                FROM orders o
                LEFT JOIN order_items oi ON oi.order_id = o.id
                LEFT JOIN LATERAL (
                  SELECT
                    COALESCE(json_agg(DISTINCT COALESCE(oic.replacement_ingredient_name, oic.original_ingredient_name, oic.notes)) FILTER (
                      WHERE oic.customization_type IN ('ADD', 'EXTRA')
                    ), '[]'::json) AS added,
                    COALESCE(json_agg(DISTINCT COALESCE(oic.original_ingredient_name, oic.notes)) FILTER (
                      WHERE oic.customization_type = 'REMOVE'
                    ), '[]'::json) AS removed,
                    COALESCE(json_agg(DISTINCT CONCAT(
                      COALESCE(oic.original_ingredient_name, 'Ingredient'),
                      ': ',
                      COALESCE(oic.original_quantity::text, '0'),
                      COALESCE(CONCAT(' ', oic.unit), ''),
                      ' -> ',
                      COALESCE(oic.new_quantity::text, '0'),
                      COALESCE(CONCAT(' ', oic.unit), '')
                    )) FILTER (
                      WHERE oic.customization_type IN ('CHANGE_QUANTITY', 'QUANTITY_CHANGE')
                    ), '[]'::json) AS changed,
                    COALESCE(json_agg(DISTINCT CONCAT(COALESCE(oic.original_ingredient_name, 'Ingredient'), ' -> ', COALESCE(oic.replacement_ingredient_name, 'Replacement'))) FILTER (
                      WHERE oic.customization_type = 'REPLACE'
                    ), '[]'::json) AS replaced,
                    COALESCE(json_agg(DISTINCT oic.notes) FILTER (
                      WHERE oic.notes IS NOT NULL AND oic.customization_type IN ('REMOVE', 'ADD', 'EXTRA', 'CHANGE_QUANTITY', 'QUANTITY_CHANGE', 'REPLACE')
                    ), '[]'::json) AS modifiers,
                    COALESCE(json_agg(DISTINCT oic.notes) FILTER (
                      WHERE oic.notes IS NOT NULL AND oic.customization_type = 'NOTE'
                    ), '[]'::json) AS instructions
                  FROM order_item_customizations oic
                  WHERE oic.order_item_id = oi.id
                ) customizations ON TRUE
                LEFT JOIN products prod ON prod.id = oi.product_id
                LEFT JOIN LATERAL (
                  SELECT COALESCE(json_agg(DISTINCT ii.ingredient_name) FILTER (WHERE ii.ingredient_name IS NOT NULL), '[]'::json) AS items
                  FROM product_ingredients pi
                  JOIN ingredients_inventory ii ON ii.id = pi.ingredient_id
                  WHERE pi.product_id = oi.product_id
                    AND pi.store_id = o.store_id
                ) default_ingredients ON TRUE
                LEFT JOIN payments p ON p.order_id = o.id
                LEFT JOIN users cashier ON cashier.id = o.cashier_id
                WHERE o.store_id = (SELECT store_id FROM scoped_user)
                  AND o.order_status IN ('PENDING', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED')
                  AND o.payment_status IN ('NOT_PAID', 'PAID', 'VOIDED', 'VOID', 'REFUNDED', 'PARTIALLY_REFUNDED')
                GROUP BY o.id, p.payment_number, cashier.full_name, cashier.email
              )
              SELECT
                CONCAT('pos-order-', id::text) AS id,
                order_number AS "orderNumber",
                COALESCE(REPLACE(payment_number, 'PAY-', 'REC-'), CONCAT('REC-', order_number)) AS "receiptNo",
                customer_name AS "customerName",
                order_type AS "orderType",
                table_name AS "tableNumber",
                item_count AS "itemCount",
                NULL::text AS "recipeId",
                quantity,
                total_amount AS "totalAmount",
                payment_status AS "paymentStatus",
                CASE
                  WHEN payment_status IN ('VOIDED', 'VOID', 'REFUNDED') OR order_status = 'CANCELLED' THEN 'CANCELLED'
                  WHEN order_status = 'SERVED' THEN 'SERVED'
                  ELSE order_status
                END AS status,
                ordered_at AS "orderedAt",
                created_at AS "createdAt",
                COALESCE(completed_at, updated_at, created_at) AS "updatedAt",
                payment_at AS "paymentAt",
                preparing_started_at AS "preparingStartedAt",
                ready_at AS "readyAt",
                service_started_at AS "serviceStartedAt",
                COALESCE(
                  served_at,
                  CASE WHEN order_status IN ('SERVED', 'COMPLETED') THEN running_time_end END,
                  CASE WHEN order_status IN ('SERVED', 'COMPLETED') THEN completed_at END,
                  CASE WHEN order_status IN ('SERVED', 'COMPLETED') THEN updated_at END
                ) AS "servedAt",
                COALESCE(
                  NULLIF(service_duration, 0),
                  CASE
                    WHEN order_status IN ('SERVED', 'COMPLETED') THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                      COALESCE(served_at, running_time_end, completed_at, updated_at, created_at)
                      - COALESCE(
                        CASE WHEN ordered_at <= COALESCE(served_at, running_time_end, completed_at, updated_at, created_at) THEN ordered_at END,
                        CASE WHEN running_time_start <= COALESCE(served_at, running_time_end, completed_at, updated_at, created_at) THEN running_time_start END,
                        CASE WHEN preparing_started_at <= COALESCE(served_at, running_time_end, completed_at, updated_at, created_at) THEN preparing_started_at END,
                        created_at,
                        COALESCE(served_at, running_time_end, completed_at, updated_at, created_at)
                      )
                    )))::BIGINT)
                    ELSE service_duration
                  END
                ) AS "serviceDuration",
                estimated_prep_minutes AS "estimatedPrepMinutes",
                estimated_ready_at AS "estimatedReadyAt",
                completed_at AS "completedAt",
                COALESCE(table_started_at, CASE WHEN order_type IN ('DINE_IN', 'MIXED') THEN COALESCE(ordered_at, running_time_start, preparing_started_at, created_at) END) AS "tableStartedAt",
                COALESCE(
                  table_ended_at,
                  CASE
                    WHEN order_type IN ('DINE_IN', 'MIXED')
                      AND (running_time_end IS NOT NULL OR order_status IN ('COMPLETED', 'CANCELLED'))
                    THEN COALESCE(running_time_end, completed_at, payment_at, updated_at)
                  END
                ) AS "tableEndedAt",
                COALESCE(table_started_at, CASE WHEN order_type IN ('DINE_IN', 'MIXED') THEN COALESCE(ordered_at, running_time_start, preparing_started_at, created_at) END) AS "stayStartedAt",
                COALESCE(
                  table_ended_at,
                  CASE
                    WHEN order_type IN ('DINE_IN', 'MIXED')
                      AND (running_time_end IS NOT NULL OR order_status IN ('COMPLETED', 'CANCELLED'))
                    THEN COALESCE(running_time_end, completed_at, payment_at, updated_at)
                  END
                ) AS "stayEndedAt",
                running_time_start AS "runningTimeStart",
                running_time_end AS "runningTimeEnd",
                running_duration AS "runningDuration",
                is_running AS "isRunning",
                json_build_object('name', item_summary) AS recipe,
                json_build_object('name', cashier_name, 'email', cashier_email) AS "completedBy",
                items,
                CONCAT('POS order ', order_number, ' - ', COALESCE(customer_name, 'Walk-in Customer'), ' - Total ', total_amount::text) AS notes,
                CASE WHEN payment_status = 'REFUNDED' THEN 'Refunded in POS' ELSE NULL END AS "voidReason",
                NULL::timestamp AS "voidedAt"
              FROM pos_orders
              ORDER BY COALESCE(completed_at, created_at) DESC
            `,
            [posUserId ?? '', scope.user.email],
          )
        : [];

    const combined = (scope.module === 'RESTAURANT' ? posRows : rows).sort((a, b) => {
      const aTime = new Date(String(a.createdAt ?? a.created_at ?? 0)).getTime();
      const bTime = new Date(String(b.createdAt ?? b.created_at ?? 0)).getTime();
      return bTime - aTime;
    });
    return this.paged(combined);
  }

  async updateKitchenOrderStatus(headers: HeadersLike, id: string, body: { status?: string }) {
    const scope = await this.resolveScope(headers);
    const posUserId = this.headerValue(headers['x-pos-user-id']);
    const nextStatus = String(body?.status ?? '').toUpperCase();
    const allowed = new Set(['PENDING', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED']);
    if (!allowed.has(nextStatus)) {
      throw new BadRequestException('Status must be Pending, Preparing, Ready, Served, Completed, or Cancelled.');
    }

    if (id.startsWith('pos-order-')) {
      const orderId = Number(id.replace('pos-order-', ''));
      if (!Number.isFinite(orderId)) throw new BadRequestException('Invalid POS order id.');

      const requestedStatus = nextStatus;
      const rows = await this.safeQuery<Record<string, unknown>>(
        `
          WITH scoped_user AS (
            SELECT u.store_id
            FROM users u
            JOIN stores s ON s.id = u.store_id
            WHERE (u.id::text = $1 OR lower(u.email) = lower($2))
              AND s.store_type = 'RESTAURANT'
            LIMIT 1
          )
          UPDATE orders
          SET order_status = CASE
                WHEN order_type = 'TAKEOUT' AND $3::varchar = 'SERVED' THEN 'COMPLETED'
                ELSE $3::varchar
              END,
              ordered_at = CASE
                WHEN $3::varchar IN ('PREPARING', 'READY', 'SERVED', 'COMPLETED')
                  THEN COALESCE(ordered_at, running_time_start, preparing_started_at, created_at, CURRENT_TIMESTAMP)
                ELSE ordered_at
              END,
              preparing_started_at = CASE
                WHEN $3::varchar IN ('PREPARING', 'READY', 'SERVED', 'COMPLETED')
                  THEN COALESCE(preparing_started_at, ordered_at, running_time_start, created_at, CURRENT_TIMESTAMP)
                ELSE preparing_started_at
              END,
              ready_at = CASE WHEN $3::varchar = 'READY' THEN COALESCE(ready_at, CURRENT_TIMESTAMP) ELSE ready_at END,
              service_started_at = CASE WHEN $3::varchar IN ('PREPARING', 'READY', 'SERVED', 'COMPLETED') THEN COALESCE(service_started_at, ordered_at, preparing_started_at, CURRENT_TIMESTAMP) ELSE service_started_at END,
              table_started_at = CASE WHEN $3::varchar IN ('PREPARING', 'READY', 'SERVED', 'COMPLETED') AND order_type IN ('DINE_IN', 'MIXED') THEN COALESCE(table_started_at, ordered_at, running_time_start, CURRENT_TIMESTAMP) ELSE table_started_at END,
              served_at = CASE WHEN $3::varchar = 'SERVED' THEN COALESCE(served_at, CURRENT_TIMESTAMP) ELSE served_at END,
              running_time_start = CASE
                WHEN $3::varchar IN ('PREPARING', 'READY', 'SERVED', 'COMPLETED')
                  THEN COALESCE(running_time_start, ordered_at, CURRENT_TIMESTAMP)
                ELSE running_time_start
              END,
              service_duration = CASE
                WHEN $3::varchar = 'SERVED'
                  THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                    COALESCE(served_at, CURRENT_TIMESTAMP)
                    - COALESCE(
                      CASE WHEN ordered_at <= COALESCE(served_at, CURRENT_TIMESTAMP) THEN ordered_at END,
                      CASE WHEN running_time_start <= COALESCE(served_at, CURRENT_TIMESTAMP) THEN running_time_start END,
                      CASE WHEN preparing_started_at <= COALESCE(served_at, CURRENT_TIMESTAMP) THEN preparing_started_at END,
                      created_at,
                      COALESCE(served_at, CURRENT_TIMESTAMP)
                    )
                  )))::BIGINT)
                ELSE service_duration
              END,
              completed_at = CASE
                WHEN $3::varchar IN ('COMPLETED', 'CANCELLED') OR (order_type = 'TAKEOUT' AND $3::varchar = 'SERVED')
                  THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
                ELSE completed_at
              END,
              table_ended_at = CASE WHEN order_type IN ('DINE_IN', 'MIXED') AND $3::varchar IN ('COMPLETED', 'CANCELLED') THEN COALESCE(table_ended_at, CURRENT_TIMESTAMP) ELSE table_ended_at END,
              -- Kitchen status updates must respect the restaurant lifecycle:
              -- a takeout stops at completion; a dine-in Pay Later order only
              -- stops after payment; a paid dine-in may stop when explicitly
              -- marked completed (or later when its table is released).
              running_time_end = CASE
                WHEN COALESCE(is_running, FALSE) = TRUE
                  AND COALESCE(running_time_start, CURRENT_TIMESTAMP) IS NOT NULL
                  AND (
                    $3::varchar = 'CANCELLED'
                    OR (order_type = 'TAKEOUT' AND $3::varchar IN ('SERVED', 'COMPLETED'))
                    OR (order_type IN ('DINE_IN', 'MIXED') AND payment_status = 'PAID' AND $3::varchar = 'COMPLETED')
                  )
                  THEN CURRENT_TIMESTAMP
                ELSE running_time_end
              END,
              running_duration = CASE
                WHEN COALESCE(is_running, FALSE) = TRUE
                  AND COALESCE(running_time_start, CURRENT_TIMESTAMP) IS NOT NULL
                  AND (
                    $3::varchar = 'CANCELLED'
                    OR (order_type = 'TAKEOUT' AND $3::varchar IN ('SERVED', 'COMPLETED'))
                    OR (order_type IN ('DINE_IN', 'MIXED') AND payment_status = 'PAID' AND $3::varchar = 'COMPLETED')
                  )
                  THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                    CURRENT_TIMESTAMP - COALESCE(
                      CASE WHEN ordered_at <= CURRENT_TIMESTAMP THEN ordered_at END,
                      CASE WHEN running_time_start <= CURRENT_TIMESTAMP THEN running_time_start END,
                      CASE WHEN preparing_started_at <= CURRENT_TIMESTAMP THEN preparing_started_at END,
                      created_at,
                      CURRENT_TIMESTAMP
                    )
                  )))::BIGINT)
                ELSE running_duration
              END,
              is_running = CASE
                WHEN COALESCE(is_running, FALSE) = TRUE
                  AND COALESCE(running_time_start, CURRENT_TIMESTAMP) IS NOT NULL
                  AND (
                    $3::varchar = 'CANCELLED'
                    OR (order_type = 'TAKEOUT' AND $3::varchar IN ('SERVED', 'COMPLETED'))
                    OR (order_type IN ('DINE_IN', 'MIXED') AND payment_status = 'PAID' AND $3::varchar = 'COMPLETED')
                  )
                  THEN FALSE
                ELSE is_running
              END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
            AND store_id = (SELECT store_id FROM scoped_user)
            AND order_type <> 'RETAIL'
          RETURNING
            id,
            order_number AS "orderNumber",
            order_status AS status,
            COALESCE(ordered_at, running_time_start, preparing_started_at, created_at) AS "orderedAt",
            COALESCE(
              served_at,
              CASE WHEN order_status IN ('SERVED', 'COMPLETED') THEN running_time_end END,
              CASE WHEN order_status IN ('SERVED', 'COMPLETED') THEN completed_at END,
              CASE WHEN order_status IN ('SERVED', 'COMPLETED') THEN updated_at END
            ) AS "servedAt",
            COALESCE(
              NULLIF(service_duration, 0),
              CASE
                WHEN order_status IN ('SERVED', 'COMPLETED') THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                  COALESCE(served_at, running_time_end, completed_at, updated_at, created_at)
                  - COALESCE(
                    CASE WHEN ordered_at <= COALESCE(served_at, running_time_end, completed_at, updated_at, created_at) THEN ordered_at END,
                    CASE WHEN running_time_start <= COALESCE(served_at, running_time_end, completed_at, updated_at, created_at) THEN running_time_start END,
                    CASE WHEN preparing_started_at <= COALESCE(served_at, running_time_end, completed_at, updated_at, created_at) THEN preparing_started_at END,
                    created_at,
                    COALESCE(served_at, running_time_end, completed_at, updated_at, created_at)
                  )
                )))::BIGINT)
                ELSE service_duration
              END
            ) AS "serviceDuration",
            updated_at AS "updatedAt"
        `,
        [posUserId ?? '', scope.user.email, requestedStatus, orderId],
      );
      if (!rows[0]) throw new NotFoundException('POS kitchen order not found.');
      return { ...rows[0], id };
    }

    const kitchenStatus = nextStatus === 'CANCELLED' ? 'VOIDED' : nextStatus;
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        UPDATE "KitchenOrder"
        SET status = $1::"KitchenOrderStatus",
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $2
          AND "businessId" = $3
        RETURNING *
      `,
      [kitchenStatus, id, scope.businessId],
    );
    if (!rows[0]) throw new NotFoundException('Kitchen order not found.');
    return rows[0];
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

  async createSupplier(headers: HeadersLike, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    const name = String(body.name ?? '').trim();
    if (!name) throw new BadRequestException('Supplier name is required.');

    const existing = await this.safeQuery<{ id: string }>(
      `SELECT id FROM "Supplier" WHERE "businessId" = $1 AND module = $2::"BusinessModule" AND lower(name) = lower($3) LIMIT 1`,
      [scope.businessId, scope.module, name],
    );
    if (existing[0]) throw new ConflictException(`Supplier "${name}" already exists`);

    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        INSERT INTO "Supplier" (
          id, name, "contactPerson", email, phone, address, category, "categoryId",
          "isActive", "businessId", module, "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::"BusinessModule", CURRENT_TIMESTAMP)
        RETURNING *
      `,
      [
        randomUUID(),
        name,
        body.contactPerson ?? null,
        body.email ?? null,
        body.phone ?? null,
        body.address ?? null,
        body.category ?? null,
        body.categoryId ?? null,
        body.isActive ?? true,
        scope.businessId,
        scope.module,
      ],
    );
    return rows[0];
  }

  async updateSupplier(headers: HeadersLike, id: string, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    const allowed = ['name', 'contactPerson', 'email', 'phone', 'address', 'category', 'categoryId', 'isActive'];
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const field of allowed) {
      if (body[field] !== undefined) {
        params.push(body[field]);
        sets.push(`"${field}" = $${params.length}`);
      }
    }
    if (sets.length === 0) throw new BadRequestException('No supplier fields to update.');
    sets.push(`"updatedAt" = CURRENT_TIMESTAMP`);

    params.push(id, scope.businessId, scope.module);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        UPDATE "Supplier"
        SET ${sets.join(', ')}
        WHERE id = $${params.length - 2} AND "businessId" = $${params.length - 1} AND module = $${params.length}::"BusinessModule"
        RETURNING *
      `,
      params,
    );
    if (!rows[0]) throw new NotFoundException(`Supplier #${id} not found`);
    return rows[0];
  }

  async deleteSupplier(headers: HeadersLike, id: string) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<{ id: string }>(
      `DELETE FROM "Supplier" WHERE id = $1 AND "businessId" = $2 AND module = $3::"BusinessModule" RETURNING id`,
      [id, scope.businessId, scope.module],
    );
    if (!rows[0]) throw new NotFoundException(`Supplier #${id} not found`);
    return rows[0];
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
        SELECT
          gr.id,
          gr."receiptNumber",
          gr."purchaseOrderId",
          gr."receivedById",
          gr.status,
          gr.notes,
          gr."actionReason",
          gr."proofImages",
          gr."businessId",
          gr.module,
          to_char(gr."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
          json_build_object(
            'id', po.id,
            'orderNumber', po."orderNumber",
            'supplier', row_to_json(s.*)
          ) AS "purchaseOrder",
          row_to_json(u.*) AS "receivedBy",
          COALESCE(items.items, '[]'::json) AS items
        FROM "GoodsReceipt" gr
        LEFT JOIN "PurchaseOrder" po ON po.id = gr."purchaseOrderId"
        LEFT JOIN "Supplier" s ON s.id = po."supplierId"
        LEFT JOIN "User" u ON u.id = gr."receivedById"
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'id', gri.id,
              'purchaseOrderItemId', gri."purchaseOrderItemId",
              'inventoryItemId', gri."inventoryItemId",
              'category', ii.category,
              'receivedQty', gri."receivedQty",
              'rejectedQty', gri."rejectedQty",
              'condition', gri.condition,
              'notes', gri.notes,
              'createdAt', to_char(gri."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'purchaseOrderItem', row_to_json(poi.*),
              'inventoryItem', row_to_json(ii.*)
            )
            ORDER BY gri."createdAt"
          ) AS items
          FROM "GoodsReceiptItem" gri
          LEFT JOIN "PurchaseOrderItem" poi ON poi.id = gri."purchaseOrderItemId"
          LEFT JOIN "InventoryItem" ii ON ii.id = gri."inventoryItemId"
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

  private async getPurchaseOrderRow(scope: Scope, id: string) {
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
        WHERE po.id = $1 AND po."businessId" = $2 AND po.module = $3::"BusinessModule"
        LIMIT 1
      `,
      [id, scope.businessId, scope.module],
    );
    if (!rows[0]) throw new NotFoundException(`Purchase order #${id} not found`);
    return rows[0];
  }

  async getPurchaseOrder(headers: HeadersLike, id: string) {
    const scope = await this.resolveScope(headers);
    return this.getPurchaseOrderRow(scope, id);
  }

  async createPurchaseOrder(headers: HeadersLike, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
    if (items.length === 0) {
      throw new BadRequestException('A purchase order must include at least one item.');
    }
    const orderNumber = `PO-${Date.now()}`;
    const totalAmount = items.reduce(
      (sum, i) => sum + Number(i.quantity ?? 0) * Number(i.unitPrice ?? 0),
      0,
    );
    const poId = randomUUID();

    await this.databaseService.withTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO "PurchaseOrder" (
            id, "orderNumber", "supplierId", status, notes, "paymentMethod",
            "paymentTerms", "expectedDelivery", "totalAmount", "businessId", module,
            "createdById", "updatedAt"
          )
          VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6, $7, $8, $9, $10::"BusinessModule", $11, CURRENT_TIMESTAMP)
        `,
        [
          poId,
          orderNumber,
          body.supplierId ?? null,
          body.notes ?? null,
          body.paymentMethod ?? null,
          body.paymentTerms ?? null,
          body.expectedDelivery ? new Date(String(body.expectedDelivery)) : null,
          totalAmount,
          scope.businessId,
          scope.module,
          scope.user.id,
        ],
      );
      for (const item of items) {
        const qty = Number(item.quantity ?? 0);
        const price = Number(item.unitPrice ?? 0);
        await client.query(
          `
            INSERT INTO "PurchaseOrderItem" (
              id, "purchaseOrderId", "inventoryItemId", name, quantity, "unitPrice", "totalPrice", "updatedAt"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          `,
          [randomUUID(), poId, item.inventoryItemId ?? null, String(item.name ?? ''), qty, price, qty * price],
        );
      }
    });

    return this.getPurchaseOrderRow(scope, poId);
  }

  async updatePurchaseOrder(headers: HeadersLike, id: string, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    const existing = await this.safeQuery<{ status: string }>(
      `SELECT status FROM "PurchaseOrder" WHERE id = $1 AND "businessId" = $2 AND module = $3::"BusinessModule" LIMIT 1`,
      [id, scope.businessId, scope.module],
    );
    if (!existing[0]) throw new NotFoundException(`Purchase order #${id} not found`);
    if (existing[0].status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT purchase orders can be edited.');
    }

    const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : null;

    await this.databaseService.withTransaction(async (client) => {
      await client.query(
        `
          UPDATE "PurchaseOrder"
          SET "supplierId" = COALESCE($1, "supplierId"),
              notes = $2,
              "paymentMethod" = $3,
              "paymentTerms" = $4,
              "expectedDelivery" = $5,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = $6
        `,
        [
          body.supplierId ?? null,
          body.notes ?? null,
          body.paymentMethod ?? null,
          body.paymentTerms ?? null,
          body.expectedDelivery ? new Date(String(body.expectedDelivery)) : null,
          id,
        ],
      );
      if (items) {
        await client.query(`DELETE FROM "PurchaseOrderItem" WHERE "purchaseOrderId" = $1`, [id]);
        let total = 0;
        for (const item of items) {
          const qty = Number(item.quantity ?? 0);
          const price = Number(item.unitPrice ?? 0);
          total += qty * price;
          await client.query(
            `
              INSERT INTO "PurchaseOrderItem" (
                id, "purchaseOrderId", "inventoryItemId", name, quantity, "unitPrice", "totalPrice", "updatedAt"
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
            `,
            [randomUUID(), id, item.inventoryItemId ?? null, String(item.name ?? ''), qty, price, qty * price],
          );
        }
        await client.query(`UPDATE "PurchaseOrder" SET "totalAmount" = $1 WHERE id = $2`, [total, id]);
      }
    });

    return this.getPurchaseOrderRow(scope, id);
  }

  async submitPurchaseOrder(headers: HeadersLike, id: string) {
    const scope = await this.resolveScope(headers);
    // Admins and Managers have approval authority, so their purchase orders skip
    // the pending-approval queue and go straight to APPROVED on submission.
    const autoApprove = ['Admin', 'Manager'].includes(scope.user.role);
    const nextStatus = autoApprove ? 'APPROVED' : 'SUBMITTED';
    const rows = await this.safeQuery<{ id: string }>(
      `UPDATE "PurchaseOrder" SET status = $4::"PurchaseOrderStatus", "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1 AND "businessId" = $2 AND module = $3::"BusinessModule" AND status = 'DRAFT' RETURNING id`,
      [id, scope.businessId, scope.module, nextStatus],
    );
    if (!rows[0]) throw new BadRequestException('Only DRAFT orders can be submitted.');
    return this.getPurchaseOrderRow(scope, id);
  }

  async approvePurchaseOrder(headers: HeadersLike, id: string) {
    const scope = await this.resolveScope(headers);
    if (scope.user.role !== 'Admin') {
      throw new ForbiddenException('Only Inventory Manager can approve purchase orders.');
    }
    const rows = await this.safeQuery<{ id: string }>(
      `UPDATE "PurchaseOrder" SET status = 'APPROVED', "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1 AND "businessId" = $2 AND module = $3::"BusinessModule" AND status = 'SUBMITTED' RETURNING id`,
      [id, scope.businessId, scope.module],
    );
    if (!rows[0]) throw new BadRequestException('Only SUBMITTED orders can be approved.');
    return this.getPurchaseOrderRow(scope, id);
  }

  async rejectPurchaseOrder(headers: HeadersLike, id: string, body: { reason?: string }) {
    const scope = await this.resolveScope(headers);
    if (scope.user.role !== 'Admin') {
      throw new ForbiddenException('Only Inventory Manager can reject purchase orders.');
    }
    const reason = String(body?.reason ?? '').trim();
    if (!reason) throw new BadRequestException('A rejection reason is required.');
    const rows = await this.safeQuery<{ id: string }>(
      `UPDATE "PurchaseOrder" SET status = 'REJECTED', "rejectionReason" = $1, "rejectedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2 AND "businessId" = $3 AND module = $4::"BusinessModule" AND status IN ('SUBMITTED', 'APPROVED') RETURNING id`,
      [reason, id, scope.businessId, scope.module],
    );
    if (!rows[0]) throw new BadRequestException('Only SUBMITTED or APPROVED orders can be rejected.');
    return this.getPurchaseOrderRow(scope, id);
  }

  async cancelPurchaseOrder(headers: HeadersLike, id: string) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<{ id: string }>(
      `UPDATE "PurchaseOrder" SET status = 'CANCELLED', "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1 AND "businessId" = $2 AND module = $3::"BusinessModule" AND status <> 'RECEIVED' RETURNING id`,
      [id, scope.businessId, scope.module],
    );
    if (!rows[0]) throw new BadRequestException('Order not found, or RECEIVED orders cannot be cancelled.');
    return this.getPurchaseOrderRow(scope, id);
  }

  private normalizeProofImages(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 6);
  }

  async quickActionGoodsReceipt(
    headers: HeadersLike,
    id: string,
    body: Record<string, unknown>,
    action: 'reject' | 'cancel',
  ) {
    const scope = await this.resolveScope(headers);
    const reason = String(body.reason ?? body.notes ?? '').trim();
    if (!reason) {
      throw new BadRequestException(`A ${action === 'reject' ? 'rejection' : 'cancellation'} reason is required.`);
    }
    const proofImages = this.normalizeProofImages(body.proofImages);
    const receiptStatus = action === 'reject' ? 'REJECTED' : 'CANCELLED';
    const nextOrderStatus = action === 'reject' ? 'REJECTED' : 'CANCELLED';

    await this.databaseService.withTransaction(async (client) => {
      const poRows = await client.query<{ id: string; status: string; orderNumber: string }>(
        `SELECT id, status, "orderNumber"
         FROM "PurchaseOrder"
         WHERE id = $1 AND "businessId" = $2 AND module = $3::"BusinessModule"
         FOR UPDATE`,
        [id, scope.businessId, scope.module],
      );
      const po = poRows.rows[0];
      if (!po) throw new NotFoundException(`Purchase order #${id} not found`);
      if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
        throw new BadRequestException('Only APPROVED or PARTIALLY_RECEIVED orders can be rejected or cancelled from Goods Received.');
      }

      const poItemRows = await client.query<{
        id: string;
        quantity: number;
        receivedQty: number;
        rejectedQty: number;
        inventoryItemId: string | null;
      }>(
        `SELECT id, quantity, "receivedQty", "rejectedQty", "inventoryItemId"
         FROM "PurchaseOrderItem"
         WHERE "purchaseOrderId" = $1
         ORDER BY "createdAt"`,
        [id],
      );
      const openItems = poItemRows.rows
        .map((item) => ({
          ...item,
          remainingQty: Math.max(0, Number(item.quantity) - Number(item.receivedQty) - Number(item.rejectedQty)),
        }))
        .filter((item) => item.remainingQty > 0);

      if (openItems.length === 0) {
        throw new BadRequestException('This purchase order has no remaining goods to reject or cancel.');
      }

      const receiptId = randomUUID();
      const receiptNumber = `GR-${Date.now()}`;
      await client.query(
        `INSERT INTO "GoodsReceipt" (
           id, "receiptNumber", "purchaseOrderId", "receivedById", status,
           notes, "actionReason", "proofImages", "businessId", module
         )
         VALUES ($1, $2, $3, $4, $5::"GoodsReceiptStatus", $6, $7, $8, $9, $10::"BusinessModule")`,
        [
          receiptId,
          receiptNumber,
          po.id,
          scope.user.id,
          receiptStatus,
          reason,
          reason,
          proofImages,
          scope.businessId,
          scope.module,
        ],
      );

      for (const item of openItems) {
        const rejectedQty = action === 'reject' ? item.remainingQty : 0;
        if (rejectedQty > 0) {
          await client.query(
            `UPDATE "PurchaseOrderItem"
             SET "rejectedQty" = "rejectedQty" + $1, "updatedAt" = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [rejectedQty, item.id],
          );
        }
        await client.query(
          `INSERT INTO "GoodsReceiptItem" (
             id, "goodsReceiptId", "purchaseOrderItemId", "inventoryItemId",
             "receivedQty", "rejectedQty", condition, notes
           )
           VALUES ($1, $2, $3, $4, 0, $5, $6, $7)`,
          [
            randomUUID(),
            receiptId,
            item.id,
            item.inventoryItemId,
            rejectedQty,
            receiptStatus,
            reason,
          ],
        );
      }

      await client.query(
        `UPDATE "PurchaseOrder"
         SET status = $1::"PurchaseOrderStatus",
             "rejectionReason" = CASE WHEN $1 = 'REJECTED' THEN $2 ELSE "rejectionReason" END,
             "rejectedAt" = CASE WHEN $1 = 'REJECTED' THEN CURRENT_TIMESTAMP ELSE "rejectedAt" END,
             "receivedById" = $3,
             "receivedAt" = CURRENT_TIMESTAMP,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [nextOrderStatus, reason, scope.user.id, po.id],
      );
    });

    return this.getPurchaseOrderRow(scope, id);
  }

  // Receive (full or partial): adds accepted qty to stock with weighted-average
  // costing, writes a GoodsReceipt + StockMovements, and advances PO status.
  async receivePurchaseOrder(headers: HeadersLike, id: string, body: Record<string, unknown>) {
    await this.ensureInventoryItemOperationalColumns();
    const scope = await this.resolveScope(headers);
    const dtoItems = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];

    await this.databaseService.withTransaction(async (client) => {
      const poRows = await client.query<{ id: string; status: string; orderNumber: string }>(
        `SELECT id, status, "orderNumber" FROM "PurchaseOrder" WHERE id = $1 AND "businessId" = $2 AND module = $3::"BusinessModule" FOR UPDATE`,
        [id, scope.businessId, scope.module],
      );
      const po = poRows.rows[0];
      if (!po) throw new NotFoundException(`Purchase order #${id} not found`);
      if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
        throw new BadRequestException('Only APPROVED or PARTIALLY_RECEIVED orders can be received.');
      }

      const poItemRows = await client.query<{
        id: string;
        name: string;
        quantity: number;
        receivedQty: number;
        rejectedQty: number;
        inventoryItemId: string | null;
        unitPrice: number;
      }>(
        `SELECT id, name, quantity, "receivedQty", "rejectedQty", "inventoryItemId", "unitPrice" FROM "PurchaseOrderItem" WHERE "purchaseOrderId" = $1`,
        [id],
      );
      const poItems = new Map(poItemRows.rows.map((r) => [r.id, r]));

      const receiptId = randomUUID();
      const receiptNumber = `GR-${Date.now()}`;
      const receiptItems: {
        poItemId: string;
        inventoryItemId: string | null;
        receivedQty: number;
        rejectedQty: number;
        condition: unknown;
        notes: unknown;
      }[] = [];

      for (const ri of dtoItems) {
        const poItem = poItems.get(String(ri.id));
        if (!poItem) {
          throw new BadRequestException(`Purchase order item #${ri.id} does not belong to this order.`);
        }
        const receivedQty = Number(ri.receivedQty ?? 0);
        const rejectedQty = Number(ri.rejectedQty ?? 0);
        const submittedQty = receivedQty + rejectedQty;
        if (submittedQty <= 0) continue;
        const processedQty = Number(poItem.receivedQty) + Number(poItem.rejectedQty);
        if (processedQty + submittedQty > Number(poItem.quantity)) {
          throw new BadRequestException(`Receipt quantity for "${poItem.name}" exceeds the remaining ordered quantity.`);
        }

        if (receivedQty > 0 && poItem.inventoryItemId) {
          const invRows = await client.query<{ quantity: number; price: number; unit: string | null; locationId: string }>(
            `SELECT quantity, price, unit, "locationId" FROM "InventoryItem" WHERE id = $1 AND "businessId" = $2 FOR UPDATE`,
            [poItem.inventoryItemId, scope.businessId],
          );
          const inv = invRows.rows[0];
          if (!inv) throw new BadRequestException(`Inventory item for "${poItem.name}" is unavailable.`);

          const previousQuantity = Number(inv.quantity);
          const newQuantity = previousQuantity + receivedQty;
          const wacPrice =
            newQuantity > 0
              ? (previousQuantity * Number(inv.price) + receivedQty * Number(poItem.unitPrice)) / newQuantity
              : Number(inv.price);

          await client.query(
            `
              UPDATE "InventoryItem"
              SET quantity = $1, price = $2,
                  "expiryDate" = COALESCE($3, "expiryDate"),
                  "expiryPeriod" = COALESCE($4, "expiryPeriod"),
                  "storageTemperature" = COALESCE($5, "storageTemperature"),
                  "updatedAt" = CURRENT_TIMESTAMP
              WHERE id = $6
            `,
            [
              newQuantity,
              wacPrice,
              ri.expiryDate ? new Date(String(ri.expiryDate)) : null,
              ri.expiryPeriod ?? null,
              ri.storageTemperature ?? null,
              poItem.inventoryItemId,
            ],
          );

          await client.query(
            `
              INSERT INTO "StockMovement" (
                id, type, quantity, "previousQuantity", "newQuantity", unit,
                reason, "referenceType", "referenceId", notes, "itemId",
                "locationId", "businessId", module, "createdById"
              )
              VALUES ($1, 'STOCK_IN', $2, $3, $4, $5, 'Purchase order received', 'PURCHASE_ORDER', $6, $7, $8, $9, $10, $11::"BusinessModule", $12)
            `,
            [
              randomUUID(),
              receivedQty,
              previousQuantity,
              newQuantity,
              inv.unit,
              po.id,
              `Received from PO ${po.orderNumber}`,
              poItem.inventoryItemId,
              inv.locationId,
              scope.businessId,
              scope.module,
              scope.user.id,
            ],
          );
        }

        await client.query(
          `UPDATE "PurchaseOrderItem" SET "receivedQty" = "receivedQty" + $1, "rejectedQty" = "rejectedQty" + $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3`,
          [receivedQty, rejectedQty, poItem.id],
        );
        receiptItems.push({
          poItemId: poItem.id,
          inventoryItemId: poItem.inventoryItemId,
          receivedQty,
          rejectedQty,
          condition: ri.condition ?? null,
          notes: ri.notes ?? null,
        });
      }

      if (receiptItems.length === 0) {
        throw new BadRequestException('At least one item quantity must be received or rejected.');
      }

      await client.query(
        `INSERT INTO "GoodsReceipt" (id, "receiptNumber", "purchaseOrderId", "receivedById", status, notes, "proofImages", "businessId", module)
         VALUES ($1, $2, $3, $4, 'RECEIVED', $5, $6, $7, $8::"BusinessModule")`,
        [receiptId, receiptNumber, po.id, scope.user.id, body.notes ?? null, this.normalizeProofImages(body.proofImages), scope.businessId, scope.module],
      );
      for (const it of receiptItems) {
        await client.query(
          `INSERT INTO "GoodsReceiptItem" (id, "goodsReceiptId", "purchaseOrderItemId", "inventoryItemId", "receivedQty", "rejectedQty", condition, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), receiptId, it.poItemId, it.inventoryItemId, it.receivedQty, it.rejectedQty, it.condition, it.notes],
        );
      }

      const allItems = await client.query<{ quantity: number; receivedQty: number; rejectedQty: number }>(
        `SELECT quantity, "receivedQty", "rejectedQty" FROM "PurchaseOrderItem" WHERE "purchaseOrderId" = $1`,
        [id],
      );
      const isComplete = allItems.rows.every(
        (r) => Number(r.receivedQty) + Number(r.rejectedQty) >= Number(r.quantity),
      );
      await client.query(
        `UPDATE "PurchaseOrder" SET status = $1::"PurchaseOrderStatus", "receivedById" = $2, "receivedAt" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $4`,
        [isComplete ? 'RECEIVED' : 'PARTIALLY_RECEIVED', scope.user.id, isComplete ? new Date() : null, id],
      );
    });

    return this.getPurchaseOrderRow(scope, id);
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
    const posRows = await this.safeQuery<Record<string, unknown>>(
      `
        WITH scoped_user AS (
          SELECT u.store_id, s.store_type
          FROM users u
          JOIN stores s ON s.id = u.store_id
          WHERE lower(u.email) = lower($1)
          LIMIT 1
        )
        SELECT
          CONCAT('pos-order-', o.id::text) AS id,
          o.order_number AS "transactionNumber",
          COALESCE(o.completed_at, o.created_at) AS "createdAt",
          COALESCE(o.completed_at, o.created_at) AS "updatedAt",
          o.total_amount AS total,
          o.subtotal,
          o.discount_amount AS discount,
          o.tax_amount AS tax,
          COALESCE(p.amount_paid, o.total_amount) AS "amountPaid",
          COALESCE(p.change_amount, 0) AS change,
          COALESCE(p.payment_method, 'Cash') AS "paymentMethod",
          CASE
            WHEN o.payment_status = 'REFUNDED' THEN 'REFUNDED'
            WHEN o.payment_status IN ('VOIDED', 'VOID') THEN 'REFUNDED'
            ELSE 'COMPLETED'
          END AS status,
          o.customer_name AS customer,
          json_build_object('id', cashier.id, 'name', cashier.full_name) AS cashier,
          NULL::json AS location,
          COALESCE(items.items, '[]'::json) AS items
        FROM orders o
        JOIN scoped_user su ON su.store_id = o.store_id
        LEFT JOIN payments p ON p.order_id = o.id
        LEFT JOIN users cashier ON cashier.id = o.cashier_id
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'id', oi.id::text,
              'name', oi.product_name,
              'quantity', oi.quantity,
              'unitPrice', oi.unit_price,
              'totalPrice', oi.line_total
            )
            ORDER BY oi.id
          ) AS items
          FROM order_items oi
          WHERE oi.order_id = o.id
        ) items ON TRUE
        WHERE o.order_status = 'COMPLETED'
          AND o.payment_status IN ('PAID', 'VOIDED', 'VOID', 'REFUNDED')
          AND ($2::text IS NULL OR su.store_type = $2)
          -- Skip POS orders already mirrored into "Sale" so they aren't shown twice.
          AND NOT EXISTS (
            SELECT 1 FROM "Sale" sl
            WHERE sl."transactionNumber" = CONCAT('POS-', o.order_number)
          )
        ORDER BY COALESCE(o.completed_at, o.created_at) DESC
      `,
      [scope.user.email, query.module ?? scope.module],
    );
    const combined = [...rows, ...posRows].sort((a, b) => {
      const aTime = new Date(String(a.createdAt ?? a.created_at ?? 0)).getTime();
      const bTime = new Date(String(b.createdAt ?? b.created_at ?? 0)).getTime();
      return bTime - aTime;
    });
    return this.paged(combined);
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

  // Summary of ingredients consumed (RECIPE_CONSUMPTION) per item over a date range,
  // for the restaurant kitchen-usage report. Optional `from`/`to` are inclusive dates
  // (YYYY-MM-DD); defaults to the trailing 30 days.
  async ingredientConsumptionReport(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const from = query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : null;
    const to = query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : null;

    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT
          sm."itemId"                                   AS "itemId",
          COALESCE(i.name, 'Unknown item')              AS name,
          i.category                                    AS category,
          COALESCE(sm.unit, i.unit)                     AS unit,
          SUM(sm.quantity)                              AS "totalConsumed",
          COUNT(*)::int                                 AS "movementCount",
          MIN(sm."createdAt")                           AS "firstConsumedAt",
          MAX(sm."createdAt")                           AS "lastConsumedAt",
          i.quantity                                    AS "currentStock"
        FROM "StockMovement" sm
        LEFT JOIN "InventoryItem" i ON i.id = sm."itemId"
        WHERE sm."businessId" = $1
          AND sm.module = $2::"BusinessModule"
          AND sm.type = 'RECIPE_CONSUMPTION'::"StockMovementType"
          AND ($3::date IS NULL OR sm."createdAt" >= $3::date)
          AND ($4::date IS NULL OR sm."createdAt" < ($4::date + INTERVAL '1 day'))
        GROUP BY sm."itemId", i.name, i.category, COALESCE(sm.unit, i.unit), i.quantity
        ORDER BY SUM(sm.quantity) DESC
      `,
      [scope.businessId, query.module ?? scope.module, from, to],
    );

    const items = rows.map((r) => ({ ...r, totalConsumed: Number(r.totalConsumed ?? 0) }));
    return {
      from,
      to,
      totalIngredients: items.length,
      totalQuantityConsumed: items.reduce((sum, r) => sum + Number(r.totalConsumed ?? 0), 0),
      items,
    };
  }

  // Summary of goods sold per item over a date range, from completed sales' line
  // items (excludes voided/refunded sales). Optional `from`/`to` are inclusive dates
  // (YYYY-MM-DD); defaults to the trailing 30 days. Bundle-ready: if a bundle is sold
  // as component items, each component appears here; if sold as one bundle line, the
  // bundle appears by name.
  async itemsSoldReport(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const from = query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : null;
    const to = query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : null;

    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT
          si."inventoryItemId"                          AS "itemId",
          COALESCE(i.name, si.name, 'Unknown item')     AS name,
          i.category                                    AS category,
          i.unit                                        AS unit,
          SUM(si.quantity)                              AS "unitsSold",
          SUM(si."totalPrice")                          AS revenue,
          COUNT(DISTINCT si."saleId")::int              AS "salesCount",
          MAX(s."createdAt")                            AS "lastSoldAt",
          i.quantity                                    AS "currentStock"
        FROM "SaleItem" si
        JOIN "Sale" s ON s.id = si."saleId"
        LEFT JOIN "InventoryItem" i ON i.id = si."inventoryItemId"
        WHERE s."businessId" = $1
          AND s.module = $2::"BusinessModule"
          AND s.status = 'COMPLETED'
          AND ($3::date IS NULL OR s."createdAt" >= $3::date)
          AND ($4::date IS NULL OR s."createdAt" < ($4::date + INTERVAL '1 day'))
        GROUP BY si."inventoryItemId", COALESCE(i.name, si.name, 'Unknown item'), i.category, i.unit, i.quantity
        ORDER BY SUM(si."totalPrice") DESC
      `,
      [scope.businessId, query.module ?? scope.module, from, to],
    );

    const items = rows.map((r) => ({
      ...r,
      unitsSold: Number(r.unitsSold ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));
    return {
      from,
      to,
      totalItems: items.length,
      totalUnitsSold: items.reduce((sum, r) => sum + Number(r.unitsSold ?? 0), 0),
      totalRevenue: items.reduce((sum, r) => sum + Number(r.revenue ?? 0), 0),
      items,
    };
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

  async getAdjustment(headers: HeadersLike, id: string) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT *
        FROM "StockAdjustment"
        WHERE id = $1 AND "businessId" = $2 AND module = $3::"BusinessModule"
        LIMIT 1
      `,
      [id, scope.businessId, scope.module],
    );
    if (!rows[0]) throw new NotFoundException(`Adjustment #${id} not found`);
    const items = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT ai.*,
               ii.name AS "inventoryItemName",
               ii.unit AS "inventoryItemUnit",
               ii.category AS "inventoryItemCategory"
        FROM "StockAdjustmentItem" ai
        JOIN "InventoryItem" ii ON ii.id = ai."inventoryItemId"
        WHERE ai."adjustmentId" = $1
      `,
      [id],
    );
    return { ...rows[0], items };
  }

  async createAdjustment(headers: HeadersLike, body: Record<string, unknown>) {
    const scope = await this.resolveScope(headers);
    const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
    if (items.length === 0) {
      throw new BadRequestException('An adjustment must include at least one item.');
    }

    const type = String(body.type ?? '').toUpperCase();
    if (!['ADD', 'REMOVE', 'DAMAGE', 'LOST', 'FOUND', 'RECOUNT'].includes(type)) {
      throw new BadRequestException('A valid adjustment type is required.');
    }

    const reason = String(body.reason ?? '').trim();
    if (!reason) throw new BadRequestException('An adjustment reason is required.');

    const itemIds = [...new Set(items.map((i) => String(i.inventoryItemId ?? '')))];
    const countRows = await this.safeQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "InventoryItem" WHERE id = ANY($1::text[]) AND "businessId" = $2`,
      [itemIds, scope.businessId],
    );
    if (Number(countRows[0]?.count ?? 0) !== itemIds.length) {
      throw new BadRequestException('One or more inventory items are unavailable for this business.');
    }

    const defaultLocationId = await this.getDefaultLocationId(scope.businessId);
    const adjustmentId = randomUUID();
    const adjustmentNumber = `ADJ-${Date.now()}`;

    await this.databaseService.withTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO "StockAdjustment" (
            id, "adjustmentNumber", type, reason, status,
            "businessId", module, "createdById", "updatedAt"
          )
          VALUES ($1, $2, $3::"AdjustmentType", $4, 'PENDING', $5, $6::"BusinessModule", $7, CURRENT_TIMESTAMP)
        `,
        [adjustmentId, adjustmentNumber, type, reason, scope.businessId, scope.module, scope.user.id],
      );
      for (const item of items) {
        await client.query(
          `
            INSERT INTO "StockAdjustmentItem" (id, "adjustmentId", "inventoryItemId", "quantityChange", "locationId")
            VALUES ($1, $2, $3, $4, $5)
          `,
          [
            randomUUID(),
            adjustmentId,
            String(item.inventoryItemId),
            Number(item.quantityChange ?? 0),
            String(item.locationId ?? defaultLocationId),
          ],
        );
      }
    });

    return this.getAdjustment(headers, adjustmentId);
  }

  async approveAdjustment(headers: HeadersLike, id: string) {
    const scope = await this.resolveScope(headers);
    if (scope.user.role !== 'Admin') {
      throw new ForbiddenException('Only Inventory Manager can approve adjustments.');
    }

    const lowStockCandidates: LowStockCandidate[] = [];

    await this.databaseService.withTransaction(async (client) => {
      lowStockCandidates.length = 0; // reset in case the transaction retries
      const adjRows = await client.query<Record<string, unknown>>(
        `
          SELECT id, status, type, reason, "adjustmentNumber"
          FROM "StockAdjustment"
          WHERE id = $1 AND "businessId" = $2 AND module = $3::"BusinessModule"
          FOR UPDATE
        `,
        [id, scope.businessId, scope.module],
      );
      const adj = adjRows.rows[0];
      if (!adj) throw new NotFoundException(`Adjustment #${id} not found`);
      if (adj.status !== 'PENDING') {
        throw new BadRequestException('Only PENDING adjustments can be approved.');
      }

      const itemRows = await client.query<{
        inventoryItemId: string;
        quantityChange: number;
        locationId: string;
      }>(
        `SELECT "inventoryItemId", "quantityChange", "locationId" FROM "StockAdjustmentItem" WHERE "adjustmentId" = $1`,
        [id],
      );

      for (const adjItem of itemRows.rows) {
        const invRows = await client.query<{
          quantity: number;
          unit: string | null;
          name: string;
          reorderPoint: number | null;
          minStock: number | null;
        }>(
          `SELECT quantity, unit, name, "reorderPoint", "minStock" FROM "InventoryItem" WHERE id = $1 AND "businessId" = $2 FOR UPDATE`,
          [adjItem.inventoryItemId, scope.businessId],
        );
        const inv = invRows.rows[0];
        if (!inv) {
          throw new NotFoundException(`Inventory item ${adjItem.inventoryItemId} is no longer available.`);
        }
        const previousQuantity = Number(inv.quantity);
        const newQuantity = previousQuantity + Number(adjItem.quantityChange);
        if (newQuantity < 0) {
          throw new BadRequestException(`Applying this adjustment would make "${inv.name}" quantity negative.`);
        }

        lowStockCandidates.push({
          id: adjItem.inventoryItemId,
          name: inv.name,
          unit: inv.unit,
          previousQuantity,
          newQuantity,
          reorderPoint: inv.reorderPoint,
          minStock: inv.minStock,
        });

        await client.query(`UPDATE "InventoryItem" SET quantity = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`, [
          newQuantity,
          adjItem.inventoryItemId,
        ]);

        await client.query(
          `
            INSERT INTO "StockMovement" (
              id, type, quantity, "previousQuantity", "newQuantity", unit,
              reason, "referenceType", "referenceId", notes, "itemId",
              "locationId", "businessId", module, "createdById"
            )
            VALUES ($1, 'ADJUSTMENT', $2, $3, $4, $5, $6, 'ADJUSTMENT', $7, $8, $9, $10, $11, $12::"BusinessModule", $13)
          `,
          [
            randomUUID(),
            Math.abs(Number(adjItem.quantityChange)),
            previousQuantity,
            newQuantity,
            inv.unit,
            adj.reason,
            id,
            `${adj.type} adjustment: ${adj.adjustmentNumber}`,
            adjItem.inventoryItemId,
            adjItem.locationId,
            scope.businessId,
            scope.module,
            scope.user.id,
          ],
        );
      }

      await client.query(
        `UPDATE "StockAdjustment" SET status = 'APPROVED', "reviewedById" = $1, "reviewedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
        [scope.user.id, id],
      );
    });

    // Best-effort low-stock alerts after the adjustment commits.
    await this.notifyLowStock(scope.businessId, lowStockCandidates).catch(() => undefined);

    return this.getAdjustment(headers, id);
  }

  // Emits a LOW_STOCK notification for each item that crossed at/below its
  // reorder threshold (downward only), de-duped against existing unread alerts,
  // to every Inventory Manager in the business.
  private async notifyLowStock(businessId: string, items: LowStockCandidate[]) {
    const crossed = items.filter((item) => {
      const threshold = item.reorderPoint ?? item.minStock ?? 0;
      return threshold > 0 && item.previousQuantity > threshold && item.newQuantity <= threshold;
    });
    if (crossed.length === 0) return;

    const managers = await this.safeQuery<{ id: string }>(
      `SELECT id FROM "User" WHERE "businessId" = $1 AND role = 'Admin' AND status = 'Active'`,
      [businessId],
    );
    const recipientIds = managers.map((m) => m.id);
    if (recipientIds.length === 0) return;

    for (const item of crossed) {
      const existing = await this.safeQuery<{ id: string }>(
        `
          SELECT id FROM "Notification"
          WHERE "businessId" = $1 AND type = 'LOW_STOCK'
            AND "entityType" = 'INVENTORY_ITEM' AND "entityId" = $2 AND "isRead" = false
          LIMIT 1
        `,
        [businessId, item.id],
      );
      if (existing[0]) continue;

      const unit = item.unit ? ` ${item.unit}` : '';
      const threshold = item.reorderPoint ?? item.minStock;
      const message = `"${item.name}" is low — ${item.newQuantity}${unit} left (reorder at ${threshold}${unit}).`;

      for (const userId of recipientIds) {
        await this.safeQuery(
          `
            INSERT INTO "Notification" (id, type, title, message, "entityType", "entityId", "userId", "businessId")
            VALUES ($1, 'LOW_STOCK', 'Low stock', $2, 'INVENTORY_ITEM', $3, $4, $5)
          `,
          [randomUUID(), message, item.id, userId, businessId],
        );
      }
    }
  }

  async rejectAdjustment(headers: HeadersLike, id: string, body: { reason?: string }) {
    const scope = await this.resolveScope(headers);
    if (scope.user.role !== 'Admin') {
      throw new ForbiddenException('Only Inventory Manager can reject adjustments.');
    }
    const reason = String(body?.reason ?? '').trim();
    if (!reason) throw new BadRequestException('A rejection reason is required.');

    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        UPDATE "StockAdjustment"
        SET status = 'REJECTED', "rejectionReason" = $1, "reviewedById" = $2,
            "reviewedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $3 AND "businessId" = $4 AND module = $5::"BusinessModule" AND status = 'PENDING'
        RETURNING id
      `,
      [reason, scope.user.id, id, scope.businessId, scope.module],
    );
    if (!rows[0]) {
      throw new BadRequestException('Adjustment not found or is not PENDING.');
    }
    return this.getAdjustment(headers, id);
  }

  async listNotifications(headers: HeadersLike, query: Record<string, string | undefined>) {
    const scope = await this.resolveScope(headers);
    const onlyUnread = query.unread === 'true';
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        SELECT *
        FROM "Notification"
        WHERE "userId" = $1
          AND "businessId" = $2
          AND ($3::boolean IS NOT TRUE OR "isRead" = false)
        ORDER BY "createdAt" DESC
      `,
      [scope.user.id, scope.businessId, onlyUnread],
    );
    return this.paged(rows);
  }

  async countUnreadNotifications(headers: HeadersLike) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "Notification" WHERE "userId" = $1 AND "businessId" = $2 AND "isRead" = false`,
      [scope.user.id, scope.businessId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async markNotificationRead(headers: HeadersLike, id: string) {
    const scope = await this.resolveScope(headers);
    const rows = await this.safeQuery<Record<string, unknown>>(
      `
        UPDATE "Notification"
        SET "isRead" = true, "readAt" = CURRENT_TIMESTAMP
        WHERE id = $1 AND "userId" = $2
        RETURNING *
      `,
      [id, scope.user.id],
    );
    if (!rows[0]) throw new NotFoundException(`Notification #${id} not found`);
    return rows[0];
  }

  async markAllNotificationsRead(headers: HeadersLike) {
    const scope = await this.resolveScope(headers);
    await this.safeQuery(
      `
        UPDATE "Notification"
        SET "isRead" = true, "readAt" = CURRENT_TIMESTAMP
        WHERE "userId" = $1 AND "businessId" = $2 AND "isRead" = false
      `,
      [scope.user.id, scope.businessId],
    );
    return { success: true };
  }

  // Coerce a raw ingredient/supply category/subcategory pair into a canonical
  // "Main > Sub" form, keeping its own main with a "General" fallback sub so it
  // always has a place in the category tree.
  private normalizeItemCategory(
    _itemType: string,
    rawCategory: unknown,
    rawSubcategory: unknown,
  ): { category: string; subcategory: string; main: string; sub: string } {
    const category = String(rawCategory ?? '').trim();
    const subcategory = rawSubcategory == null ? '' : String(rawSubcategory).trim();

    let main = '';
    let sub = '';
    if (category.includes(' > ')) {
      const idx = category.indexOf(' > ');
      main = category.slice(0, idx).trim();
      sub = category.slice(idx + 3).trim();
    } else {
      main = category;
      sub = subcategory;
    }

    if (!main) main = 'Other';
    if (!sub) sub = 'General';
    return { category: `${main} > ${sub}`, subcategory: sub, main, sub };
  }

  // Ensure a Main/Sub pair is present in the business CATEGORY_HIERARCHY setting,
  // adding it (and the main bucket) when missing. Additive only — never removes.
  private async registerCategoryInHierarchy(
    businessId: string,
    main: string,
    sub: string,
  ): Promise<void> {
    const rows = await this.safeQuery<{ value: unknown }>(
      `SELECT value FROM "RestaurantSetting" WHERE "businessId" = $1 AND key = 'CATEGORY_HIERARCHY' LIMIT 1`,
      [businessId],
    );

    let hierarchy: Record<string, string[]> = {};
    const raw = rows[0]?.value;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      hierarchy = raw as Record<string, string[]>;
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          hierarchy = parsed as Record<string, string[]>;
        }
      } catch {
        hierarchy = {};
      }
    }

    const subs = Array.isArray(hierarchy[main]) ? [...hierarchy[main]] : [];
    let changed = !Array.isArray(hierarchy[main]);
    if (!subs.includes(sub)) {
      subs.push(sub);
      changed = true;
    }
    if (!changed) return;

    hierarchy[main] = subs;
    await this.safeQuery(
      `
        INSERT INTO "RestaurantSetting" (id, key, value, "businessId", "updatedAt")
        VALUES ($1, 'CATEGORY_HIERARCHY', $2::jsonb, $3, CURRENT_TIMESTAMP)
        ON CONFLICT ("businessId", key)
        DO UPDATE SET value = EXCLUDED.value, "updatedAt" = CURRENT_TIMESTAMP
      `,
      [randomUUID(), JSON.stringify(hierarchy), businessId],
    );
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
        INSERT INTO "RestaurantSetting" (id, key, value, "businessId", "updatedAt")
        VALUES ($1, $2, $3::jsonb, $4, CURRENT_TIMESTAMP)
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

  private async ensurePosKitchenEstimateColumns() {
    await this.safeQuery(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS estimated_prep_minutes INT,
        ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMP
    `);
    await this.safeQuery(`
      UPDATE orders
      SET ordered_at = COALESCE(running_time_start, preparing_started_at, created_at)
      WHERE ordered_at IS NULL
        AND order_type <> 'RETAIL'
        AND COALESCE(running_time_start, preparing_started_at, created_at) IS NOT NULL
    `);
    await this.safeQuery(`
      ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS prep_time_minutes INT,
        ADD COLUMN IF NOT EXISTS customization_prep_minutes INT DEFAULT 0
    `);
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
