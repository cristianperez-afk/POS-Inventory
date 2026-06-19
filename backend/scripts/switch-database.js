const fs = require('fs');
const path = require('path');

const targets = new Set(['local', 'supabase']);
const target = process.argv[2];

if (!targets.has(target)) {
  console.error('Usage: node scripts/switch-database.js <local|supabase>');
  process.exit(1);
}

const envPath = path.resolve(__dirname, '..', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const env = parseEnv(envText);
const sourceKey = `DATABASE_URL_${target.toUpperCase()}`;
const nextUrl = env[sourceKey];

if (!nextUrl) {
  console.error(`${sourceKey} is missing in backend/.env`);
  process.exit(1);
}

const nextText = upsertEnvValue(upsertEnvValue(envText, 'DATABASE_TARGET', target), 'DATABASE_URL', nextUrl);
fs.writeFileSync(envPath, nextText);

console.log(`Database switched to ${target}. Restart the backend server for the change to take effect.`);

function parseEnv(text) {
  return text.split(/\r?\n/).reduce((values, line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);

    if (!match) {
      return values;
    }

    values[match[1]] = unquote(match[2]);
    return values;
  }, {});
}

function upsertEnvValue(text, key, value) {
  const encoded = `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  if (pattern.test(text)) {
    return text.replace(pattern, encoded);
  }

  return text.endsWith('\n') ? `${text}${encoded}\n` : `${text}\n${encoded}\n`;
}

function unquote(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}
