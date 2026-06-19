const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const connectionString = process.env.DATABASE_URL;

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
  const columns = await pool.query(`
    SELECT
      table_schema,
      table_name,
      column_name,
      pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) AS sequence_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) IS NOT NULL
    ORDER BY table_schema, table_name, column_name
  `);

  if (columns.rows.length === 0) {
    console.log('No serial or identity sequences found.');
    return;
  }

  for (const column of columns.rows) {
    const tableRef = quoteQualified(column.table_schema, column.table_name);
    const columnRef = quoteIdentifier(column.column_name);
    const sequenceLiteral = quoteLiteral(column.sequence_name);

    const result = await pool.query(`
      SELECT setval(
        ${sequenceLiteral},
        COALESCE((SELECT MAX(${columnRef}) FROM ${tableRef}), 0) + 1,
        false
      ) AS next_id
    `);

    console.log(`${column.table_name}.${column.column_name} -> next id ${result.rows[0].next_id}`);
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function quoteQualified(schema, table) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
