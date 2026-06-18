# Frontend Query/Session Architecture Adoption — Execution Plan (for Codex)

> **Audience:** an automated coding agent starting cold (no prior conversation context).
> **Repo:** ukay-ukay / inventory-management (NestJS + Prisma backend, React + Vite + TanStack Query frontend).
> **Branch to work on:** `fix/reapply-feature` (or branch off it as `frontend/adopt-query-arch`).
> Read this whole file before editing. Do not delete shared architecture files except where Phase 5 explicitly says so.

---

## 1. Background / why this exists

The project went through a merge → revert → reapply cycle of an "architecture improvement" effort. A reconciliation already restored the **backend** architecture. This plan finishes the job on the **frontend**, which currently runs on a weaker data layer while the better one sits unused on disk.

### Already done (verified) — do NOT redo
- **Backend module isolation restored.** `resolveModule(user, requested)` (in `backend/src/auth/assert-module-allowed.ts`) is wired through purchase-orders, suppliers, transfers, sales, stock-movements controllers/services.
- **Prisma schema realigned with migrations:** `module BusinessModule @default(RETAIL)` present on `Category, StockMovement, Supplier, PurchaseOrder, GoodsReceipt, Transfer, Sale`; Supplier unique is `@@unique([businessId, name, module])`. RL's `Recipe.modifiers Json` kept.
- **`GET /auth/me`** exists again (`backend/src/auth/auth.controller.ts` → `authService.getSession`).
- **WAC pricing** on PO receive + **kitchen-order `module: RESTAURANT`** stock-movement tagging preserved.
- **Backend builds and tests pass:** `cd backend && npx nest build` is clean; `npx jest` = 11 suites / 25 tests pass.

### Important environment gotchas
- **Backend raw `tsc` fails** with `TS5103 Invalid value for '--ignoreDeprecations'` because `backend/tsconfig.json` sets `"ignoreDeprecations": "6.0"` but installed TS is 5.9.3. **Use `npx nest build` for the backend**, not `tsc`. (Do not "fix" this unless asked.)
- **`vite build` does NOT typecheck** (esbuild strips types). Use `npx tsc --noEmit` in `frontend/` to catch type errors.
- **Frontend `tsconfig.json` has no `ignoreDeprecations` issue** — `tsc --noEmit` works there.
- Commits made so far are **local only / not pushed**. Do not force-push or rewrite history.

### Key behavioral constraint (the real reason this matters)
`resolveModule(user, requested)` **throws 403 ("module is required for a multi-module business")** when `requested` is undefined and the user has more than one module enabled. So for a combined RETAIL+RESTAURANT user, any frontend call that omits `module` to a module-scoped endpoint will 403. The frontend must send the correct `module` on those calls. This is the end-to-end isolation gap this plan closes.

---

## 2. Current frontend state

### The intended architecture (exists on disk, mostly UNUSED)
- `frontend/src/app/queryClient.ts` → exports **`appQueryClient`** (QueryClient with query/mutation error reporting via an `api-error` CustomEvent).
- `frontend/src/app/hooks/useSession.ts` → exports **`SessionProvider`** + **`useSession()`**. Provides `{ currentUser, isLoggedIn, isRestoringSession, login, logout }`. **It imports `getCurrentSession` from `../api/client` — which does not exist yet** (client currently exports `getCurrentUser`).
- `frontend/src/app/hooks/useSession.test.tsx` → tests the above (also references `getCurrentSession`).
- `frontend/src/app/hooks/useRetailWorkspace.ts` → consumes retail query hooks and returns all retail state + handlers App.tsx needs (`inventory, locations, users, purchaseOrders, productsReceived, transfers, adjustments, stats, form state, …`). Imports from `../../modules/lib/retailQueries`.
- `frontend/src/app/hooks/useViewNavigation.ts` → already used by App.tsx (keep as-is).
- `frontend/src/modules/lib/domainQueries.ts` → base hooks: `useInventoryQuery, useLocationsQuery, useUsersQuery, usePurchaseOrdersQuery, useGoodsReceiptsQuery, useSuppliersQuery, useTransfersQuery, useStockMovementsQuery, useSalesQuery, useBundlesQuery, useRecipesQuery, useKitchenOrdersQuery, useRestaurantSettingsQuery, useDomainMutation, useInvalidateDomains`, plus `domainQueryKeys`.
- `frontend/src/modules/lib/retail/*` + barrel `retailQueries.ts` (`export * from './retail'`) and `retailData.ts` (`export * from './retailQueries'`) → retail domain hooks (`useRetailInventoryQuery`, `useRetailPurchaseOrdersQuery`, …, `useSaveRetailInventoryMutation`, `RetailStockAlert`, etc.).
- `frontend/src/modules/lib/restaurant/*` + barrel `restaurantQueries.ts` → restaurant domain hooks (`useRestaurant*Query`, `useRestaurant*Mutation`, `restaurantQueryLoaders`, `useRestaurantSettings`, …).
- `frontend/src/models/retail.ts` → typed retail models.

