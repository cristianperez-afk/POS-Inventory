# POS + Inventory System Architecture

For local startup instructions, see [RUNNING.md](RUNNING.md).

## System Structure

The merged system uses the POS frontend as the main shell and connects POS and Inventory features through a shared React application flow.

- `frontend/src/shared/App.tsx` is the merged application shell.
- `frontend/src/features/inventory/app` contains the inventory app shell helpers:
  - session bridge via `useSession`
  - typed API client in `app/api/client.ts`
  - domain types in `app/api/domainTypes.ts`
  - shared TanStack Query client
- `frontend/src/features/inventory/modules/restaurant` contains restaurant inventory screens.
- `frontend/src/features/inventory/modules/retail` contains retail inventory screens.
- Runtime access is based on the logged-in POS user and the store type:
  - Restaurant store users see restaurant POS and restaurant inventory modules.
  - Retail store users see retail POS and retail inventory modules.
  - Inventory staff, POS staff, manager, and admin visibility is handled by role/staff type.

## UI Layer

The frontend uses React screens grouped by feature/module. Screens should not call the backend directly.

UI components should use the existing app UI kit and local design conventions. Shared controls live in the existing `components/ui` folders.

## Frontend Data Flow

All frontend server data should follow this flow:

```text
React screens
  |
  v
feature query hooks / shared appQueryClient
  |
  v
API client
  |
  v
Backend API
  |
  v
Service layer
  |
  v
Shared database access
  |
  v
Database
```

This means:

- React screens render UI and call feature hooks.
- Feature hooks use TanStack Query and the shared `appQueryClient`.
- Hooks call the centralized API client.
- The API client talks to backend endpoints.
- Backend controllers receive requests and delegate business logic to services.
- Services use the shared POS database access layer.
- PostgreSQL/Supabase is the single database.

## Backend Architecture

The POS backend is the single NestJS backend for normal POS + Inventory use.

- POS auth/admin/POS modules remain in `backend/src`.
- Inventory compatibility endpoints live in `backend/src/modules/inventory`.
- Controllers expose POS endpoints and Inventory `/api/...` endpoints.
- Services contain business logic.
- `PrismaService` in `backend/src/prisma` is the canonical database layer.
- `DatabaseService` is a temporary compatibility layer for old POS SQL flows while they are migrated module by module.
- `DB_POOL_MAX=1` is used locally for remaining compatibility SQL to avoid Supabase connection limits.
- PostgreSQL/Supabase is the single database.

The old `inventory/backend` is kept as migration/source reference, but it is not started during normal development.

The target backend folder shape is:

```text
backend/
  prisma/
  src/
    prisma/
    modules/
      auth/
      users/
      inventory/
      stores/
      products/
      orders/
      payments/
      reports/
```

## Tenancy Model

Inventory tenancy is rooted at `Business`.

- Each business owns users, inventory items, sales, kitchen orders, dining tables, transfers, purchase orders, and related records.
- Domain rows carry a `businessId` foreign key.
- `Business.modules` controls licensed modules such as `RETAIL` and `RESTAURANT`.
- Store type from POS determines which inventory module is used in the merged shell.

## Auth And Authorization

The system uses:

- POS login as the single visible login page.
- POS account role/staff type for frontend visibility.
- POS account role/staff type is bridged to Inventory module visibility.
- Inventory `/api/...` requests resolve to the correct inventory tenant/module by store type.

Authorization should be enforced on backend requests, not only in the UI.

## Connection In Development

Run normal POS work with the POS backend only:

```text
POS backend:       http://localhost:3000
POS frontend:      http://127.0.0.1:5173
```

The POS frontend sends:

- POS auth/admin/POS requests to `VITE_API_BASE_URL` or `http://localhost:3000`.
- Inventory `/api/...` requests through the Vite proxy to the POS backend.

POS sales should not manage products through the old POS product/category/ingredient screens. Product, ingredient, and category source data lives in the Inventory schema inside the POS database.

For the one-time merge from the old Inventory database:

```powershell
cd C:\Users\jelyl\POS-Inventory\backend
npm.cmd run db:merge-inventory
```

After that, re-run the lightweight catalog sync when Inventory catalog data changes:

```powershell
cd C:\Users\jelyl\POS-Inventory\backend
npm.cmd run db:sync-inventory-catalog
```

## Architecture Rule

New screens and features should not bypass the architecture flow.

Do not do this:

```text
React screen -> fetch directly -> database-like logic in UI
```

Do this:

```text
React screen -> feature hook -> API client -> controller -> service -> shared database access -> database
```
