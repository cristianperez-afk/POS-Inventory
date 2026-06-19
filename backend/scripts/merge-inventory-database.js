const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

const backendRoot = path.join(__dirname, '..');
const repoRoot = path.join(backendRoot, '..');
const posEnvPath = path.join(backendRoot, '.env');
const inventoryEnvPath = path.join(repoRoot, 'inventory', 'backend', '.env');
const inventoryMigrationsPath = path.join(repoRoot, 'inventory', 'backend', 'prisma', 'migrations');
const syncSqlPath = path.join(backendRoot, 'sql', 'sync-inventory-catalog-into-pos.sql');

const inventoryTables = [
  'Business',
  'User',
  'Location',
  'Category',
  'InventoryItem',
  'Supplier',
  'Recipe',
  'RecipeIngredient',
  'StockMovement',
  'PurchaseOrder',
  'PurchaseOrderItem',
  'GoodsReceipt',
  'GoodsReceiptItem',
  'Transfer',
  'TransferItem',
  'Sale',
  'SaleItem',
  'DiningTable',
  'KitchenOrder',
  'BundlePackage',
  'BundleItem',
  'Notification',
  'RestaurantSetting',
  'StockAdjustment',
  'StockAdjustmentItem',
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return dotenv.parse(fs.readFileSync(filePath));
}

function createPool(connectionString, role) {
  if (!connectionString) {
    throw new Error(`${role} DATABASE_URL is missing.`);
  }

  return new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function tableExists(pool, tableName) {
  const result = await pool.query(
    `
      SELECT to_regclass($1) IS NOT NULL AS exists
    `,
    [`public.${quoteIdentifier(tableName)}`],
  );

  return Boolean(result.rows[0]?.exists);
}

async function getColumns(pool, tableName) {
  const result = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName],
  );

  return result.rows.map((row) => row.column_name);
}

async function ensureInventorySchema(targetPool) {
  if (await tableExists(targetPool, 'Business')) {
    console.log('Inventory schema already exists in the POS database.');
    return;
  }

  const migrations = fs
    .readdirSync(inventoryMigrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    const migrationSqlPath = path.join(inventoryMigrationsPath, migration, 'migration.sql');
    if (!fs.existsSync(migrationSqlPath)) {
      continue;
    }

    const sql = fs.readFileSync(migrationSqlPath, 'utf8').trim();
    if (!sql) {
      continue;
    }

    console.log(`Applying inventory migration ${migration}`);
    await targetPool.query(sql);
  }
}

async function copyTable(sourcePool, targetPool, tableName) {
  const sourceExists = await tableExists(sourcePool, tableName);
  const targetExists = await tableExists(targetPool, tableName);

  if (!sourceExists || !targetExists) {
    console.log(`Skipping ${tableName}; table is missing in ${sourceExists ? 'target' : 'source'} database.`);
    return 0;
  }

  const sourceColumns = await getColumns(sourcePool, tableName);
  const targetColumns = new Set(await getColumns(targetPool, tableName));
  const columns = sourceColumns.filter((column) => targetColumns.has(column));

  if (columns.length === 0) {
    console.log(`Skipping ${tableName}; no matching columns found.`);
    return 0;
  }

  const selectedColumns = columns.map(quoteIdentifier).join(', ');
  const sourceRows = await sourcePool.query(`SELECT ${selectedColumns} FROM ${quoteIdentifier(tableName)}`);

  if (sourceRows.rowCount === 0) {
    console.log(`Copied 0 ${tableName} rows.`);
    return 0;
  }

  const insertColumns = columns.map(quoteIdentifier).join(', ');
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updateColumns = columns.filter((column) => column !== 'id');
  const conflictSql =
    updateColumns.length === 0
      ? 'DO NOTHING'
      : `DO UPDATE SET ${updateColumns
          .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
          .join(', ')}`;

  const insertSql = `
    INSERT INTO ${quoteIdentifier(tableName)} (${insertColumns})
    VALUES (${placeholders})
    ON CONFLICT ("id") ${conflictSql}
  `;

  for (const row of sourceRows.rows) {
    await targetPool.query(
      insertSql,
      columns.map((column) => row[column]),
    );
  }

  console.log(`Copied ${sourceRows.rowCount} ${tableName} rows.`);
  return sourceRows.rowCount;
}

async function main() {
  const posEnv = loadEnvFile(posEnvPath);
  const inventoryEnv = loadEnvFile(inventoryEnvPath);
  const targetUrl = process.env.POS_DATABASE_URL || process.env.DATABASE_URL || posEnv.DATABASE_URL;
  const sourceUrl = process.env.INVENTORY_DATABASE_URL || inventoryEnv.DATABASE_URL;

  const targetPool = createPool(targetUrl, 'POS target');
  const sourcePool = createPool(sourceUrl, 'Inventory source');

  try {
    await ensureInventorySchema(targetPool);

    if (sourceUrl === targetUrl) {
      console.log('Inventory source and POS target are the same database; skipping row copy.');
    } else {
      for (const tableName of inventoryTables) {
        await copyTable(sourcePool, targetPool, tableName);
      }
    }

    await targetPool.query(fs.readFileSync(syncSqlPath, 'utf8'));
    console.log('Inventory database merge and POS catalog sync completed.');
  } finally {
    await Promise.allSettled([sourcePool.end(), targetPool.end()]);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
