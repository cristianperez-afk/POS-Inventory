ALTER TABLE "Business"
  ADD COLUMN IF NOT EXISTS "posStoreId" INTEGER;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "posUserId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "Business_posStoreId_key" ON "Business"("posStoreId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_posUserId_key" ON "User"("posUserId");

WITH pos_user_scope AS (
  SELECT
    u.id AS pos_user_id,
    u.email,
    u.full_name,
    u.role,
    u.staff_type,
    u.store_id,
    CASE WHEN s.store_type = 'RETAIL' THEN 'RETAIL_STORE' ELSE s.store_type END AS store_type,
    COALESCE(si.business_name, CONCAT('Store ', s.id)) AS store_name
  FROM users u
  JOIN stores s ON s.id = u.store_id
  LEFT JOIN store_information si ON si.store_id = s.id
  WHERE COALESCE(u.status, 'ACTIVE') = 'ACTIVE'
    AND u.store_id IS NOT NULL
),
existing_email_business AS (
  SELECT DISTINCT ON (pus.store_id)
    pus.store_id,
    iu."businessId"
  FROM pos_user_scope pus
  JOIN "User" iu ON lower(iu.email) = lower(pus.email)
  ORDER BY pus.store_id, iu."updatedAt" DESC
),
linked_businesses AS (
  UPDATE "Business" b
  SET "posStoreId" = eeb.store_id,
      "updatedAt" = CURRENT_TIMESTAMP
  FROM existing_email_business eeb
  WHERE b.id = eeb."businessId"
    AND b."posStoreId" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "Business" claimed WHERE claimed."posStoreId" = eeb.store_id
    )
  RETURNING b.id, b."posStoreId"
),
created_businesses AS (
  INSERT INTO "Business" (id, name, modules, "posStoreId", "updatedAt")
  SELECT
    gen_random_uuid()::text,
    CONCAT(pus.store_name, ' (POS ', pus.store_id, ')'),
    ARRAY[
      CASE WHEN pus.store_type = 'RESTAURANT' THEN 'RESTAURANT' ELSE 'RETAIL' END
    ]::"BusinessModule"[],
    pus.store_id,
    CURRENT_TIMESTAMP
  FROM (
    SELECT DISTINCT store_id, store_type, store_name
    FROM pos_user_scope
  ) pus
  WHERE NOT EXISTS (
    SELECT 1 FROM "Business" b WHERE b."posStoreId" = pus.store_id
  )
  ON CONFLICT ("posStoreId") DO NOTHING
  RETURNING id, "posStoreId"
)
UPDATE "Business" b
SET modules = CASE
      WHEN b.modules @> ARRAY[required.module]::"BusinessModule"[] THEN b.modules
      ELSE array_append(b.modules, required.module)
    END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT
    store_id,
    CASE WHEN store_type = 'RESTAURANT' THEN 'RESTAURANT'::"BusinessModule" ELSE 'RETAIL'::"BusinessModule" END AS module
  FROM pos_user_scope
) required
WHERE b."posStoreId" = required.store_id;

INSERT INTO "User" (
  id, "posUserId", name, email, "passwordHash", role, status, "businessId", "lastLogin", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  pus.pos_user_id,
  pus.full_name,
  pus.email,
  CONCAT('pos-linked-', gen_random_uuid()::text),
  CASE
    WHEN pus.role = 'ADMIN' THEN 'Admin'::"UserRole"
    WHEN pus.staff_type = 'MANAGER' THEN 'Manager'::"UserRole"
    ELSE 'Staff'::"UserRole"
  END,
  'Active'::"UserStatus",
  b.id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM pos_user_scope pus
JOIN "Business" b ON b."posStoreId" = pus.store_id
WHERE NOT EXISTS (
  SELECT 1 FROM "User" iu
  WHERE iu."posUserId" = pus.pos_user_id
     OR lower(iu.email) = lower(pus.email)
)
ON CONFLICT DO NOTHING;

UPDATE "User" iu
SET "posUserId" = pus.pos_user_id,
    name = pus.full_name,
    role = CASE
      WHEN pus.role = 'ADMIN' THEN 'Admin'::"UserRole"
      WHEN pus.staff_type = 'MANAGER' THEN 'Manager'::"UserRole"
      ELSE 'Staff'::"UserRole"
    END,
    status = 'Active'::"UserStatus",
    "businessId" = b.id,
    "updatedAt" = CURRENT_TIMESTAMP
FROM pos_user_scope pus
JOIN "Business" b ON b."posStoreId" = pus.store_id
WHERE lower(iu.email) = lower(pus.email)
   OR iu."posUserId" = pus.pos_user_id;

INSERT INTO "Location" (id, name, address, manager, phone, "businessId", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'Main Location',
  '',
  '',
  '',
  b.id,
  CURRENT_TIMESTAMP
FROM "Business" b
WHERE b."posStoreId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Location" l WHERE l."businessId" = b.id
  );
