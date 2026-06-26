import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrations run through the CLI, which needs a direct (non-pooled) connection —
// Supabase's transaction-mode pooler (port 6543) can hang on the advisory lock
// `migrate deploy` takes. DIRECT_URL should be Supabase's direct connection
// string (port 5432); it falls back to DATABASE_URL for local setups that only
// have one connection string.
const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error('DIRECT_URL or DATABASE_URL is missing. Create backend/.env or set one in the environment.');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: migrationUrl,
  },
});
