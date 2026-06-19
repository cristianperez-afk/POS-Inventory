-- Phase 3 Step B: Backfill Category rows from existing InventoryItem and Supplier strings

-- Insert categories for UKAY_ITEM inventory items
INSERT INTO "Category" ("id", "name", "module", "businessId", "updatedAt")
SELECT
  gen_random_uuid(),
  TRIM("category"),
  'UKAY'::"BusinessModule",
  "businessId",
  CURRENT_TIMESTAMP
FROM "InventoryItem"
WHERE "itemType" = 'UKAY_ITEM'
  AND "category" IS NOT NULL
  AND TRIM("category") <> ''
GROUP BY TRIM("category"), "businessId"
ON CONFLICT DO NOTHING;

-- Insert categories for INGREDIENT / MENU_ITEM / SUPPLY items
INSERT INTO "Category" ("id", "name", "module", "businessId", "updatedAt")
SELECT
  gen_random_uuid(),
  TRIM("category"),
  'RESTAURANT'::"BusinessModule",
  "businessId",
  CURRENT_TIMESTAMP
FROM "InventoryItem"
WHERE "itemType" IN ('INGREDIENT', 'MENU_ITEM', 'SUPPLY')
  AND "category" IS NOT NULL
  AND TRIM("category") <> ''
GROUP BY TRIM("category"), "businessId"
ON CONFLICT DO NOTHING;

-- Insert categories from Supplier.category (UKAY module)
INSERT INTO "Category" ("id", "name", "module", "businessId", "updatedAt")
SELECT
  gen_random_uuid(),
  TRIM("category"),
  'UKAY'::"BusinessModule",
  "businessId",
  CURRENT_TIMESTAMP
FROM "Supplier"
WHERE "category" IS NOT NULL
  AND TRIM("category") <> ''
GROUP BY TRIM("category"), "businessId"
ON CONFLICT DO NOTHING;

-- Backfill categoryId on InventoryItem (UKAY items)
UPDATE "InventoryItem" ii
SET "categoryId" = c.id
FROM "Category" c
WHERE c."businessId" = ii."businessId"
  AND c."name"   = TRIM(ii."category")
  AND c."module" = 'UKAY'::"BusinessModule"
  AND ii."itemType" = 'UKAY_ITEM'
  AND ii."category" IS NOT NULL;

-- Backfill categoryId on InventoryItem (Restaurant items)
UPDATE "InventoryItem" ii
SET "categoryId" = c.id
FROM "Category" c
WHERE c."businessId" = ii."businessId"
  AND c."name"   = TRIM(ii."category")
  AND c."module" = 'RESTAURANT'::"BusinessModule"
  AND ii."itemType" IN ('INGREDIENT', 'MENU_ITEM', 'SUPPLY')
  AND ii."category" IS NOT NULL;

-- Backfill categoryId on Supplier
UPDATE "Supplier" s
SET "categoryId" = c.id
FROM "Category" c
WHERE c."businessId" = s."businessId"
  AND c."name"   = TRIM(s."category")
  AND c."module" = 'UKAY'::"BusinessModule"
  AND s."category" IS NOT NULL;
