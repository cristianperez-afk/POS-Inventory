// Merge duplicate inventory items. Items are considered duplicates when they share
// the same business, item type, and (trimmed, case-insensitive) name. For each
// duplicate group the oldest row is kept as canonical and the rest are merged in:
//   - quantity  -> summed
//   - price     -> quantity-weighted average cost (simple mean when total qty is 0)
//   - costPrice -> quantity-weighted average over rows that have a cost
//   - sku       -> first non-empty sku in the group (canonical first)
// Every foreign key that points at a duplicate is re-pointed to the canonical row,
// then the duplicates are deleted. Re-runnable and transactional.
//
// Usage:
//   node scripts/merge-duplicate-inventory-items.js          (apply)
//   node scripts/merge-duplicate-inventory-items.js --dry     (preview only)

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// table -> column that references "InventoryItem"(id)
const REFERENCING_FKS = [
  ['StockMovement', 'itemId'],
  ['Recipe', 'menuItemId'],
  ['RecipeIngredient', 'itemId'],
  ['PurchaseOrderItem', 'inventoryItemId'],
  ['TransferItem', 'inventoryItemId'],
  ['SaleItem', 'inventoryItemId'],
  ['BundleItem', 'inventoryItemId'],
  ['GoodsReceiptItem', 'inventoryItemId'],
  ['StockAdjustmentItem', 'inventoryItemId'],
];

function weightedCost(rows, field) {
  const totalQty = rows.reduce((s, r) => s + Number(r.quantity || 0), 0);
  if (totalQty > 0) {
    const num = rows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r[field] || 0), 0);
    return num / totalQty;
  }
  // No stock to weight by — fall back to a simple mean of present values.
  const vals = rows.map((r) => Number(r[field] || 0));
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function weightedCostNullable(rows) {
  const present = rows.filter((r) => r.costPrice != null);
  if (present.length === 0) return null;
  return weightedCost(present, 'costPrice');
}

async function main() {
  const dryRun = process.argv.includes('--dry') || process.argv.includes('--dry-run');
  const connectionString =
    process.env.DATABASE_URL || process.env.DATABASE_URL_SUPABASE || process.env.DATABASE_URL_LOCAL;
  if (!connectionString) throw new Error('DATABASE_URL is missing in backend/.env');

  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 1),
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? 5000),
    connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? 10000),
    allowExitOnIdle: true,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: groups } = await client.query(`
      SELECT "businessId", "itemType", lower(trim(name)) AS norm_name, COUNT(*)::int AS n
      FROM "InventoryItem"
      GROUP BY "businessId", "itemType", lower(trim(name))
      HAVING COUNT(*) > 1
      ORDER BY n DESC`);

    if (groups.length === 0) {
      console.log('No duplicate inventory items found.');
      await client.query('ROLLBACK');
      return;
    }

    let mergedGroups = 0;
    let removedRows = 0;

    for (const g of groups) {
      const { rows: items } = await client.query(
        `SELECT id, name, sku, unit, quantity, price, "costPrice", "createdAt"
         FROM "InventoryItem"
         WHERE "businessId" = $1 AND "itemType" = $2 AND lower(trim(name)) = $3
         ORDER BY "createdAt" ASC, id ASC`,
        [g.businessId, g.itemType, g.norm_name],
      );
      if (items.length < 2) continue;

      const canonical = items[0];
      const dupes = items.slice(1);
      const totalQty = items.reduce((s, r) => s + Number(r.quantity || 0), 0);
      const mergedPrice = weightedCost(items, 'price');
      const mergedCost = weightedCostNullable(items);
      const mergedSku = items.map((r) => r.sku).find((s) => s != null && String(s).trim() !== '') ?? null;
      const units = [...new Set(items.map((r) => r.unit))];

      mergedGroups += 1;
      removedRows += dupes.length;
      console.log(
        `\n"${canonical.name}" [${g.itemType}] — merging ${dupes.length} duplicate(s) into ${canonical.id.slice(0, 8)}`,
      );
      console.log(
        `   qty ${items.map((r) => r.quantity).join(' + ')} = ${totalQty} | price -> ${mergedPrice.toFixed(2)} (WAC)` +
          ` | cost -> ${mergedCost == null ? 'null' : mergedCost.toFixed(2)} | sku -> ${mergedSku ?? 'null'}`,
      );
      if (units.length > 1) {
        console.log(`   ! WARNING: mixed units ${JSON.stringify(units)} — keeping "${canonical.unit}"`);
      }

      if (dryRun) continue;

      const dupeIds = dupes.map((d) => d.id);
      for (const [table, column] of REFERENCING_FKS) {
        await client.query(
          `UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = ANY($2::text[])`,
          [canonical.id, dupeIds],
        );
      }

      await client.query(
        `UPDATE "InventoryItem"
         SET quantity = $1, price = $2, "costPrice" = $3, sku = COALESCE($4, sku), "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [totalQty, mergedPrice, mergedCost, mergedSku, canonical.id],
      );

      await client.query(`DELETE FROM "InventoryItem" WHERE id = ANY($1::text[])`, [dupeIds]);
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log(`\nDRY RUN — no changes written.`);
    } else {
      await client.query('COMMIT');
    }
    console.log(
      `\n${dryRun ? 'Would merge' : 'Merged'} ${mergedGroups} group(s), ${dryRun ? 'removing' : 'removed'} ${removedRows} duplicate row(s).`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
