import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrations run through the CLI and should avoid Supabase's transaction pooler
// because transaction-mode pooling can interfere with Prisma advisory locks.
// On IPv4-only hosts such as Render, use Supabase's session pooler for
// DIRECT_URL. Supabase's direct db.<project-ref>.supabase.co:5432 host requires
// IPv6 unless the project has the IPv4 add-on enabled.
const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error('DIRECT_URL or DATABASE_URL is missing. Create backend/.env or set one in the environment.');
}

if (process.env.RENDER && /@db\.[^.]+\.supabase\.co:5432\//.test(migrationUrl)) {
  console.warn(
    'DIRECT_URL points at Supabase direct port 5432. Render often cannot reach that IPv6-only host; use the Supabase session pooler for DIRECT_URL, or enable Supabase IPv4 add-on.',
  );
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
