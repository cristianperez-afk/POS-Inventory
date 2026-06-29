const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const shouldBaseline = process.env.PRISMA_BASELINE_EXISTING_DB === 'true';

const firstDeploy = runPrisma(['migrate', 'deploy'], { allowFailure: true });

if (firstDeploy.status === 0) {
  runPrisma(['generate']);
  process.exit(0);
}

if (!firstDeploy.output.includes('P3005') || !shouldBaseline) {
  process.exit(firstDeploy.status ?? 1);
}

console.warn(
  'Prisma found a non-empty database without migration history. PRISMA_BASELINE_EXISTING_DB=true is set, so existing migrations will be marked as applied.',
);

for (const migrationName of listMigrationNames()) {
  runPrisma(['migrate', 'resolve', '--applied', migrationName]);
}

runPrisma(['migrate', 'deploy']);
runPrisma(['generate']);

function runPrisma(args, options = {}) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['prisma', ...args], {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (!options.allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return { status: result.status, output };
}

function listMigrationNames() {
  const migrationsPath = path.resolve(__dirname, '..', 'prisma', 'migrations');

  return fs
    .readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
