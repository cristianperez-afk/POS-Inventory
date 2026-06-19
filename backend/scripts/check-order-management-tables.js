const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const expectedTables = [
  'store_settings',
  'discount_types',
  'product_categories',
  'products',
  'product_ingredients',
  'ingredient_alternatives',
  'restaurant_tables',
  'orders',
  'order_items',
  'order_item_customizations',
  'order_queue',
  'table_history',
  'payments',
  'receipts',
  'inventory_movements',
  'refunds',
  'voided_transactions',
];

async function main() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_SUPABASE ||
    process.env.DATABASE_URL_LOCAL;

  const pool = new Pool({ connectionString });

  try {
    const result = await pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1)
        ORDER BY table_name
      `,
      [expectedTables],
    );

    const found = new Set(result.rows.map((row) => row.table_name));
    const missing = expectedTables.filter((table) => !found.has(table));

    console.log(`Found ${found.size}/${expectedTables.length} order management tables.`);

    if (missing.length > 0) {
      console.log(`Missing: ${missing.join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
