INSERT INTO "Supplier" (
  "id",
  "name",
  "contactPerson",
  "email",
  "phone",
  "address",
  "category",
  "categoryId",
  "isActive",
  "businessId",
  "module",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  source."name",
  source."contactPerson",
  source."email",
  source."phone",
  source."address",
  source."category",
  source."categoryId",
  source."isActive",
  source."businessId",
  'RETAIL'::"BusinessModule",
  source."createdAt",
  NOW()
FROM "Supplier" source
WHERE source."module" = 'RESTAURANT'
  AND EXISTS (
    SELECT 1
    FROM "PurchaseOrder" po
    WHERE po."supplierId" = source."id"
      AND po."module" = 'RETAIL'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Supplier" retail
    WHERE retail."businessId" = source."businessId"
      AND retail."name" = source."name"
      AND retail."module" = 'RETAIL'
  );

UPDATE "PurchaseOrder" po
SET "supplierId" = retail."id"
FROM "Supplier" source
JOIN "Supplier" retail
  ON retail."businessId" = source."businessId"
  AND retail."name" = source."name"
  AND retail."module" = 'RETAIL'
WHERE po."supplierId" = source."id"
  AND po."module" = 'RETAIL'
  AND source."module" = 'RESTAURANT';
