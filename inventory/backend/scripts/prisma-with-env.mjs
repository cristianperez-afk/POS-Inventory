import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

const [envFile = '.env', ...prismaArgs] = process.argv.slice(2);

dotenv.config({
  path: resolve(process.cwd(), envFile),
  override: true,
});

if (!process.env.DATABASE_URL) {
  console.error(`DATABASE_URL is missing from ${envFile}`);
  process.exit(1);
}

const prismaCli = resolve(
  process.cwd(),
  '..',
  'node_modules',
  'prisma',
  'build',
  'index.js',
);
const result = spawnSync(process.execPath, [prismaCli, ...prismaArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
