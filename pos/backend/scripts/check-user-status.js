const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const constraints = await pool.query(`
      SELECT conname, pg_get_constraintdef(pg_constraint.oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'users'::regclass
      ORDER BY conname
    `);
    const statuses = await pool.query(`
      SELECT status, COUNT(*)::int AS count
      FROM users
      GROUP BY status
      ORDER BY status
    `);

    console.log('Constraints:');
    console.table(constraints.rows);
    console.log('Statuses:');
    console.table(statuses.rows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
