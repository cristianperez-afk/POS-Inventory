# Backend Persistence Boundary

This backend intentionally supports both Prisma and raw SQL. The goal is not to
force every query through one tool, but to keep the choice predictable and local
to repositories/services.

## Use Prisma For

- Simple CRUD.
- Straightforward entity lookup by ID, email, or unique keys.
- Settings and preference reads/writes.
- Admin screens with simple filters.
- Relations that remain readable through Prisma includes/selects.

## Use Raw SQL For

- Reports and aggregations.
- POS order transactions.
- Inventory stock calculations.
- Purchase order receiving workflows.
- Bulk repair or migration scripts.
- Complex joins where Prisma becomes harder to read or tune.
- Queries that need explicit transaction ordering or locking.

## Code Structure Rule

Controllers should not know whether a workflow uses Prisma or raw SQL. They
should call a domain service or repository:

```ts
adminStaffService.listStaff(user);
inventoryReportRepository.getItemsSold(user, filters);
```

The repository/service can then choose the appropriate persistence tool.

## Current Migration Direction

`DatabaseService` is being reduced from a business-logic holder into a low-level
SQL utility:

- `query()`
- `queryWithClient()`
- `withTransaction()`
- connection lifecycle

Domain-specific behavior should move gradually into repositories such as:

- `AuthRepository`
- `ActivityLogRepository`
- `StaffRepository`
- `StoreSettingsRepository`
- `PosRepository`
- `InventoryRepository`

Do not do a big-bang rewrite. Extract one domain at a time and keep route
behavior unchanged.
