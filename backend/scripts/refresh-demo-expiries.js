const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Client } = require('pg');

const demoExpiryOffsets = [
  ['REST2-ING-003', '7 days'],
  ['REST2-ING-006', '30 days'],
  ['REST2-ING-009', '30 days'],
  ['REST2-ING-011', '14 days'],
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Check backend/.env.');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const rows = [];
  for (const [sku, offset] of demoExpiryOffsets) {
    const result = await client.query(
      `
        UPDATE "InventoryItem"
        SET "expiryDate" = CURRENT_DATE + $2::interval,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE sku = $1
          AND "expiryDate" IS NOT NULL
          AND "expiryDate"::date < CURRENT_DATE
        RETURNING sku, name, quantity, unit, "expiryDate"
      `,
      [sku, offset],
    );
    rows.push(...result.rows);
  }

  await client.end();
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
