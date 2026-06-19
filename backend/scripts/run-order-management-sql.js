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

  const sqlPath = path.join(__dirname, '..', 'sql', 'order-management.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = new Pool({ connectionString });

  try {
    await pool.query(sql);
    console.log('Order management SQL applied successfully.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
