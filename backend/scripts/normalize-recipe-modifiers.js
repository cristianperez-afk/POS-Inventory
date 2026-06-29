// Align saved recipe modifiers with the current POS Modify behaviors.
// Dry-run by default. Pass --apply to persist the changes.

const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const apply = process.argv.includes('--apply');
const report = process.argv.includes('--report');
const validTypes = new Set(['remove', 'less', 'ingredient_level', 'size_variant', 'add_on', 'note']);

function cleanName(value) {
  return String(value ?? '')
    .replace(/\(\+p\)/gi, '')
    .replace(/\b(extra|more|less|no|regular|single|double|large|half|family|separate|dry style|with)\b/gi, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function findByName(items, modifierName) {
  const target = cleanName(modifierName);
  if (!target) return undefined;
  const singular = (token) => token.endsWith('ies') && token.length > 4
    ? `${token.slice(0, -3)}y`
    : token.endsWith('oes') && token.length > 4
      ? token.slice(0, -2)
      : token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token;
  const targetTokens = target.split(/\s+/).map(singular);
  const canonicalTarget = targetTokens.join(' ');
  const exact = items.find((item) => cleanName(item.name).split(/\s+/).map(singular).join(' ') === canonicalTarget);
  if (exact) return exact;
  return items.find((item) => {
    const itemName = cleanName(item.name);
    const itemTokens = itemName.split(/\s+/).map(singular);
    return targetTokens.every((token) => itemTokens.includes(token));
  });
}

function findAddOnAlias(items, modifierName) {
  const aliases = {
    caramel: ['white sugar', 'brown sugar'],
    'fresh fruits': ['strawberry'],
    'boiled egg': ['eggs'],
    'plain rice': ['white rice', 'rice'],
    rice: ['white rice', 'rice'],
    ice: ['ice'],
  };
  const candidates = aliases[cleanName(modifierName)] ?? [];
  return candidates
    .map((candidate) => items.find((item) => cleanName(item.name) === candidate))
    .find(Boolean);
}

function isAddOnCandidate(modifier) {
  const group = String(modifier.group ?? '');
  const name = String(modifier.name ?? '');
  return /add-?ons?|toppings?|extra options?|beverage add-?ons?/i.test(group)
    || /^(extra|add)\b/i.test(name)
    || (/^double\b/i.test(name) && /patty/i.test(group))
    || /^(bacon|egg|boiled egg|mushroom)$/i.test(name);
}

function sizeMultiplierForName(name) {
  if (/half/i.test(name)) return 0.5;
  if (/extra large/i.test(name)) return 2;
  if (/family/i.test(name)) return 3;
  if (/large/i.test(name)) return 1.5;
  if (/small/i.test(name)) return 0.75;
  return 1;
}

function isKnownLegacySize(recipeName, modifierName) {
  const recipe = String(recipeName ?? '');
  const name = String(modifierName ?? '');
  if (/^(half serving|family size)$/i.test(name)) return true;
  if (!/^(regular|large)$/i.test(name)) return false;
  return /chicken adobo|garlic butter(?:ed)? shrimp|pork adobo|iced tea|leche flan/i.test(recipe);
}

function alignModifier(modifier, ingredients, inventory) {
  const next = { ...modifier };
  const currentType = validTypes.has(String(next.type)) ? String(next.type) : 'note';
  const isLessLabel = /^less\b/i.test(String(next.name ?? ''));
  const isRemoveLabel = /^(no|remove|without)\b/i.test(String(next.name ?? ''));
  const linkedIngredient = ingredients.find((item) => String(item.id) === String(next.itemId ?? ''));
  const adjustmentItem = linkedIngredient ?? ((isLessLabel || isRemoveLabel) ? findByName(ingredients, next.name) : undefined);

  if (currentType === 'size_variant') {
    next.type = 'size_variant';
    next.group = 'Size Variants';
    next.itemId = undefined;
    next.itemName = undefined;
    next.productId = undefined;
    next.requiresStock = false;
    next.quantity = undefined;
    next.unit = undefined;
    next.maxQuantity = undefined;
    next.levelPercent = undefined;
    next.sizeMultiplier = Number(next.sizeMultiplier) > 0 ? Number(next.sizeMultiplier) : 1;
    next.sellingPrice = Math.max(0, Number(next.sellingPrice ?? 0));
    next.priceDelta = Number.isFinite(Number(next.priceDelta)) ? Number(next.priceDelta) : 0;
    next.priceDeltaPercent = 0;
    return next;
  }

  if ((isLessLabel || isRemoveLabel) && adjustmentItem) {
    next.type = currentType === 'less' || currentType === 'ingredient_level' || isLessLabel ? 'ingredient_level' : 'remove';
    next.group = 'Basic Ingredients';
    next.itemId = adjustmentItem.id;
    next.itemName = adjustmentItem.name;
    next.productId = undefined;
    next.requiresStock = false;
    next.quantity = undefined;
    next.unit = undefined;
    next.maxQuantity = undefined;
    next.levelPercent = next.type === 'ingredient_level' ? Math.min(100, Math.max(0, Number(next.levelPercent ?? 50))) : undefined;
    next.priceDelta = 0;
    next.priceDeltaPercent = 0;
    return next;
  }

  const linkedInventory = inventory.find((item) => String(item.id) === String(next.itemId ?? ''));
  const mustRepairLegacyLink = /^(extra rice|extra ice)$/i.test(String(next.name ?? ''));
  const trustedLinkedInventory = currentType === 'add_on' && linkedInventory && !mustRepairLegacyLink ? linkedInventory : undefined;
  const linkedInventoryMatchesName = linkedInventory && findByName([linkedInventory], next.name);
  const addOnItem = trustedLinkedInventory ?? linkedInventoryMatchesName ?? (isAddOnCandidate(next)
    ? findAddOnAlias(ingredients, next.name) ?? findAddOnAlias(inventory, next.name) ?? findByName(inventory, next.name)
    : undefined);
  if ((currentType === 'add_on' || isAddOnCandidate(next)) && addOnItem) {
    next.type = 'add_on';
    next.group = String(next.group ?? '').trim() || 'Add-ons';
    next.itemId = addOnItem.id;
    next.itemName = addOnItem.name;
    next.productId = undefined;
    next.requiresStock = true;
    next.quantity = Number(next.quantity) > 0 ? Number(next.quantity) : 1;
    next.unit = addOnItem.unit ?? next.unit;
    // A conservative one-selection fallback keeps legacy options usable; Admin/Kitchen
    // can still set any higher per-recipe limit in Menu Modifiers.
    next.maxQuantity = Number.isInteger(Number(next.maxQuantity)) && Number(next.maxQuantity) > 0
      ? Number(next.maxQuantity)
      : 1;
    next.priceDelta = Math.max(0, Number(next.priceDelta ?? 0));
    next.priceDeltaPercent = 0;
    return next;
  }

  if ((currentType === 'remove' || currentType === 'less' || currentType === 'ingredient_level') && adjustmentItem && !/^(single|regular)\b/i.test(String(next.name ?? ''))) {
    next.type = currentType === 'less' ? 'ingredient_level' : currentType;
    next.group = 'Basic Ingredients';
    next.itemId = adjustmentItem.id;
    next.itemName = adjustmentItem.name;
    next.productId = undefined;
    next.requiresStock = false;
    next.quantity = undefined;
    next.unit = undefined;
    next.maxQuantity = undefined;
    next.levelPercent = next.type === 'ingredient_level' ? Math.min(100, Math.max(0, Number(next.levelPercent ?? 50))) : undefined;
    next.priceDelta = 0;
    next.priceDeltaPercent = 0;
    return next;
  }

  next.type = 'note';
  next.group = 'Instruction / Preferences';
  next.itemId = undefined;
  next.itemName = undefined;
  next.productId = undefined;
  next.requiresStock = false;
  next.quantity = undefined;
  next.unit = undefined;
  next.maxQuantity = undefined;
  next.priceDelta = 0;
  next.priceDeltaPercent = 0;
  return next;
}

function alignRecipeModifiers(recipe, modifiers, ingredients) {
  let aligned = modifiers
    .filter((modifier) => !(modifier.type === 'note' && /^regular$/i.test(String(modifier.name ?? '')) && isKnownLegacySize(recipe.name, modifier.name)))
    .map((modifier) => {
    if (modifier.type !== 'note'
      || (!/^(portion size|serving size|size)$/i.test(String(modifier.group ?? ''))
        && !isKnownLegacySize(recipe.name, modifier.name))) return modifier;
    const sizeMultiplier = sizeMultiplierForName(String(modifier.name ?? ''));
    const baseSellingPrice = Math.max(0, Number(recipe.sellingPrice ?? 0));
    return {
      ...modifier,
      type: 'size_variant',
      group: 'Size Variants',
      sizeMultiplier,
      sellingPrice: baseSellingPrice * sizeMultiplier,
      priceDelta: baseSellingPrice * (sizeMultiplier - 1),
      priceDeltaPercent: 0,
    };
    });
  if (/iced tea/i.test(String(recipe.name ?? ''))) {
    const sugar = findByName(ingredients, 'Sugar');
    if (sugar) {
      aligned = aligned.map((modifier) => {
        const match = String(modifier.name ?? '').match(/^(0|25|50|75|100)%/);
        if (!match) return modifier;
        const levelPercent = Number(match[1]);
        return {
          ...modifier,
          name: `${levelPercent}% Sweetness`,
          type: 'ingredient_level',
          group: 'Basic Ingredients',
          itemId: sugar.id,
          itemName: sugar.name,
          requiresStock: false,
          levelPercent,
          priceDelta: 0,
          priceDeltaPercent: 0,
        };
      });
    }
  }
  if (/^leche flan$/i.test(recipe.name)) {
    aligned = aligned.filter((modifier) => !(modifier.type === 'note' && /^fresh fruits$/i.test(String(modifier.name ?? ''))));
  }
  if (/^regular burger$/i.test(recipe.name)) {
    const invalidUnlinkedChoices = new Set(['no cheese', 'no mayo', 'extra mustard']);
    aligned = aligned.filter((modifier) => !(modifier.type === 'note' && invalidUnlinkedChoices.has(String(modifier.name ?? '').trim().toLowerCase())));

    const onion = findByName(ingredients, 'Onion');
    const hasNoOnion = aligned.some((modifier) => /^no onion$/i.test(String(modifier.name ?? '')));
    if (onion && !hasNoOnion) {
      aligned.push({
        id: `MOD-ALIGNED-NO-ONION-${recipe.id}`,
        name: 'No Onion',
        group: 'Vegetables',
        type: 'remove',
        itemId: onion.id,
        itemName: onion.name,
        requiresStock: false,
        priceDelta: 0,
        priceDeltaPercent: 0,
      });
    }
  }
  return aligned;
}

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_SUPABASE || process.env.DATABASE_URL_LOCAL;
  if (!connectionString) throw new Error('DATABASE_URL is missing in backend/.env');

  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { rows: recipes } = await client.query(
      `SELECT id, name, "businessId", "sellingPrice", modifiers
       FROM "Recipe"
       ORDER BY name`,
    );
    const { rows: items } = await client.query(
      `SELECT id, name, unit, "itemType", "businessId"
       FROM "InventoryItem"`,
    );
    const { rows: links } = await client.query(
      `SELECT ri."recipeId", item.id, item.name, item.unit
       FROM "RecipeIngredient" ri
       JOIN "InventoryItem" item ON item.id = ri."itemId"`,
    );

    let changedRecipes = 0;
    let changedModifiers = 0;
    for (const recipe of recipes) {
      const original = Array.isArray(recipe.modifiers) ? recipe.modifiers : [];
      const ingredients = links.filter((item) => item.recipeId === recipe.id);
      const inventory = items.filter((item) => item.businessId === recipe.businessId && item.itemType !== 'MENU_ITEM');
      const aligned = alignRecipeModifiers(
        recipe,
        original.map((modifier) => alignModifier(modifier, ingredients, inventory)),
        ingredients,
      );
      if (report) {
        console.log(`\n${recipe.name}`);
        for (const modifier of aligned) {
          console.log(`  [${modifier.type}] ${modifier.name}${modifier.itemName ? ` -> ${modifier.itemName}` : ''}`);
        }
      }
      const changes = JSON.stringify(aligned) === JSON.stringify(original)
        ? 0
        : Math.max(aligned.length, original.length);
      if (changes === 0) continue;

      changedRecipes += 1;
      changedModifiers += changes;
      console.log(`${recipe.name}: ${changes} modifier(s) aligned`);
      for (let index = 0; index < aligned.length; index += 1) {
        if (JSON.stringify(aligned[index]) === JSON.stringify(original[index])) continue;
        console.log(`  ${original[index]?.name ?? 'Unnamed'}: ${original[index]?.type ?? 'missing'} -> ${aligned[index].type}`);
      }
      if (apply) {
        await client.query(
          `UPDATE "Recipe" SET modifiers = $1::jsonb, "updatedAt" = NOW() WHERE id = $2`,
          [JSON.stringify(aligned), recipe.id],
        );
      }
    }

    if (apply) await client.query('COMMIT');
    else await client.query('ROLLBACK');
    console.log(`${apply ? 'Updated' : 'Would update'} ${changedModifiers} modifier(s) across ${changedRecipes} recipe(s).`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
