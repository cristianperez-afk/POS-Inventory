const assert = require('node:assert/strict');
const { json, urlencoded } = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');

const TEST_EMAILS = {
  admin: 'security-admin-e2e@example.invalid',
  posStaff: 'security-pos-staff-e2e@example.invalid',
  inventoryStaff: 'security-inventory-staff-e2e@example.invalid',
  superadmin: 'security-superadmin-e2e@example.invalid',
};
const TEST_PASSWORD = 'SecurityE2ePass123!';

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  get(name) {
    return this.cookies.get(name);
  }

  update(response) {
    for (const cookie of getSetCookies(response.headers)) {
      const [pair] = cookie.split(';');
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!value) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const value = headers.get('set-cookie');
  if (!value) return [];
  return value.split(/,(?=\s*[^;,]+=)/);
}

function assertDedicatedTestDatabase(connectionString) {
  const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
  if (/test|e2e|security/i.test(databaseName)) return;
  throw new Error(
    `Refusing to run security e2e checks against database "${databaseName}". ` +
      'Set SECURITY_E2E_DATABASE_URL to a dedicated test database whose name contains test, e2e, or security.',
  );
}

async function seedDatabase(connectionString) {
  assertDedicatedTestDatabase(connectionString);
  const pool = new Pool({ connectionString });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id BIGSERIAL PRIMARY KEY,
        store_name TEXT,
        store_type TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        store_id BIGINT REFERENCES stores(id),
        staff_type TEXT,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        refresh_token_hash TEXT,
        refresh_token_expires_at TIMESTAMPTZ,
        reset_token_hash TEXT,
        reset_token_expires_at TIMESTAMPTZ,
        void_pin_hash TEXT,
        void_pin TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS store_information (
        id BIGSERIAL PRIMARY KEY,
        store_id BIGINT UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
        business_name TEXT
      )
    `);

    await cleanupDatabase(pool);

    const store = await pool.query(
      `INSERT INTO stores (store_name, store_type) VALUES ($1, $2) RETURNING id`,
      ['Security E2E Store', 'RETAIL'],
    );
    const storeId = Number(store.rows[0].id);
    await pool.query(`INSERT INTO store_information (store_id, business_name) VALUES ($1, $2)`, [
      storeId,
      'Security E2E Store',
    ]);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

    await insertUser(pool, {
      fullName: 'Security E2E Admin',
      email: TEST_EMAILS.admin,
      role: 'ADMIN',
      storeId,
      staffType: null,
      passwordHash,
    });
    await insertUser(pool, {
      fullName: 'Security E2E POS Staff',
      email: TEST_EMAILS.posStaff,
      role: 'STAFF',
      storeId,
      staffType: 'POS_STAFF',
      passwordHash,
    });
    await insertUser(pool, {
      fullName: 'Security E2E Inventory Staff',
      email: TEST_EMAILS.inventoryStaff,
      role: 'STAFF',
      storeId,
      staffType: 'INVENTORY_STAFF',
      passwordHash,
    });
    await insertUser(pool, {
      fullName: 'Security E2E Superadmin',
      email: TEST_EMAILS.superadmin,
      role: 'SUPERADMIN',
      storeId: null,
      staffType: null,
      passwordHash,
    });
  } finally {
    await pool.end();
  }
}

async function insertUser(pool, input) {
  await pool.query(
    `
      INSERT INTO users (full_name, email, role, store_id, staff_type, password_hash, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
    `,
    [input.fullName, input.email, input.role, input.storeId, input.staffType, input.passwordHash],
  );
}

async function cleanupDatabase(pool) {
  await pool.query(`DELETE FROM users WHERE email = ANY($1::text[])`, [Object.values(TEST_EMAILS)]);
  await pool.query(`DELETE FROM stores WHERE store_name = $1`, ['Security E2E Store']);
}

async function startApp(connectionString) {
  process.env.DATABASE_URL = connectionString;
  process.env.JWT_SECRET = process.env.SECURITY_E2E_JWT_SECRET ?? 'security-e2e-jwt-secret';
  process.env.NODE_ENV = 'test';
  process.env.DB_POOL_MAX = '1';
  process.env.SMTP_HOST = '';

  const { AppModule } = require('../dist/app.module.js');
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
  app.use(cookieParser());
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function request(baseUrl, path, { method = 'GET', body, jar, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  const cookieHeader = jar?.header();
  if (cookieHeader) requestHeaders.cookie = cookieHeader;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.update(response);

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { response, data };
}

async function login(baseUrl, email) {
  const jar = new CookieJar();
  const result = await request(baseUrl, '/auth/login', {
    method: 'POST',
    jar,
    body: { email, password: TEST_PASSWORD, rememberMe: true },
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.data.user.email, email);
  assert.ok(jar.get('access_token'), `${email} should receive an access token cookie`);
  assert.ok(jar.get('refresh_token'), `${email} should receive a refresh token cookie`);
  assert.ok(jar.get('csrf_token'), `${email} should receive a csrf token cookie`);
  return jar;
}

async function runHttpSecurityChecks(baseUrl) {
  assert.equal((await request(baseUrl, '/auth/me')).response.status, 401);
  assert.equal(
    (
      await request(baseUrl, '/auth/forgot-password', {
        method: 'POST',
        body: { email: 'missing-e2e@example.invalid' },
      })
    ).response.status,
    200,
  );

  const adminJar = await login(baseUrl, TEST_EMAILS.admin);
  const session = await request(baseUrl, '/auth/me', { jar: adminJar });
  assert.equal(session.response.status, 200);
  assert.equal(session.data.user.email, TEST_EMAILS.admin);

  assert.equal(
    (
      await request(baseUrl, '/admin/staff', {
        method: 'POST',
        jar: adminJar,
        body: { full_name: 'Blocked Without CSRF', email: 'blocked@example.invalid' },
      })
    ).response.status,
    403,
  );

  assert.equal(
    (
      await request(baseUrl, '/superadmin/admins', {
        method: 'GET',
        jar: adminJar,
      })
    ).response.status,
    403,
  );

  const posStaffJar = await login(baseUrl, TEST_EMAILS.posStaff);
  assert.equal((await request(baseUrl, '/api', { jar: posStaffJar })).response.status, 403);

  const inventoryStaffJar = await login(baseUrl, TEST_EMAILS.inventoryStaff);
  assert.equal((await request(baseUrl, '/pos/menu', { jar: inventoryStaffJar })).response.status, 403);

  assert.equal(
    (
      await request(baseUrl, '/pos/orders', {
        method: 'POST',
        jar: inventoryStaffJar,
        headers: { 'x-csrf-token': inventoryStaffJar.get('csrf_token') },
        body: { items: [] },
      })
    ).response.status,
    403,
  );

  assert.equal(
    (
      await request(baseUrl, '/auth/logout', {
        method: 'POST',
        jar: adminJar,
        headers: { 'x-csrf-token': adminJar.get('csrf_token') },
      })
    ).response.status,
    200,
  );
}

async function main() {
  const connectionString = process.env.SECURITY_E2E_DATABASE_URL;
  if (!connectionString) {
    console.log('Security e2e checks skipped. Set SECURITY_E2E_DATABASE_URL to run them against a dedicated test database.');
    return;
  }

  await seedDatabase(connectionString);

  const { app, baseUrl } = await startApp(connectionString);
  try {
    await runHttpSecurityChecks(baseUrl);
  } finally {
    await app.close();
    const pool = new Pool({ connectionString });
    try {
      await cleanupDatabase(pool);
    } finally {
      await pool.end();
    }
  }

  console.log('Security HTTP e2e checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
