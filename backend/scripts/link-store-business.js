// Manage the deterministic POS store -> inventory Business link.
//
// Usage:
//   node scripts/link-store-business.js list
//   node scripts/link-store-business.js set <storeId> <businessId>
//   node scripts/link-store-business.js clear <storeId>
//
// After changing a link, the next time a staff member of that store opens the POS,
// the catalog re-syncs from the linked business (items not in it are hidden).
require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const [action, a, b] = process.argv.slice(2);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS inventory_business_id TEXT`);

    if (action === 'set') {
      if (!a || !b) throw new Error('Usage: set <storeId> <businessId>');
      const biz = (await pool.query(`SELECT id, name, modules FROM "Business" WHERE id = $1`, [b])).rows[0];
      if (!biz) throw new Error(`Business ${b} not found`);
      const res = await pool.query(`UPDATE stores SET inventory_business_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [b, a]);
      if (res.rowCount === 0) throw new Error(`Store ${a} not found`);
      console.log(`Linked store ${a} -> ${biz.name} (${b}) [modules: ${biz.modules}]`);
    } else if (action === 'clear') {
      if (!a) throw new Error('Usage: clear <storeId>');
      await pool.query(`UPDATE stores SET inventory_business_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [a]);
      console.log(`Cleared link for store ${a} (back to auto-resolve)`);
    } else {
      const rows = (await pool.query(
        `SELECT s.id, s.store_type, s.inventory_business_id, b.name AS business_name
         FROM stores s LEFT JOIN "Business" b ON b.id = s.inventory_business_id
         ORDER BY s.id`,
      )).rows;
      console.log('Current store -> business links:');
      for (const r of rows) {
        console.log(`  store ${r.id} (${r.store_type}) -> ${r.inventory_business_id ? `${r.business_name} [${r.inventory_business_id}]` : '(auto-resolve)'}`);
      }
      console.log('\nRetail/Restaurant businesses:');
      const biz = (await pool.query(`SELECT id, name, modules FROM "Business" ORDER BY name`)).rows;
      for (const x of biz) console.log(`  ${x.id}  ${x.name}  [${x.modules}]`);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
