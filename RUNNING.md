# How To Run The POS + Inventory System

Use the POS backend for both POS and Inventory work. The Inventory backend is no longer needed for normal local runs.

## Daily POS Mode

Run only these two services:

```text
POS backend:  http://localhost:3000
Frontend:     http://127.0.0.1:5173
```

```powershell
cd C:\Users\jelyl\POS-Inventory\backend
npm.cmd run start:dev
```

```powershell
cd C:\Users\jelyl\POS-Inventory\frontend
npm.cmd run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173
```

## Before Starting

Keep both backends capped to one database connection:

```env
DB_POOL_MAX=1
```

If Supabase says the connection limit is reached, stop all backend terminals, wait 2-5 minutes, then start only the POS backend.

## One-Time Inventory Merge

If the POS database does not have Inventory tables yet, merge the old Inventory database into the POS database:

```powershell
cd C:\Users\jelyl\POS-Inventory\backend
npm.cmd run db:merge-inventory
```

This creates the Inventory schema in the POS database, copies Inventory rows, and syncs POS-compatible product/category/ingredient rows.

## Sync Inventory Catalog To POS

After Inventory items/categories/recipes change, sync them into the POS compatibility tables:

```powershell
cd C:\Users\jelyl\POS-Inventory\backend
npm.cmd run db:sync-inventory-catalog
```

This keeps POS ordering aligned with the real Inventory database without using the old POS product-management screens.

## Inventory Pages

Inventory pages call the POS backend through `/api/...`.

Keep Inventory buttons enabled in `frontend/.env`:

```env
VITE_ENABLE_INVENTORY_MODULES=true
```

## Login Flow

Use only the POS login page.

- Restaurant admin sees restaurant POS, plus restaurant inventory buttons only when Inventory modules are enabled.
- Retail admin sees retail POS, plus retail inventory buttons only when Inventory modules are enabled.
- POS staff sees POS pages.
- Inventory staff sees inventory pages only when Inventory modules are enabled.
- Manager sees POS pages, plus inventory pages only when Inventory modules are enabled.

User management is handled from the POS admin Staff Accounts page.

## Build Check

```powershell
cd C:\Users\jelyl\POS-Inventory\frontend
npm.cmd run build
```

```powershell
cd C:\Users\jelyl\POS-Inventory\backend
npm.cmd run build
```

You do not need to start or build `inventory/backend` for normal POS + Inventory use.
