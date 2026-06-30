const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const tscBin = path.join(repoRoot, 'backend', 'node_modules', 'typescript', 'bin', 'tsc');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });

  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(' ')} failed`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'),
  );

  return result.stdout;
}

test('static auth/API security checks pass', () => {
  const output = run('node', ['backend/scripts/security-auth-checks.js']);
  assert.match(output, /Security auth checks passed\./);
});

test('runtime guard security checks pass', () => {
  run(process.execPath, [tscBin, '-p', 'backend/tsconfig.build.json']);
  const output = run('node', ['backend/scripts/security-runtime-checks.js']);
  assert.match(output, /Security runtime checks passed\./);
});

test('HTTP security e2e checks pass or skip without a dedicated database', () => {
  run(process.execPath, [tscBin, '-p', 'backend/tsconfig.build.json']);
  const output = run('node', ['backend/scripts/security-e2e-checks.js']);
  assert.match(output, /Security HTTP e2e checks passed\.|Security e2e checks skipped\./);
});