### The weaker layer the app actually runs on
- `frontend/src/main.tsx` mounts **`restaurantQueryClient`** (from `modules/lib/restaurantData.ts`), not `appQueryClient`. No `SessionProvider` mounted. Uses `react-router`'s `BrowserRouter`.
- `frontend/src/app/App.tsx` **manually** manages `isLoggedIn / currentUser / sessionChecked`, a mount-effect session restore (calls `getCurrentUser`), and manual retail data-loading `useEffect`s + `useState`. It does **not** use `useSession` or `useRetailWorkspace`.
- All restaurant screens use **`useRestaurantState(...) / useRestaurantMutation(...)`** from `modules/lib/restaurantData.ts` (a backend-backed key→loader adapter). Live consumers:
  `restaurant/{AddProduct, Dashboard, GoodsReceived, Inventory, MultiLocation, POSKitchenOrders, ProductManagement, PurchaseOrders, PurchaseOrderItemInput, RecipeBOM, Reports, StockControl, Transfers, UserManagement}.tsx` and `modules/lib/inventoryLogic.ts` (`readRestaurantData`).
- `frontend/src/app/api/client.ts` is a simplified lineage: untyped (`any`), exports `getCurrentUser` (not `getCurrentSession`), and **dropped the `module` param** from `getSuppliers/getPurchaseOrders/getTransfers/getStockMovements/getGoodsReceipts/getSales` and the trailing `module` arg from the related mutations.

### TypeScript drift (37 errors, all in the unused query layer)
`cd frontend && npx tsc --noEmit` reports 37 errors, concentrated in:
- `app/hooks/useSession.ts` + `useSession.test.tsx` → `getCurrentSession` not exported; one implicit `any`.
- `modules/lib/restaurant/{purchaseOrderQueries,transferQueries,shared}.ts` and `modules/lib/retail/{purchaseOrderQueries,transferQueries,salesQueries}.ts` → `module` not accepted by client params; mutation calls pass an extra `module` arg ("Expected N arguments, but got N+1"); a few implicit-`any` callback params.
These are **drift, not bugs to delete** — the modules expect arch's module-aware `client.ts`. Restoring that contract (Phase 1) clears most of them. Reconcile any residual arity mismatches against the **actual call sites** (some hooks may have drifted beyond arch's exact signatures — verify, don't assume).

---

## 3. The module-aware `client.ts` contract to restore (Phase 1 reference)

Add a local type (avoid importing heavy domain types):
```ts
export type BusinessModule = 'RETAIL' | 'RESTAURANT';
```
Restore these signatures (forward `module` as a `?module=` query param unless noted). These mirror the original architecture and match the restored backend (`@Query('module')` + `resolveModule`):

```ts
getSuppliers(params?: { module?: BusinessModule; isActive?: boolean })            // query: module
updateSupplier(id, data, module: BusinessModule = 'RETAIL')                        // url: ?module=
deleteSupplier(id, module: BusinessModule = 'RETAIL')                              // url: ?module=

getPurchaseOrders(params?: { module?; status?; supplierId? })                      // query: module
getPurchaseOrder(id, module: BusinessModule = 'RETAIL')                            // url: ?module=
getGoodsReceipts(params?: { module?; purchaseOrderId? })                           // query: module
updatePurchaseOrder(id, data, module: BusinessModule = 'RETAIL')                   // url: ?module=
submitPurchaseOrder(id, module='RETAIL'); approvePurchaseOrder(id, module='RETAIL')
rejectPurchaseOrder(id, reason, module='RETAIL'); cancelPurchaseOrder(id, module='RETAIL')
receivePurchaseOrder(id, items, notes?, module='RETAIL')                           // url: ?module=

getTransfers(params?: { module?; status?; fromLocationId?; toLocationId? })        // query: module
getTransfer(id, module='RETAIL'); dispatchTransfer(id, module='RETAIL')
completeTransfer(id, module='RETAIL'); cancelTransfer(id, module='RETAIL')

getStockMovements(params?: { module?; itemId?; locationId?; type?; referenceType?; referenceId? })  // query: module
getSales(params?: { module?; locationId?; status?; dateFrom?; dateTo? })           // query: module
getSale(id, module='RETAIL'); refundSale(id, refundReason, module='RETAIL')
```
- POST creates (`createSupplier/createPurchaseOrder/createTransfer/createSale/createStockMovement`) keep `(data)` only — backend reads `module` from the **request body** (`dto.module`); the query hooks already put `module` into the payload. If a hook instead passes `module` as a 2nd arg, normalize it into the body inside the client fn.
- Keep all current return types as-is (`any` is fine) to minimize churn; only add the `module` plumbing.
- **Session:** add `export function getCurrentSession()` returning `request<{ user: AuthUser }>('/api/auth/me')`. Keep `getCurrentUser` as an alias (`export const getCurrentUser = getCurrentSession;`) so existing App.tsx wiring keeps compiling until Phase 3.

