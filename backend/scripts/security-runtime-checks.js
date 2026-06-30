const assert = require('node:assert/strict');
const path = require('node:path');

const dist = (...parts) => path.join(__dirname, '..', 'dist', ...parts);

const { CsrfGuard } = require(dist('modules', 'auth', 'csrf.guard.js'));
const { JwtAuthGuard } = require(dist('modules', 'auth', 'jwt-auth.guard.js'));
const { RolesGuard } = require(dist('modules', 'auth', 'roles.guard.js'));
const { IS_PUBLIC_KEY } = require(dist('modules', 'auth', 'public.decorator.js'));
const { PERMISSIONS_KEY } = require(dist('modules', 'auth', 'permissions.decorator.js'));
const { ROLES_KEY } = require(dist('modules', 'auth', 'roles.decorator.js'));

function createReflector(metadata = {}) {
  return {
    getAllAndOverride: (key) => metadata[key],
  };
}

function createContext({ user, method = 'GET', cookies = {}, headers = {} } = {}) {
  const request = { user, method, cookies, headers };
  return {
    getHandler: () => function handler() {},
    getClass: () => function Controller() {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    request,
  };
}

async function rejectsWithName(operation, expectedName) {
  await assert.rejects(operation, (error) => error?.constructor?.name === expectedName);
}

function throwsWithName(operation, expectedName) {
  assert.throws(operation, (error) => error?.constructor?.name === expectedName);
}

async function checkCsrfGuard() {
  assert.equal(
    new CsrfGuard(createReflector({ [IS_PUBLIC_KEY]: true })).canActivate(
      createContext({ method: 'POST' }),
    ),
    true,
  );

  assert.equal(new CsrfGuard(createReflector()).canActivate(createContext({ method: 'GET' })), true);

  throwsWithName(
    () => new CsrfGuard(createReflector()).canActivate(createContext({ method: 'POST' })),
    'ForbiddenException',
  );

  throwsWithName(
    () =>
      new CsrfGuard(createReflector()).canActivate(
        createContext({
          method: 'POST',
          cookies: { csrf_token: 'cookie-token' },
          headers: { 'x-csrf-token': 'header-token' },
        }),
      ),
    'ForbiddenException',
  );

  assert.equal(
    new CsrfGuard(createReflector()).canActivate(
      createContext({
        method: 'POST',
        cookies: { csrf_token: 'matching-token' },
        headers: { 'x-csrf-token': 'matching-token' },
      }),
    ),
    true,
  );
}

async function checkJwtAuthGuard() {
  const jwtService = {
    verifyAsync: async (token, options) => {
      assert.equal(options.secret, 'runtime-test-secret');
      if (token !== 'valid-token') throw new Error('invalid token');
      return {
        sub: 42,
        full_name: 'Runtime User',
        email: 'runtime@example.com',
        role: 'ADMIN',
        store_id: 7,
        staff_type: null,
        store_type: 'RETAIL_STORE',
        store_name: 'Runtime Store',
      };
    },
  };
  const configService = {
    get: (key) => (key === 'JWT_SECRET' ? 'runtime-test-secret' : undefined),
  };

  assert.equal(
    await new JwtAuthGuard(jwtService, configService, createReflector({ [IS_PUBLIC_KEY]: true }))
      .canActivate(createContext()),
    true,
  );

  await rejectsWithName(
    () => new JwtAuthGuard(jwtService, configService, createReflector()).canActivate(createContext()),
    'UnauthorizedException',
  );

  await rejectsWithName(
    () =>
      new JwtAuthGuard(jwtService, configService, createReflector()).canActivate(
        createContext({ headers: { authorization: 'Bearer bad-token' } }),
      ),
    'UnauthorizedException',
  );

  const bearerContext = createContext({ headers: { authorization: 'Bearer valid-token' } });
  assert.equal(
    await new JwtAuthGuard(jwtService, configService, createReflector()).canActivate(bearerContext),
    true,
  );
  assert.deepEqual(bearerContext.request.user, {
    id: 42,
    full_name: 'Runtime User',
    email: 'runtime@example.com',
    role: 'ADMIN',
    store_id: 7,
    staff_type: null,
    store_type: 'RETAIL_STORE',
    store_name: 'Runtime Store',
  });

  const cookieContext = createContext({
    cookies: { access_token: 'valid-token' },
    headers: { authorization: 'Bearer bad-token' },
  });
  assert.equal(
    await new JwtAuthGuard(jwtService, configService, createReflector()).canActivate(cookieContext),
    true,
  );
}

async function checkRolesGuard() {
  assert.equal(
    new RolesGuard(createReflector({ [PERMISSIONS_KEY]: ['staff:manage'] })).canActivate(
      createContext({ user: { role: 'ADMIN' } }),
    ),
    true,
  );

  throwsWithName(
    () =>
      new RolesGuard(createReflector({ [PERMISSIONS_KEY]: ['inventory:manage'] })).canActivate(
        createContext({ user: { role: 'STAFF', staff_type: 'POS_STAFF' } }),
      ),
    'ForbiddenException',
  );

  assert.equal(
    new RolesGuard(createReflector({ [PERMISSIONS_KEY]: ['inventory:manage'] })).canActivate(
      createContext({ user: { role: 'STAFF', staff_type: 'INVENTORY_STAFF' } }),
    ),
    true,
  );

  assert.equal(
    new RolesGuard(createReflector({ [PERMISSIONS_KEY]: ['pos:read'] })).canActivate(
      createContext({ user: { role: 'POS_MANAGER', staff_type: 'POS_STAFF' } }),
    ),
    true,
  );

  assert.equal(
    new RolesGuard(createReflector({ [PERMISSIONS_KEY]: ['pos:create_order'] })).canActivate(
      createContext({ user: { role: 'POS_MANAGER', staff_type: 'POS_STAFF' } }),
    ),
    true,
  );

  throwsWithName(
    () =>
      new RolesGuard(createReflector({ [PERMISSIONS_KEY]: ['pos:create_order'] })).canActivate(
        createContext({ user: { role: 'STAFF', staff_type: 'INVENTORY_STAFF' } }),
      ),
    'ForbiddenException',
  );

  assert.equal(
    new RolesGuard(createReflector({ [PERMISSIONS_KEY]: ['platform:anything'] })).canActivate(
      createContext({ user: { role: 'SUPERADMIN' } }),
    ),
    true,
  );

  throwsWithName(
    () =>
      new RolesGuard(createReflector({ [ROLES_KEY]: ['ADMIN'] })).canActivate(
        createContext({ user: { role: 'POS_MANAGER' } }),
      ),
    'ForbiddenException',
  );
}

async function main() {
  await checkCsrfGuard();
  await checkJwtAuthGuard();
  await checkRolesGuard();
  console.log('Security runtime checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
