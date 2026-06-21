// READ-ONLY: confirm POS + Inventory tables coexist in the one merged DB.
require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    max: 1,
  });
  try {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' ORDER BY table_name`,
    );
    const names = rows.map((r) => r.table_name);
    console.log(`Total public tables: ${names.length}`);

    const posLike = names.filter((n) =>
      /^(stores|products|orders|order_items|product_categories|ingredients_inventory|payments|receipts|store_settings|product_ingredients|product_variants)$/.test(n),
    );
    const invLike = names.filter((n) =>
      /InventoryItem|Recipe|StockMovement|Business|Location|Category|PurchaseOrder|Supplier|KitchenOrder|Sale|Transfer/i.test(n),
    );

    console.log('\nPOS-side tables present:');
    console.log('  ' + (posLike.join(', ') || '(none)'));
    console.log('\nInventory-side (Prisma) tables present:');
    console.log('  ' + (invLike.join(', ') || '(none)'));

    // Row counts for a couple of key tables on each side, if present.
    for (const t of ['stores', 'products', 'orders']) {
      if (names.includes(t)) {
        const c = await pool.query(`SELECT COUNT(*)::int n FROM "${t}"`);
        console.log(`  count ${t}: ${c.rows[0].n}`);
      }
    }
    for (const t of invLike.slice(0, 4)) {
      const c = await pool.query(`SELECT COUNT(*)::int n FROM "${t}"`);
      console.log(`  count ${t}: ${c.rows[0].n}`);
    }
  } catch (err) {
    console.error('Check failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
