const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_SUPABASE ||
    process.env.DATABASE_URL_LOCAL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is missing in backend/.env');
  }

  const sqlPath = path.join(__dirname, '..', 'sql', 'repair-pos-inventory-identity-links.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 1),
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? 5000),
    connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? 10000),
    allowExitOnIdle: true,
  });

  try {
    const schemaCheck = await pool.query(`
      SELECT
        to_regclass('public.users') IS NOT NULL AS pos_users_exist,
        to_regclass('public.stores') IS NOT NULL AS pos_stores_exist,
        to_regclass('public."Business"') IS NOT NULL AS inventory_business_exists,
        to_regclass('public."User"') IS NOT NULL AS inventory_user_exists
    `);
    const schema = schemaCheck.rows[0];
    if (!schema?.pos_users_exist || !schema?.pos_stores_exist || !schema?.inventory_business_exists || !schema?.inventory_user_exists) {
      throw new Error('POS and Inventory tables must be merged into the same database before repairing identity links.');
    }

    await pool.query(sql);
    console.log('POS and Inventory identity links repaired.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