Reference implementation for every signature above exists verbatim in the `improve-fix/architecture` branch:
`git show improve-fix/architecture:frontend/src/app/api/client.ts`

---

## 4. Phases (execute in order; each ends green)

> **Verification gate after every phase:** `cd frontend && npx tsc --noEmit` (error count must not increase; target 0 by end) and `npx vite build` (must pass). Backend untouched but if touched: `cd backend && npx nest build && npx jest`. Commit at the end of each phase.

### Phase 0 — Setup
- Branch `frontend/adopt-query-arch` off `fix/reapply-feature`.
- Add `"typecheck": "tsc --noEmit"` to `frontend/package.json` scripts.
- Record baseline: 37 tsc errors, build passes.

### Phase 1 — Module-aware `client.ts` + `getCurrentSession`
- Apply the contract in §3.
- Re-run `tsc --noEmit`; the `module`/arity errors in `lib/retail/*` and `lib/restaurant/*` should clear. Fix residual implicit-`any` callback params and any hook-vs-client arity that differs from arch by inspecting the real call sites.
- **Exit:** tsc errors drop substantially (ideally only `useSession.ts/.test.tsx` remain, now fixed by the alias).

### Phase 2 — Mount real providers in `main.tsx`
- Import `appQueryClient` from `app/queryClient.ts`; use it in `QueryClientProvider` (replace `restaurantQueryClient`).
- Wrap `<App/>` with `<SessionProvider>` (inside the provider).
- Add a listener for the `api-error` CustomEvent (toast/banner) since `appQueryClient` dispatches it.
- **Exit:** app boots; login works via `SessionProvider`.

### Phase 3 — Move `App.tsx` onto `useSession` + `useRetailWorkspace` (behavior-sensitive)
- Replace manual `isLoggedIn/currentUser/sessionChecked` + the mount restore effect with `useSession()`.
- Replace manual retail data effects + state with `useRetailWorkspace({ enabled, loadSharedData, loadUsers })`.
- Keep `useViewNavigation` and all view routing identical. Map the existing `Loading…` guard to `isRestoringSession`.
- **Exit:** retail module fully works through the query layer; tsc clean; build passes. **Recommend a manual run here** (needs Postgres + backend + frontend) before continuing.

