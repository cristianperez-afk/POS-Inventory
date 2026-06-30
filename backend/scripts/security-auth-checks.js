const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function fail(message) {
  throw new Error(message);
}

function assertContains(file, pattern, description) {
  const content = read(file);
  if (typeof pattern === 'string' ? !content.includes(pattern) : !pattern.test(content)) {
    fail(`${file}: missing ${description}`);
  }
}

function assertNotContains(file, pattern, description) {
  const content = read(file);
  if (typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content)) {
    fail(`${file}: must not contain ${description}`);
  }
}

function assertNoRequestIdentity(file) {
  assertNotContains(file, /@Query\('user_id'\)/, "acting identity from @Query('user_id')");
  assertNotContains(file, /body\.user_id/, 'acting identity from body.user_id');
  assertNotContains(file, /Number\(body\.user_id\)/, 'acting identity from Number(body.user_id)');
  assertNotContains(file, /Number\(userId\)/, 'acting identity from Number(userId)');
  assertNotContains(file, /admin_user_id\??:/, 'admin_user_id DTO field');
}

function assertFrontendDoesNotSendIdentity(file) {
  assertNotContains(file, /\?user_id=/, 'user_id query parameter');
  assertNotContains(file, /\?admin_user_id=/, 'admin_user_id query parameter');
  assertNotContains(file, /user_id:\s*currentUser\.id/, 'user_id JSON field from currentUser');
  assertNotContains(file, /admin_user_id:\s*currentUser\.id/, 'admin_user_id JSON field from currentUser');
  assertNotContains(file, /x-pos-user-id|x-pos-bridge/, 'spoofable inventory bridge identity headers');
}

assertContains('backend/src/modules/auth/auth.module.ts', 'provide: APP_GUARD', 'global APP_GUARD registration');
assertContains('backend/src/modules/auth/auth.module.ts', 'useClass: JwtAuthGuard', 'global JwtAuthGuard');
assertContains('backend/src/modules/auth/auth.module.ts', 'useClass: CsrfGuard', 'global CsrfGuard');
assertContains('backend/src/modules/auth/jwt-auth.guard.ts', 'IS_PUBLIC_KEY', 'Public route bypass metadata support');
assertContains('backend/src/modules/auth/roles.guard.ts', 'PERMISSIONS_KEY', 'permission metadata enforcement');
assertContains('backend/src/modules/auth/roles.guard.ts', 'getPermissionsForUser', 'permission policy usage');
assertContains('backend/src/modules/auth/permission-policy.ts', 'ROLE_PERMISSIONS', 'central role-to-permission map');
assertContains('backend/src/modules/auth/permission-policy.ts', 'getPermissionsForUser', 'permission policy helper');
assertContains('backend/src/modules/auth/permissions.decorator.ts', 'Permissions', 'permission decorator');
assertContains('backend/src/modules/auth/csrf.guard.ts', "request.headers['x-csrf-token']", 'CSRF header validation');
assertContains('backend/src/modules/auth/csrf.guard.ts', 'request.cookies?.csrf_token', 'CSRF cookie validation');
assertContains('frontend/src/shared/api/fetchWithAuth.ts', "'X-CSRF-Token'", 'frontend CSRF header injection');

assertNotContains('backend/src/modules/auth/auth.controller.ts', 'debug-cookie', 'debug cookie endpoint');
for (const route of ["@Post('login')", "@Post('refresh')", "@Post('forgot-password')", "@Post('reset-password')"]) {
  assertContains('backend/src/modules/auth/auth.controller.ts', route, `${route} route`);
}
const authController = read('backend/src/modules/auth/auth.controller.ts');
for (const route of ["@Post('login')", "@Post('refresh')", "@Post('forgot-password')", "@Post('reset-password')"]) {
  const routeIndex = authController.indexOf(route);
  const routeBlock = authController.slice(routeIndex, routeIndex + 220);
  if (!routeBlock.includes('@Public()')) {
    fail(`backend/src/modules/auth/auth.controller.ts: ${route} must be marked @Public()`);
  }
}

[
  'backend/src/modules/users/admin/admin-activity.controller.ts',
  'backend/src/modules/users/admin/admin-discount.controller.ts',
  'backend/src/modules/users/admin/admin-pos.controller.ts',
  'backend/src/modules/users/admin/admin-settings.controller.ts',
  'backend/src/modules/users/admin/admin-staff.controller.ts',
  'backend/src/modules/users/admin/admin-theme.controller.ts',
  'backend/src/modules/users/admin/retail-authorization.controller.ts',
  'backend/src/modules/users/superadmin/superadmin.controller.ts',
  'backend/src/modules/pos/pos.controller.ts',
].forEach(assertNoRequestIdentity);

assertContains('backend/src/modules/inventory/inventory-api.controller.ts', "@Permissions('inventory:manage')", 'inventory permission gate');
assertContains('backend/src/modules/pos/pos.controller.ts', "@Permissions('pos:create_order')", 'POS order creation permission gate');
assertContains('backend/src/modules/users/admin/retail-authorization.controller.ts', "@Permissions('retail:void_authorize')", 'retail void authorization permission gate');
assertContains('backend/src/modules/users/admin/admin-staff.controller.ts', '@Throttle', 'authenticated sensitive admin throttling');
assertContains('backend/src/modules/users/superadmin/superadmin.controller.ts', '@Throttle', 'authenticated sensitive superadmin throttling');
assertContains('backend/src/modules/pos/pos.controller.ts', '@Throttle', 'authenticated POS order throttling');

[
  'backend/src/modules/users/admin/admin-activity.controller.ts',
  'backend/src/modules/users/admin/admin-discount.controller.ts',
  'backend/src/modules/users/admin/admin-pos.controller.ts',
  'backend/src/modules/users/admin/admin-settings.controller.ts',
  'backend/src/modules/users/admin/admin-theme.controller.ts',
  'backend/src/modules/users/admin/retail-authorization.controller.ts',
].forEach((file) => assertNotContains(file, "@Roles('ADMIN')", 'admin-only class gate on shared store data routes'));

[
  'frontend/src/shared/App.tsx',
  'frontend/src/shared/components/GeneralSettings.tsx',
  'frontend/src/shared/components/ManagerProfile.tsx',
  'frontend/src/shared/components/AdminDashboard.tsx',
  'frontend/src/shared/components/StoreSettings.tsx',
  'frontend/src/shared/components/StoreInformation.tsx',
  'frontend/src/shared/components/InventorySettings.tsx',
  'frontend/src/shared/context/OrderContext.tsx',
  'frontend/src/shared/context/TableContext.tsx',
  'frontend/src/shared/context/StoreSettingsContext.tsx',
  'frontend/src/restaurant/pages/CreateOrder.tsx',
  'frontend/src/restaurant/pages/Payment.tsx',
  'frontend/src/retail/pages/RetailCreateOrder.tsx',
  'frontend/src/retail/context/RetailOrderContext.tsx',
  'frontend/src/features/pos/hooks/usePosMenuQuery.ts',
  'frontend/src/features/inventory/app/api/client.ts',
].forEach(assertFrontendDoesNotSendIdentity);

console.log('Security auth checks passed.');
