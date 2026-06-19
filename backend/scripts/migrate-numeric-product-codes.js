const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const connectionString = process.env.DATABASE_URL;
const isDryRun = process.argv.includes('--dry-run');
const isVerify = process.argv.includes('--verify');

if (!connectionString) {
  console.error('DATABASE_URL is missing in backend/.env');
  process.exit(1);
}

const pool = new Pool({ connectionString });

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error.message);
    try {
      await pool.end();
    } catch {}
    process.exit(1);
  });

async function main() {
  const client = await pool.connect();

  try {
    if (isVerify) {
      const sample = await client.query(`
        SELECT p.name, pv.size, pv.color, pv.sku, pv.barcode
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        ORDER BY pv.id
        LIMIT 5
      `);

      console.table(sample.rows);
      return;
    }

    await client.query('BEGIN');

    const before = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM products) AS product_count,
        (SELECT COUNT(*) FROM product_variants) AS variant_count
    `);

    const productResult = await client.query(`
      UPDATE products
      SET
        sku = '1' || LPAD(id::TEXT, 11, '0'),
        barcode = '1' || LPAD(id::TEXT, 11, '0'),
        updated_at = CURRENT_TIMESTAMP
    `);

    const variantResult = await client.query(`
      UPDATE product_variants
      SET
        sku = '2' || LPAD(id::TEXT, 11, '0'),
        barcode = '2' || LPAD(id::TEXT, 11, '0'),
        updated_at = CURRENT_TIMESTAMP
    `);

    const duplicateCheck = await client.query(`
      WITH codes AS (
        SELECT sku AS code FROM products
        UNION ALL SELECT barcode FROM products
        UNION ALL SELECT sku FROM product_variants
        UNION ALL SELECT barcode FROM product_variants
      )
      SELECT code, COUNT(*) AS count
      FROM codes
      WHERE code IS NOT NULL
      GROUP BY code
      HAVING COUNT(*) > 2
      ORDER BY count DESC, code
    `);

    if (duplicateCheck.rows.length > 0) {
      throw new Error(`Duplicate numeric codes detected: ${JSON.stringify(duplicateCheck.rows.slice(0, 5))}`);
    }

    if (isDryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }

    console.log(`${isDryRun ? 'Dry run complete' : 'Migration complete'}.`);
    console.log(`Products found: ${before.rows[0].product_count}`);
    console.log(`Variants found: ${before.rows[0].variant_count}`);
    console.log(`Products updated: ${productResult.rowCount}`);
    console.log(`Variants updated: ${variantResult.rowCount}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