### Phase 4 — Verify end-to-end module isolation
- Confirm restaurant fetches send `module: 'RESTAURANT'` and retail send `'RETAIL'` (automatic for query-hook consumers).
- Manually test with a **combined RETAIL+RESTAURANT** user: both modules load without 403 and data does not bleed across modules. (This is the gap from §1's `resolveModule` 403 rule.)

### Phase 5 — Migrate restaurant screens off `restaurantData` (incremental, one screen per commit)

> **CRITICAL — feature preservation.** The live `restaurantData.ts` adapter contains feature logic that the arch `lib/restaurant/*` query hooks DO NOT have yet. A naive hook swap WILL regress shipped features. Before migrating a screen you MUST port the missing logic into the target query hook and confirm parity. See §7 for the inventory of features that must survive. If an arch hook cannot yet match the adapter for a given screen (e.g. ProductManagement's `globalProducts`/merge/supplier-link model has no backend equivalent), **leave that screen on `restaurantData` for now** rather than regress it — partial migration is acceptable.

Order, lowest-risk first:
1. Read-only: `Dashboard`, `Reports`*, `StockControl`, `MultiLocation`. (*`Reports` renders RL modifier data — port first.)
2. `Inventory`, `AddProduct`, `ProductManagement` (highest risk — see §7).
3. Transactional: `PurchaseOrders`, `GoodsReceived`, `POSKitchenOrders`*, `RecipeBOM`*, `Transfers`, `UserManagement`, `PurchaseOrderItemInput`. (*RL recipe-modifier / excluded-ingredient UI — port first.)
- For each screen: (a) ensure the target `modules/lib/restaurant/*` hook returns the SAME shape/fields the screen consumes today (port any RL/adjustment mapping from `restaurantData.ts`); (b) replace `useRestaurantState/useRestaurantMutation` with the hook (pass `module: 'RESTAURANT'`); (c) verify the screen's feature parity against §7; (d) commit.
- Also migrate `modules/lib/inventoryLogic.ts` off `readRestaurantData`.
- Delete `restaurantData.ts` ONLY when it has **zero** importers AND every §7 feature has a verified home in the query layer. If some screens stay on the adapter, keep `restaurantData.ts`.

### Phase 6 — Close out
- `tsc --noEmit` = **0 errors**; `vite build` clean; backend `nest build` + `jest` still green.
- Optional (ask first): restore arch frontend test tooling (vitest + `@testing-library` + `jsdom`, `test`/`typecheck`/`lint` scripts) and wire `typecheck` into CI.

---

## 5. Hard constraints / do-nots
- Do **not** delete `queryClient.ts`, `useSession.ts`, `useRetailWorkspace.ts`, `domainQueries.ts`, `lib/retail/*`, `lib/restaurant/*`, or barrels. They are the target architecture.
- Do **not** delete `restaurantData.ts` until Phase 5 confirms zero importers.
- Do **not** change backend behavior, schema, or migrations (backend is already correct).
- Do **not** touch `backend/tsconfig.json` `ignoreDeprecations`, and do not run backend raw `tsc` (use `nest build`).
- Do **not** push or rewrite git history unless explicitly told.
- Keep each phase independently compilable and the app runnable; commit per phase (and per screen in Phase 5).

## 6. Quick verification command reference
```bash
# frontend typecheck (authoritative for types)
cd frontend && npx tsc --noEmit
# frontend build
cd frontend && npx vite build
# backend build + tests (only if backend touched)
cd backend && npx nest build && npx jest
```

---

## 7. Main features that MUST be preserved (read before Phase 5)

These shipped features currently live in `restaurantData.ts` and/or the restaurant screens and are **absent from the arch `lib/restaurant/*` query hooks**. Migrating a screen must not regress them. Verify each after the relevant screen migration.

| Feature | Where it lives today | Risk on migration |
|---|---|---|
| **RL recipe modifiers** (recipe `modifiers[]` mapping) | `restaurantData.ts` loader + `RecipeBOM.tsx`, `Reports.tsx` | arch recipe hook has no `modifiers` mapping — port it |
| **Kitchen-order excluded ingredients / order modifiers** (`parseOrderModifiers`, `excludedIngredientIds`) | `restaurantData.ts` + `POSKitchenOrders.tsx` | arch kitchen hook lacks it — port it |
| **Stock-movement enrichment** (previous/new qty, location, createdBy) | `restaurantData.ts` adjustments loader | port into the transfers/stock-movements hook mapping |
| **Product Management** (catalog merge, `purchaseOrders.globalProducts`, supplier-price links, cross-record rename) | `ProductManagement.tsx` via `read/write/useRestaurantState` | **No backend/query equivalent for `globalProducts` & merge.** Do NOT migrate by guessing — either add backing hooks or KEEP this screen on `restaurantData` for now |
| **Initial Stock Setup + category-hierarchy persistence** (`inventory.categoryHierarchy`, `upsertRestaurantSetting('CATEGORY_HIERARCHY')`) | `Inventory.tsx`, `PurchaseOrderItemInput.tsx` | use `useRestaurantSettings`/settings mutation in the query layer; verify add/edit category persists |
| **Auto-generated SKU** (`buildGeneratedSku`, optional SKU) | `PurchaseOrders.tsx`, `PurchaseOrderItemInput.tsx` | pure UI/logic — keep as-is when migrating |
| **WAC pricing on goods receipt** | backend (authoritative) + `GoodsReceived.tsx` client calc | backend already does WAC; keep/relocate client calc, don't drop |
| **Product Management nav + "Add Food Item" removal** | `RestaurantLayout.tsx`, `App.tsx` routing | unaffected by data-layer migration — keep |
| **Lazy-loaded views + `useViewNavigation`** | `App.tsx` | unaffected — keep |

**Rule of thumb:** before deleting any adapter code path, grep its key (`grep -rn "<the-key>" restaurantData.ts`) and make sure the consuming screen still gets identical data from the query hook. Partial migration (some screens on hooks, some on the adapter) is an acceptable interim state; a regressed feature is not.
