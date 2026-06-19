# POS + Inventory System Architecture

For local startup instructions, see [RUNNING.md](RUNNING.md).

## System Structure

The merged system uses the POS frontend as the main shell and connects POS and Inventory features through a shared React application flow.

- `pos/frontend/src/shared/App.tsx` is the merged application shell.
- `inventory/frontend/src/app` contains the inventory app shell helpers:
  - session bridge via `useSession`
  - typed API client in `app/api/client.ts`
  - domain types in `app/api/domainTypes.ts`
  - shared TanStack Query client
- `inventory/frontend/src/modules/restaurant` contains restaurant inventory screens.
- `inventory/frontend/src/modules/retail` contains retail inventory screens.
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
Prisma
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
- Services use Prisma for data access.
- Prisma reads and writes PostgreSQL or Supabase.

## Backend Architecture

The inventory backend is a NestJS modular monolith.

- Feature modules are registered in `inventory/backend/src/app.module.ts`.
- Controllers expose API endpoints.
- Services contain business logic.
- Prisma is the only ORM/data access layer.
- PostgreSQL/Supabase is the database.

The POS backend remains responsible for POS login, POS accounts, POS store data, and POS transactions.

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
- Inventory JWT guards and role/module guards for inventory backend requests.
- A bridge from the merged POS shell to the inventory backend so inventory requests resolve to the correct inventory tenant/module by store type.

Authorization should be enforced on backend requests, not only in the UI.

## Connection In Development

Run normal POS work with the POS backend only:

```text
POS backend:       http://localhost:3000
POS frontend:      http://127.0.0.1:5173
```

Inventory pages still use the Inventory backend during the transition:

```text
Inventory backend: http://localhost:3001
```

The POS frontend sends:

- POS auth/admin/POS requests to `VITE_API_BASE_URL` or `http://localhost:3000`.
- Inventory `/api/...` requests through the Vite proxy to `http://localhost:3001` only when Inventory pages are opened.

POS sales should not manage products through the old POS product/category/ingredient screens. Product, ingredient, and category source data lives in the Inventory schema and is mirrored into POS compatibility tables with:

```powershell
cd C:\Users\jelyl\POS-Inventory\pos\backend
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
React screen -> feature hook -> API client -> controller -> service -> Prisma -> database
```
