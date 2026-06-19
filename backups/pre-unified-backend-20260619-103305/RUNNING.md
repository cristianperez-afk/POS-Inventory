# How To Run The POS + Inventory System

Use one backend for normal POS work. Start the Inventory backend only when you are actively opening or developing Inventory module pages.

## Daily POS Mode

Run only these two services:

```text
POS backend:  http://localhost:3000
Frontend:     http://127.0.0.1:5173
```

```powershell
cd C:\Users\jelyl\POS-Inventory\pos\backend
npm.cmd run start:dev
```

```powershell
cd C:\Users\jelyl\POS-Inventory\pos\frontend
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

## Sync Inventory Catalog To POS

After Inventory items/categories/recipes change, sync them into the POS compatibility tables:

```powershell
cd C:\Users\jelyl\POS-Inventory\pos\backend
npm.cmd run db:sync-inventory-catalog
```

This keeps POS ordering aligned with the real Inventory database without using the old POS product-management screens.

## Optional Inventory Pages

Inventory pages still use the Inventory backend during the transition:

```text
Inventory backend: http://localhost:3001/api
```

Start it only when needed:

```powershell
cd C:\Users\jelyl\POS-Inventory\inventory
npm.cmd run dev:backend
```

Important Inventory backend setting:

```env
PORT=3001
DB_POOL_MAX=1
```

Enable Inventory buttons in `pos/frontend/.env` only when the Inventory backend is running:

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
cd C:\Users\jelyl\POS-Inventory\pos\frontend
npm.cmd run build
```

```powershell
cd C:\Users\jelyl\POS-Inventory\pos\backend
npm.cmd run build
```

```powershell
cd C:\Users\jelyl\POS-Inventory\inventory
npm.cmd run build:backend
```
