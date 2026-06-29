# Supabase Egress Optimization Report

Date: 2026-06-29

## Scope

This repository is Vite React + Nest/Postgres, not Next.js. The frontend does not use `@supabase/supabase-js`; Supabase egress is driven by backend Postgres responses and any deployed asset/image delivery.

## Optimizations Applied

### React Query Cache Policy

Why it wasted bandwidth: app data was stale after 30 seconds and refetched on window focus. Restaurant inventory, settings, locations, menu items, ingredients, and recipes are mostly static between mutations.

Original:
```ts
staleTime: 30_000,
refetchOnWindowFocus: true,
```

Optimized:
```ts
staleTime: 5 * 60_000,
gcTime: 30 * 60_000,
refetchOnWindowFocus: false,
```

Files: `frontend/src/features/inventory/app/queryClient.ts`, `frontend/src/features/pos/hooks/usePosMenuQuery.ts`

Estimated reduction: 50-80% fewer repeated frontend API reads during normal navigation/focus changes.

Trade-off: data can remain cached for up to 5 minutes, or 10 minutes for POS catalog data. Existing mutations still invalidate affected queries after create/update/delete.

### POS Menu, Ingredients, and Product Recipe Caching

Why it wasted bandwidth: menu and recipe data could refetch after focus/re-render even when no catalog changes occurred.

Original:
```ts
useQuery({
  queryKey: ['pos-menu', userId],
  queryFn: () => apiClient(`/pos/menu?user_id=${userId}`),
});
```

Optimized:
```ts
useQuery({
  queryKey: ['pos-menu', userId],
  queryFn: () => apiClient(`/pos/menu?user_id=${userId}`),
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: false,
});
```

Estimated reduction: 60-90% for repeated POS screen visits and focus events.

Trade-off: menu changes appear after mutation invalidation or cache expiry.

### Backend Pagination Guards

Why it wasted bandwidth: several endpoints loaded every matching record without a limit.

Original:
```sql
ORDER BY "createdAt" DESC
```

Optimized:
```sql
ORDER BY "createdAt" DESC
LIMIT $n
OFFSET $n
```

Files/endpoints:
- `GET /api/inventory`: default 250, max 1000
- `GET /api/kitchen-orders`: default 100, max 300
- `GET /api/purchase-orders`: default 100, max 500
- `GET /api/purchase-orders/goods-receipts`: default 100, max 500
- `GET /api/sales`: default 100, max 500
- `GET /api/stock-movements`: default 200, max 1000
- `GET /api/notifications`: default 50, max 200
- reports: default 100, max 500

Estimated reduction: 70-95% on history/report endpoints once tables grow past a few hundred rows.

Trade-off: current frontend still consumes `.data`, so it shows the first page unless callers pass `page`/`limit`. This prevents runaway egress but should be paired with visible pagination controls on history-heavy screens.

### Large Join Payload Trimming

Why it wasted bandwidth: wide joins serialized entire rows for nested objects.

Original:
```sql
SELECT sm.*, row_to_json(i.*) AS item, row_to_json(l.*) AS location
```

Optimized:
```sql
SELECT
  sm.id, sm.type, sm.quantity, sm."previousQuantity", sm."newQuantity",
  sm.unit, sm.reason, sm."referenceType", sm."referenceId", sm.notes,
  json_build_object('id', i.id, 'name', i.name, 'unit', i.unit) AS item,
  json_build_object('id', l.id, 'name', l.name) AS location
```

Estimated reduction: 30-70% for stock movement responses.

Trade-off: only fields used by current UI mappings are returned.

### Sales Payload Trimming

Why it wasted bandwidth: sales returned `s.*` and `json_agg(si.*)`, including fields not used in sales history/report views.

Original:
```sql
SELECT s.*, COALESCE(items.items, '[]'::json) AS items
SELECT json_agg(si.* ORDER BY si."createdAt") AS items
```

Optimized:
```sql
SELECT s.id, s."transactionNumber", s."createdAt", s.total, s.status, ...
SELECT json_agg(json_build_object('id', si.id, 'name', si.name, ...)) AS items
```

Estimated reduction: 25-60% for sales history payloads.

Trade-off: additional sale fields not used by current list views are no longer present in the list endpoint.

## Audit Findings

Highest bandwidth files:
- `backend/src/modules/inventory/inventory-api.service.ts`: unbounded list/report endpoints and wide raw SQL joins.
- `frontend/src/features/inventory/app/queryClient.ts`: aggressive global refetch policy.
- `frontend/src/features/pos/hooks/usePosMenuQuery.ts`: static POS catalog queries lacked longer cache windows.

Queries executed too frequently:
- POS menu and ingredients on POS screen revisit/focus.
- Inventory/settings/location domain queries across multiple inventory pages.
- Sales, stock movements, goods receipts, and kitchen order history on page load.

Duplicate request risks:
- Restaurant inventory fetches ingredients and supplies separately, then combines them. This preserves behavior but costs two requests.
- Restaurant reports mount multiple domain queries together. Reports should be loaded per selected report tab in a later UI-safe pass.
- Dashboard screens request several independent lists and compute stats client-side.

Remaining large payloads:
- `listRecipes` still uses `row_to_json(menu_item.*)` and nested item objects.
- `listPurchaseOrders` and goods receipts still include wide supplier/item objects.
- `DatabaseService` legacy POS/admin paths still contain several `SELECT *` queries.

Storage/images:
- No Supabase Storage client downloads were found in the frontend. Image fields are URLs stored in database rows.
- Current bundled static PNGs include assets from ~253 KB to ~1.38 MB. Recommended menu item images: WebP/AVIF, 640x480 display max, 80-150 KB target, generate thumbnails for list views, and cache by stable URL.

Realtime:
- No Supabase realtime subscriptions were found. No realtime changes were needed.

## Verification

- Backend build: `npm.cmd --prefix backend run build`
- Frontend build: `npm.cmd --prefix frontend run build`

## Estimated Total Savings

For a restaurant POS session with repeated navigation and growing history tables: 70-90% fewer avoidable API bytes is realistic after these changes, especially from cache policy plus pagination. Actual savings depend on record counts, image hosting, and how often users open report/history screens.
