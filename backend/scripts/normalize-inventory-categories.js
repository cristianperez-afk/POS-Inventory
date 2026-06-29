// One-time backfill: bring existing restaurant inventory items into the canonical
// "Main > Sub" category shape and register every resolved Main/Sub in each
// business CATEGORY_HIERARCHY setting. This makes items that were counted in the
// summary cards but hidden from the category tree (unregistered categories) show
// up in the inventory list. Re-runnable and additive — never removes categories.
//
// Usage:
//   node scripts/normalize-inventory-categories.js          (apply changes)
//   node scripts/normalize-inventory-categories.js --dry    (preview only)

const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Inventory tracks raw ingredients and supplies only — MENU_ITEM dishes are
// managed on the menu/recipe screens and are intentionally excluded.
const RESTAURANT_ITEM_TYPES = ['INGREDIENT', 'SUPPLY'];

// Mirror of InventoryApiService.normalizeItemCategory — keep in sync.
function normalizeItemCategory(_itemType, rawCategory, rawSubcategory) {
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

function parseHierarchy(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through */
    }
  }
  return {};
}

async function main() {
  const dryRun = process.argv.includes('--dry') || process.argv.includes('--dry-run');
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_SUPABASE ||
    process.env.DATABASE_URL_LOCAL;
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

    const { rows: items } = await client.query(
      `SELECT id, "businessId", "itemType", category, subcategory
       FROM "InventoryItem"
       WHERE "itemType" = ANY($1::"InventoryItemType"[])`,
      [RESTAURANT_ITEM_TYPES],
    );

    // businessId -> { main -> Set<sub> }
    const additions = new Map();
    let updated = 0;

    for (const item of items) {
      const norm = normalizeItemCategory(item.itemType, item.category, item.subcategory);

      if (!additions.has(item.businessId)) additions.set(item.businessId, new Map());
      const byMain = additions.get(item.businessId);
      if (!byMain.has(norm.main)) byMain.set(norm.main, new Set());
      byMain.get(norm.main).add(norm.sub);

      // Only rewrite rows whose category string actually changes — that is the
      // field the inventory tree matches on. Keep the resolved sub alongside it.
      if (item.category !== norm.category) {
        updated += 1;
        console.log(
          `  [${item.itemType}] "${item.category}" (sub: ${item.subcategory ?? '—'}) -> "${norm.category}"`,
        );
        if (!dryRun) {
          await client.query(
            `UPDATE "InventoryItem" SET category = $1, subcategory = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3`,
            [norm.category, norm.subcategory, item.id],
          );
        }
      }
    }

    // Merge resolved categories into each business CATEGORY_HIERARCHY setting.
    let hierarchiesTouched = 0;
    for (const [businessId, byMain] of additions) {
      const { rows } = await client.query(
        `SELECT value FROM "RestaurantSetting" WHERE "businessId" = $1 AND key = 'CATEGORY_HIERARCHY' LIMIT 1`,
        [businessId],
      );
      const hierarchy = parseHierarchy(rows[0]?.value);
      let changed = false;
      for (const [mainCat, subs] of byMain) {
        const existing = Array.isArray(hierarchy[mainCat]) ? hierarchy[mainCat] : [];
        if (!Array.isArray(hierarchy[mainCat])) changed = true;
        const merged = new Set(existing);
        for (const s of subs) {
          if (!merged.has(s)) changed = true;
          merged.add(s);
        }
        hierarchy[mainCat] = Array.from(merged);
      }
      if (changed) {
        hierarchiesTouched += 1;
        console.log(`  CATEGORY_HIERARCHY updated for business ${businessId}`);
        if (!dryRun) {
          await client.query(
            `INSERT INTO "RestaurantSetting" (id, key, value, "businessId", "updatedAt")
             VALUES (gen_random_uuid()::text, 'CATEGORY_HIERARCHY', $1::jsonb, $2, CURRENT_TIMESTAMP)
             ON CONFLICT ("businessId", key)
             DO UPDATE SET value = EXCLUDED.value, "updatedAt" = CURRENT_TIMESTAMP`,
            [JSON.stringify(hierarchy), businessId],
          );
        }
      }
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log(`\nDRY RUN — no changes written.`);
    } else {
      await client.query('COMMIT');
    }
    console.log(
      `\nScanned ${items.length} restaurant item(s): ${updated} category value(s) ${dryRun ? 'would be' : ''} normalized, ${hierarchiesTouched} hierarchy setting(s) ${dryRun ? 'would be' : ''} updated.`,
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
