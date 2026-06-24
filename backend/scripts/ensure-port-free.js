const { execFileSync } = require('node:child_process');
require('dotenv/config');

const port = Number(process.argv[2] || process.env.PORT || 3000);

if (!Number.isFinite(port) || port <= 0) {
  process.exit(0);
}

if (process.platform !== 'win32') {
  process.exit(0);
}

try {
  const output = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
  const listeningPids = new Set();

  for (const line of output.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || parts[0] !== 'TCP') continue;

    const localAddress = parts[1] || '';
    const state = parts[3] || '';
    const pid = parts[4] || '';

    if (state === 'LISTENING' && localAddress.endsWith(`:${port}`) && pid && pid !== String(process.pid)) {
      listeningPids.add(pid);
    }
  }

  for (const pid of listeningPids) {
    try {
      console.log(`Port ${port} is already in use by PID ${pid}. Stopping it before backend restart...`);
      execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' });
    } catch (error) {
      console.warn(`Could not stop PID ${pid} on port ${port}. Close it manually if backend still fails.`);
    }
  }
} catch (error) {
  console.warn(`Could not check port ${port}. Backend will try to start normally.`);
}
