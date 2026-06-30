import { useEffect, useRef, useState, type WheelEvent } from "react";
import { ChefHat, Plus, Search, Edit, Trash2, X, Save, Calculator, Scale, Upload, Archive, RotateCcw, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../../app/hooks/useSession";
import { InventoryProduct } from "../lib/inventoryLogic";
import {
  useDeleteRestaurantRecipeMutation,
  useRestaurantInventoryQuery,
  useRestaurantRecipesQuery,
  useRestoreRestaurantRecipeMutation,
  useSaveRestaurantRecipeMutation,
} from "../lib/restaurant";
import { getManilaDateKey } from "../../../../shared/utils/date";
import { InlineDataLoading } from "../shared/InlineDataLoading";

type Ingredient = {
  id: string;
  itemBackendId?: string;
  productId?: number | string;
  productSku?: string;
  name: string;
  quantity: number;
  unit: string;
  inventoryQuantity?: number;
  inventoryUnit?: string;
  inventoryStock?: number;
  inventoryUsableStock?: number;
  inventoryExpiry?: string | null;
  stockStatus?: "available" | "low" | "insufficient" | "expired" | "missing";
  unitCost: number;
  totalCost: number;
};

const preventNumberWheel = (event: WheelEvent<HTMLInputElement>) => {
  event.currentTarget.blur();
};

const numberInputClassName =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

type RecipeModifier = {
  id: string;
  name: string;
  group?: string;
  type: "remove" | "ingredient_level" | "size_variant" | "note" | "add_on";
  itemId?: string;
  itemName?: string;
  productId?: number | string;
  requiresStock?: boolean;
  quantity?: number;
  unit?: string;
  maxQuantity?: number;
  levelPercent?: number;
  sizeMultiplier?: number;
  sellingPrice?: number;
  ingredientQuantities?: Record<string, number>;
  priceDelta?: number;
  priceDeltaPercent?: number;
};

type RecipeSizeVariant = RecipeModifier & {
  type: "size_variant";
  sizeMultiplier: number;
  sellingPrice: number;
  ingredientQuantities: Record<string, number>;
};

type Recipe = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  menuItem?: {
    description?: string | null;
    imageUrl?: string | null;
  } | null;
  category: string;
  servings: number;
  yieldPercentage: number;
  prepTime: number;
  ingredients: Ingredient[];
  totalCost: number;
  yieldAdjustedCost?: number;
  costPerServing: number;
  targetFoodCost?: number;
  suggestedSellingPrice?: number;
  sellingPrice?: number;
  grossMargin?: number;
  isActive?: boolean;
  availableOrders?: number;
  archivedAt?: string | null;
  modifiers?: RecipeModifier[];
  sizeVariants?: RecipeSizeVariant[];
  instructions: string;
};

// Use the actual inventory product structure from the restaurant inventory query.
type InventoryItem = InventoryProduct & { backendId?: string };

function StockLinkAutocomplete({
  items,
  value,
  query,
  placeholder,
  onQueryChange,
  onSelect,
}: {
  items: InventoryItem[];
  value: string;
  query: string;
  placeholder: string;
  onQueryChange: (value: string) => void;
  onSelect: (item: InventoryItem) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = [...items]
    .filter((item) => !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      const leftStartsWith = normalizedQuery && left.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      const rightStartsWith = normalizedQuery && right.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      return leftStartsWith - rightStartsWith
        || left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
    });

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="modifierItem"
          type="text"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="modifier-stock-link-options"
          className="w-full rounded-lg border border-input bg-input-background py-2 pl-9 pr-9 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {isOpen && (
        <div
          id="modifier-stock-link-options"
          role="listbox"
          className="absolute z-40 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-xl"
        >
          {filteredItems.length > 0 ? filteredItems.map((item) => {
            const itemId = String(item.backendId ?? item.id);
            return (
              <button
                key={itemId}
                type="button"
                role="option"
                aria-selected={itemId === value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(item);
                  setIsOpen(false);
                }}
                className={`block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-primary/10 ${
                  itemId === value ? "bg-primary/10 font-medium text-primary" : "text-foreground"
                }`}
              >
                <span className="block">{item.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {item.stock} {item.unit} available
                </span>
              </button>
            );
          }) : (
            <div className="px-4 py-3 text-sm text-muted-foreground">No accessible stock items found.</div>
          )}
        </div>
      )}
    </div>
  );
}

const UNIT_OPTIONS = [
  "kg",
  "g",
  "L",
  "ml",
  "milliliter",
  "pcs",
  "piece",
  "liter",
  "bottle",
  "can",
  "pack",
  "box",
  "bag",
  "sack",
  "carton",
  "tray",
  "dozen",
  "gallon",
];
const MODIFIER_GROUPS = [
  "Protein Choice",
  "Flavor Adjustment",
  "Sauce Preference",
  "Add-ons",
  "Rice Options",
  "Portion Size",
  "Special Instructions",
  "Patty",
  "Cheese",
  "Vegetables",
  "Sauce",
  "Chicken Part",
  "Skin",
  "Gravy",
  "Soup",
  "Sourness",
  "Ice Level",
  "Sweetness",
  "Size",
  "Toppings",
  "Temperature",
];

const PRICES: Record<string, number> = {
  "Protein Choice|Boneless": 20,
  "Protein Choice|Lean Pork": 15,
  "Flavor Adjustment|Spicy": 10,
  "Flavor Adjustment|Extra Spicy": 15,
  "Sauce Preference|Extra Sauce": 15,
  "Sauce Preference|Separate Sauce": 10,
  "Add-ons|Extra Garlic": 10,
  "Add-ons|Extra Onion": 10,
  "Add-ons|Extra Chili": 10,
  "Add-ons|Boiled Egg": 20,
  "Add-ons|Mushroom": 25,
  "Add-ons|Extra Vegetables": 20,
  "Add-ons|Extra Butter": 20,
  "Rice Options|No Rice": -20,
  "Rice Options|Garlic Rice": 15,
  "Rice Options|Extra Rice": 25,
  "Rice Options|Half Rice": -10,
  "Portion Size|Large": 60,
  "Portion Size|Family Size": 180,
  "Extra Options|Extra Chicken": 45,
  "Extra Options|Extra Rice": 25,
  "Extra Options|Extra Vegetables": 20,
  "Extra Options|Peeled Shrimp": 20,
  "Extra Options|Extra Butter": 20,
  "Extra Options|Extra Garlic": 10,
  "Extra Options|Spicy": 10,
  "Patty|Double Patty": 60,
  "Cheese|Extra Cheese": 20,
  "Vegetables|Extra Lettuce": 10,
  "Vegetables|Extra Tomato": 15,
  "Vegetables|Extra Onion": 10,
  "Sauce|Extra Mayo": 10,
  "Sauce|BBQ Sauce": 10,
  "Sauce|Spicy Sauce": 10,
  "Add-ons|Bacon": 35,
  "Add-ons|Egg": 20,
  "Gravy|Extra Gravy": 10,
  "Rice|Extra Rice": 25,
  "Rice|Garlic Rice": 15,
  "Rice|No Rice": -20,
  "Spice|Spicy": 10,
  "Soup|More Soup": 15,
  "Sourness|Extra Sour": 10,
  "Meat|Lean Meat": 20,
  "Meat|Extra Pork": 60,
  "Vegetables|Extra Vegetables": 20,
  "Size|Large": 20,
  "Beverage Add-ons|Lemon Slice": 10,
  "Beverage Add-ons|Extra Lemon": 15,
  "Serving Size|Large": 30,
  "Toppings|Extra Caramel": 15,
  "Toppings|Whipped Cream": 20,
  "Toppings|Fresh Fruits": 35,
};
const PERCENTS: Record<string, number> = {
  "Portion Size|Half Serving": -50,
};

const modifierPreset = (group: string, names: string[]) => names.map((name) => ({
  group,
  name,
  priceDelta: PRICES[`${group}|${name}`] ?? 0,
  priceDeltaPercent: PERCENTS[`${group}|${name}`] ?? 0,
}));

const MAIN_COURSE_MODIFIERS = [
  ...modifierPreset("Protein Choice", ["Chicken Breast", "Chicken Thigh", "Mixed Parts", "Boneless", "Skin On", "No Skin", "Lean Pork", "Fatty Pork", "Mixed Pork Cuts"]),
  ...modifierPreset("Flavor Adjustment", ["Less Salty", "More Salty", "Less Sweet", "Sweeter", "Less Sour", "More Sour", "Mild", "Spicy", "Extra Spicy"]),
  ...modifierPreset("Sauce Preference", ["Extra Sauce", "Less Sauce", "Dry Style", "Separate Sauce"]),
  ...modifierPreset("Add-ons", ["Extra Garlic", "Extra Onion", "Extra Chili", "Boiled Egg", "Mushroom", "Extra Vegetables", "Extra Butter"]),
  ...modifierPreset("Rice Options", ["No Rice", "Plain Rice", "Garlic Rice", "Extra Rice", "Half Rice"]),
  ...modifierPreset("Portion Size", ["Half Serving", "Regular", "Large", "Family Size"]),
  ...modifierPreset("Special Instructions", ["Less Oil", "No MSG", "Cut into Smaller Pieces", "Well Done", "Cashier Note"]),
];

const RECIPE_PRESETS: Record<string, { match: RegExp; options: { group: string; name: string; priceDelta?: number; priceDeltaPercent?: number }[] }> = {
  "Chicken Adobo": {
    match: /chicken adobo/i,
    options: MAIN_COURSE_MODIFIERS,
  },
  "Chicken Rice Bowl": {
    match: /chicken rice bowl/i,
    options: [
      ...MAIN_COURSE_MODIFIERS.filter((option) => ["Protein Choice", "Rice Options", "Flavor Adjustment", "Sauce Preference", "Add-ons", "Special Instructions"].includes(option.group)),
      ...modifierPreset("Extra Options", ["Extra Chicken", "Extra Rice", "No Vegetables", "Extra Vegetables"]),
    ],
  },
  "Garlic Buttered Shrimp": {
    match: /garlic butter(?:ed)? shrimp|shrimp/i,
    options: [
      ...MAIN_COURSE_MODIFIERS.filter((option) => ["Flavor Adjustment", "Sauce Preference", "Rice Options", "Portion Size", "Add-ons", "Special Instructions"].includes(option.group)),
      ...modifierPreset("Extra Options", ["Peeled Shrimp", "With Shell", "Extra Butter", "Extra Garlic", "Spicy"]),
    ],
  },
  "Pork Adobo": {
    match: /pork adobo/i,
    options: [
      ...MAIN_COURSE_MODIFIERS.filter((option) => ["Flavor Adjustment", "Sauce Preference", "Rice Options", "Portion Size", "Add-ons", "Special Instructions"].includes(option.group)),
    ],
  },
  "Regular Burger": {
    match: /regular burger|burger/i,
    options: [
      ...modifierPreset("Patty", ["Single Patty", "Double Patty"]),
      ...modifierPreset("Cheese", ["No Cheese", "Extra Cheese"]),
      ...modifierPreset("Vegetables", ["No Lettuce", "No Tomato", "No Onion", "Extra Lettuce", "Extra Tomato", "Extra Onion"]),
      ...modifierPreset("Sauce", ["No Mayo", "Extra Mayo", "Extra Ketchup", "Extra Mustard", "BBQ Sauce", "Spicy Sauce"]),
      ...modifierPreset("Doneness", ["Well Done"]),
      ...modifierPreset("Add-ons", ["Bacon", "Egg"]),
    ],
  },
  "Chicken Joy": {
    match: /chicken joy/i,
    options: [
      ...modifierPreset("Chicken Part", ["Breast", "Thigh", "Drumstick", "Wing"]),
      ...modifierPreset("Skin", ["Crispy", "No Skin"]),
      ...modifierPreset("Gravy", ["Extra Gravy", "Separate Gravy", "No Gravy"]),
      ...modifierPreset("Rice", ["Extra Rice", "Garlic Rice", "No Rice"]),
      ...modifierPreset("Spice", ["Original", "Spicy"]),
    ],
  },
  "Sinigang na Baboy": {
    match: /sinigang na baboy|sinigang/i,
    options: [
      ...modifierPreset("Soup", ["More Soup", "Less Soup"]),
      ...modifierPreset("Sourness", ["Less Sour", "Regular", "Extra Sour"]),
      ...modifierPreset("Spice", ["Mild", "Spicy"]),
      ...modifierPreset("Meat", ["Lean Meat", "Mixed Meat", "Extra Pork"]),
      ...modifierPreset("Vegetables", ["Extra Vegetables", "No Okra", "No Eggplant", "No Radish"]),
      ...modifierPreset("Rice", ["No Rice", "Extra Rice", "Garlic Rice"]),
    ],
  },
  "Iced Tea": {
    match: /iced tea/i,
    options: [
      ...modifierPreset("Ice Level", ["No Ice", "Less Ice", "Regular Ice", "Extra Ice"]),
      ...modifierPreset("Sweetness", ["0% Sugar", "25%", "50%", "75%", "100%"]),
      ...modifierPreset("Size", ["Regular", "Large"]),
      ...modifierPreset("Beverage Add-ons", ["Lemon Slice", "Extra Lemon"]),
    ],
  },
  "Leche Flan": {
    match: /leche flan/i,
    options: [
      ...modifierPreset("Serving Size", ["Regular", "Large"]),
      ...modifierPreset("Toppings", ["Extra Caramel", "Whipped Cream", "Fresh Fruits"]),
      ...modifierPreset("Temperature", ["Chilled", "Room Temperature"]),
    ],
  },
};

const cleanModifierName = (name: string) =>
  name
    .replace(/\(\+P\)/gi, "")
    .replace(/\b(extra|more|less|no|regular|single|double|large|half|family|separate|dry style|with)\b/gi, "")
    .trim()
    .toLowerCase();

const modifierNameMatchesItem = (modifierName: string, itemName: string) => {
  const target = cleanModifierName(modifierName);
  const item = cleanModifierName(itemName);
  const singularTokens = (value: string) => value.split(/\s+/).filter(Boolean).map((token) =>
    token.endsWith("ies") && token.length > 4
      ? `${token.slice(0, -3)}y`
      : token.endsWith("oes") && token.length > 4
        ? token.slice(0, -2)
        : token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token,
  );
  const targetTokens = singularTokens(target);
  const itemTokens = singularTokens(item);
  return Boolean(target) && (target === item || targetTokens.every((token) => itemTokens.includes(token)));
};

const modifierNeedsStock = (group: string, name: string) => {
  if (/^no\b|^less\b|^mild$|^spicy$|well done|room temperature|chilled|sugar|ice|sour|salty|sweet|original|separate|dry style/i.test(name)) return false;
  return /\(\+P\)|extra|plain rice|garlic rice|chicken|pork|shrimp|patty|cheese|lettuce|tomato|onion|garlic|chili|egg|mushroom|vegetables|bacon|gravy|butter|lemon|caramel|cream|fruits|breast|thigh|leg|wing|lean|fatty|mixed/i.test(`${group} ${name}`);
};

const sizeMultiplierForName = (name: string) => {
  if (/half/i.test(name)) return 0.5;
  if (/extra large/i.test(name)) return 2;
  if (/family/i.test(name)) return 3;
  if (/large/i.test(name)) return 1.5;
  if (/small/i.test(name)) return 0.75;
  return 1;
};

const normalizeUnit = (unit: string | undefined) => {
  const normalized = (unit || '').trim().toLowerCase();
  if (normalized === "ltr" || normalized === "litre" || normalized === "liters" || normalized === "liter") return "l";
  if (normalized === "milliliter" || normalized === "millilitre" || normalized === "milliliters" || normalized === "millilitres") return "ml";
  if (normalized === "pc" || normalized === "piece" || normalized === "pieces") return "pcs";
  return normalized;
};

const toInventoryQuantity = (quantity: number, recipeUnit: string, inventoryUnit: string) => {
  const from = normalizeUnit(recipeUnit);
  const to = normalizeUnit(inventoryUnit);
  if (from === to) return quantity;
  if (from === "g" && to === "kg") return quantity / 1000;
  if (from === "kg" && to === "g") return quantity * 1000;
  if (from === "ml" && to === "l") return quantity / 1000;
  if (from === "l" && to === "ml") return quantity * 1000;
  if (from === "dozen" && to === "pcs") return quantity * 12;
  if (from === "pcs" && to === "dozen") return quantity / 12;
  return null;
};

const formatMoney = (value: number) => `₱${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;
const formatModifierPrice = (modifier: { priceDelta?: number; priceDeltaPercent?: number }) => {
  if (modifier.priceDeltaPercent) return `${modifier.priceDeltaPercent > 0 ? "+" : ""}${modifier.priceDeltaPercent}%`;
  if (modifier.priceDelta) return `${modifier.priceDelta > 0 ? "+" : "-"}P${Math.abs(modifier.priceDelta)}`;
  return "";
};

const isExpiredInventoryItem = (item: InventoryItem) => {
  if (!item.expiry) return false;
  const expiryDate = new Date(`${item.expiry}T00:00:00`);
  if (Number.isNaN(expiryDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiryDate < today;
};

const isExpiredDate = (value?: string | null) => {
  if (!value) return false;
  const expiryDate = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(expiryDate.getTime())) return false;
  expiryDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiryDate < today;
};

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0";

const calculateIngredientAvailableOrders = (ingredient: Ingredient) => {
  const requiredQuantity = ingredient.inventoryQuantity ?? ingredient.quantity;
  const usableStock = ingredient.inventoryUsableStock ?? (isExpiredDate(ingredient.inventoryExpiry) ? 0 : ingredient.inventoryStock);
  if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) return 0;
  return Math.max(0, Math.floor(Number(usableStock ?? 0) / requiredQuantity));
};

const getIngredientStockStatus = (ingredient: Ingredient) => {
  if (ingredient.stockStatus) return ingredient.stockStatus;
  if (isExpiredDate(ingredient.inventoryExpiry)) return "expired";
  const stock = Number(ingredient.inventoryStock ?? 0);
  const requiredQuantity = Number(ingredient.inventoryQuantity ?? ingredient.quantity);
  if (!Number.isFinite(stock) || stock <= 0) return "missing";
  if (Number.isFinite(requiredQuantity) && requiredQuantity > 0 && stock < requiredQuantity) return "insufficient";
  return "available";
};

const calculateRecipeYieldAdjustedCost = (recipe: Recipe) => {
  return recipe.yieldAdjustedCost ?? recipe.totalCost / Math.max((recipe.yieldPercentage || 100) / 100, 0.01);
};

const calculateRecipeGrossMarginPercent = (recipe: Recipe) => {
  const sellingPrice = recipe.sellingPrice ?? recipe.suggestedSellingPrice ?? 0;
  return sellingPrice > 0 ? ((sellingPrice - recipe.costPerServing) / sellingPrice) * 100 : 0;
};

export function RecipeBOM() {
  const { currentUser } = useSession();
  const normalizedRole = String(currentUser?.role ?? "").replace(/\s+/g, "").toLowerCase();
  const canManageRecipes = normalizedRole === "admin";
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active">("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [scaleMultiplier, setScaleMultiplier] = useState(1);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [viewArchived, setViewArchived] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [isIngredientPickerOpen, setIsIngredientPickerOpen] = useState(false);

  const [newRecipe, setNewRecipe] = useState({
    name: "",
    description: "",
    imageUrl: "",
    category: "",
    servings: "",
    yieldPercentage: "100",
    targetFoodCost: "35",
    sellingPrice: "",
    isActive: true,
    prepTime: "",
    instructions: "",
  });

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [modifiers, setModifiers] = useState<RecipeModifier[]>([]);
  const [sizeVariants, setSizeVariants] = useState<RecipeSizeVariant[]>([]);
  const [modifierGroup, setModifierGroup] = useState(MODIFIER_GROUPS[0]);
  const [modifierItemId, setModifierItemId] = useState("");
  const [modifierItemSearch, setModifierItemSearch] = useState("");
  const [modifierName, setModifierName] = useState("");
  const [modifierType, setModifierType] = useState<RecipeModifier["type"]>("note");
  const [modifierQuantity, setModifierQuantity] = useState("1");
  const [modifierMaxQuantity, setModifierMaxQuantity] = useState("");
  const [modifierPrice, setModifierPrice] = useState("");
  const [modifierLevelPercent, setModifierLevelPercent] = useState("50");
  const [modifierSizeMultiplier, setModifierSizeMultiplier] = useState("1");
  const [modifierSizeSellingPrice, setModifierSizeSellingPrice] = useState("");
  const [sizeVariantName, setSizeVariantName] = useState("");
  const [sizeVariantMultiplier, setSizeVariantMultiplier] = useState("1");
  const [sizeVariantSellingPrice, setSizeVariantSellingPrice] = useState("");
  const [sizeVariantIngredientQuantities, setSizeVariantIngredientQuantities] = useState<Record<string, string>>({});
  const [editingSizeVariantId, setEditingSizeVariantId] = useState<string | null>(null);
  const recipeSubmitLockRef = useRef(false);
  const [isRecipeSubmitting, setIsRecipeSubmitting] = useState(false);
  const [currentIngredient, setCurrentIngredient] = useState({
    productId: "",
    name: "",
    quantity: "",
    unit: "kg",
    inventoryUnit: "",
    unitCost: "",
  });

  const { data: inventoryItems = [], isLoading: inventoryItemsLoading } = useRestaurantInventoryQuery<InventoryItem[]>(undefined, { enabled: canManageRecipes });

  // Only show products that are actually in stock and not expired.
  const availableInventoryItems = inventoryItems.filter(item => item.stock > 0 && !isExpiredInventoryItem(item));

  const { data: recipes = [], isLoading: recipesLoading } = useRestaurantRecipesQuery();
  const { data: archivedRecipes = [], isLoading: archivedRecipesLoading } = useRestaurantRecipesQuery({ archived: true });
  const recipeListLoading = inventoryItemsLoading || (viewArchived ? archivedRecipesLoading : recipesLoading);
  const saveRecipe = useSaveRestaurantRecipeMutation();
  const removeRecipe = useDeleteRestaurantRecipeMutation();
  const restoreRecipe = useRestoreRestaurantRecipeMutation();

  // The list source swaps between the live menu and the archive bin.
  const sourceRecipes = viewArchived ? archivedRecipes : recipes;
  const findInventoryItem = (productId?: number | string) =>
    inventoryItems.find((item) =>
      String(item.id) === String(productId) ||
      item.backendId === productId,
    );
  const findModifierInventoryItem = (group: string, name: string) => {
    const cleaned = cleanModifierName(name);
    if (!cleaned) return undefined;
    const exactMatch = inventoryItems.find((item) => cleanModifierName(item.name) === cleaned);
    if (exactMatch) return exactMatch;
    const aliases: Record<string, string[]> = {
      caramel: ["white sugar", "brown sugar"],
      "fresh fruits": ["strawberry"],
      "boiled egg": ["eggs"],
      "plain rice": ["white rice", "rice"],
      rice: ["white rice", "rice"],
      ice: ["ice"],
      mayo: ["mayonnaise"],
    };
    const aliasNames = aliases[cleaned] ?? [];
    const aliasMatch = aliasNames
      .map((alias) => inventoryItems.find((item) => item.name.trim().toLowerCase() === alias))
      .find((item): item is InventoryItem => Boolean(item));
    return aliasMatch ?? inventoryItems.find((item) => modifierNameMatchesItem(name, item.name));
  };
  const selectedModifierStockItem = findInventoryItem(modifierItemId);
  const selectedModifierBaseUnit = selectedModifierStockItem?.unit?.trim() || "unit";
  const menuModifiers = modifiers.filter((modifier) => modifier.type !== "size_variant");
  useEffect(() => {
    const multiplier = Number(sizeVariantMultiplier);
    setSizeVariantIngredientQuantities((current) => Object.fromEntries(ingredients.map((ingredient) => {
      const key = String(ingredient.itemBackendId ?? ingredient.productId ?? ingredient.id);
      const suggested = (ingredient.inventoryQuantity ?? ingredient.quantity) * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1);
      return [key, current[key] ?? String(Math.round((suggested + Number.EPSILON) * 1000) / 1000)];
    })));
  }, [ingredients]);
  const recipeIngredientStockItems = Array.from(new Map(
    ingredients
      .map((ingredient) => findInventoryItem(ingredient.itemBackendId ?? ingredient.productId))
      .filter((item): item is InventoryItem => Boolean(item))
      .map((item) => [String(item.backendId ?? item.id), item]),
  ).values());
  const findRecipeModifierInventoryItem = (name: string) => {
    const cleaned = cleanModifierName(name);
    if (!cleaned) return undefined;
    const directMatch = recipeIngredientStockItems.find((item) => modifierNameMatchesItem(name, item.name));
    if (directMatch) return directMatch;
    const aliases: Record<string, string[]> = { caramel: ["white sugar", "brown sugar"] };
    return (aliases[cleaned] ?? [])
      .map((alias) => recipeIngredientStockItems.find((item) => item.name.trim().toLowerCase() === alias))
      .find((item): item is InventoryItem => Boolean(item));
  };
  const modifierStockLinkItems = modifierType === "note" || modifierType === "size_variant"
    ? []
    : modifierType === "remove" || modifierType === "ingredient_level"
      ? recipeIngredientStockItems
      : inventoryItems;
  const suggestedModifierPrice = modifierType === "add_on" && selectedModifierStockItem
    ? Math.round((Number(selectedModifierStockItem.price ?? 0) * Number(modifierQuantity || 0) + Number.EPSILON) * 100) / 100
    : 0;
  const modifierNamePlaceholder = modifierType === "note"
    ? "e.g., Separate Sauce"
    : modifierType === "ingredient_level"
      ? "e.g., 25% Sweetness"
      : modifierType === "remove"
        ? "e.g., Remove Onion"
        : modifierType === "size_variant"
          ? "e.g., Large"
          : "e.g., Extra Cheese";
  const suggestedModifierNameForItem = (itemName: string) => {
    if (modifierType === "remove") return `Remove ${itemName}`;
    if (modifierType === "ingredient_level") return `${Number(modifierLevelPercent || 0)}% ${itemName}`;
    if (modifierType === "add_on") return `Extra ${itemName}`;
    return "";
  };
  const isModifierUnavailable = (modifier: RecipeModifier) => {
    if (!modifier.requiresStock && !modifier.itemId && !modifier.productId) return false;
    const item = findInventoryItem(modifier.productId ?? modifier.itemId);
    return !item || Number(item.stock ?? 0) <= 0;
  };

  const categories = ["all", "Appetizer", "Main Course", "Dessert", "Beverage"];

  const filteredInventoryItems = availableInventoryItems.filter((item) => {
    const query = ingredientSearch.trim().toLowerCase();
    if (!query) return true;
    return [item.name, item.sku, item.category, item.unit]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
  const visibleIngredientOptions = filteredInventoryItems.slice(0, 10);

  const filteredRecipes = sourceRecipes.filter(recipe => {
    const matchesSearch = (recipe.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (recipe.id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || recipe.category === categoryFilter;
    // The active/inactive filter only applies to the live menu, not the archive.
    const matchesActive = viewArchived || activeFilter === "all" || (recipe.isActive ?? true);
    return matchesSearch && matchesCategory && matchesActive;
  });

  const handleAddIngredient = () => {
    if (currentIngredient.productId && currentIngredient.quantity && currentIngredient.unitCost) {
      const selectedItem = inventoryItems.find(item =>
        currentIngredient.productId
          ? item.id === Number(currentIngredient.productId)
          : item.name === currentIngredient.name
      );
      if (!selectedItem) {
        toast.error("Please select a valid inventory item");
        return;
      }

      const quantity = parseFloat(currentIngredient.quantity);
      const unitCost = parseFloat(currentIngredient.unitCost);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        toast.error("Ingredient quantity must be greater than zero");
        return;
      }
      if (isExpiredInventoryItem(selectedItem)) {
        toast.error(`${selectedItem.name} is expired and cannot be used in a recipe.`);
        return;
      }

      const inventoryQuantity = toInventoryQuantity(quantity, currentIngredient.unit, selectedItem.unit);
      if (inventoryQuantity === null) {
        toast.error(`Cannot convert ${currentIngredient.unit} to inventory unit ${selectedItem.unit}. Please choose a compatible unit.`);
        return;
      }

      if (inventoryQuantity > selectedItem.stock) {
        toast.warning(`This recipe needs ${inventoryQuantity.toFixed(2)} ${selectedItem.unit}, but only ${selectedItem.stock.toFixed(2)} ${selectedItem.unit} is in stock.`);
      }

      const totalCost = inventoryQuantity * unitCost;

      const newIngredient: Ingredient = {
        id: `ING-${Date.now()}`,
        productId: selectedItem.id,
        productSku: selectedItem.sku,
        name: selectedItem.name,
        quantity: quantity,
        unit: currentIngredient.unit,
        inventoryQuantity,
        inventoryUnit: selectedItem.unit,
        inventoryStock: selectedItem.stock,
        inventoryUsableStock: selectedItem.stock,
        inventoryExpiry: selectedItem.expiry || null,
        stockStatus: "available",
        unitCost: unitCost,
        totalCost: totalCost,
      };

      const existingIngredient = ingredients.find(ing =>
        ing.productId === selectedItem.id &&
        normalizeUnit(ing.unit) === normalizeUnit(newIngredient.unit)
      );

      setIngredients(existingIngredient
        ? ingredients.map(ing => ing.id === existingIngredient.id
          ? {
              ...ing,
              quantity: ing.quantity + newIngredient.quantity,
              inventoryQuantity: (ing.inventoryQuantity || 0) + (newIngredient.inventoryQuantity || 0),
              totalCost: ing.totalCost + newIngredient.totalCost,
            }
          : ing
        )
        : [...ingredients, newIngredient]
      );
      setCurrentIngredient({
        productId: "",
        name: "",
        quantity: "",
        unit: "kg",
        inventoryUnit: "",
        unitCost: "",
      });
      setIngredientSearch("");
      setIsIngredientPickerOpen(false);
    }
  };

  const handleRemoveIngredient = (id: string) => {
    const removed = ingredients.find(ing => ing.id === id);
    setIngredients(ingredients.filter(ing => ing.id !== id));
    if (removed) {
      setModifiers(modifiers.filter(modifier => modifier.productId !== removed.productId));
      const removedKey = ingredientVariantKey(removed);
      setSizeVariants((current) => current.map((variant) => {
        const ingredientQuantities = { ...variant.ingredientQuantities };
        delete ingredientQuantities[removedKey];
        return { ...variant, ingredientQuantities };
      }));
    }
  };

  const handleAddModifier = () => {
    if (!modifierName.trim()) {
      toast.error("Modifier name is required");
      return;
    }
    const linkedItem = modifierItemId ? findInventoryItem(modifierItemId) : undefined;
    if (modifierItemId && !linkedItem) {
      toast.error("Please select a valid stock item");
      return;
    }
    if ((modifierType === "add_on" || modifierType === "remove" || modifierType === "ingredient_level") && !linkedItem) {
      toast.error(`${modifierType === "add_on" ? "Add-on" : "Ingredient adjustment"} modifiers must be linked to an inventory item`);
      return;
    }
    if ((modifierType === "remove" || modifierType === "ingredient_level") && linkedItem && !ingredients.some((ingredient) => {
      const ingredientInventoryItem = findInventoryItem(ingredient.itemBackendId ?? ingredient.productId);
      return String(ingredient.itemBackendId ?? ingredient.productId ?? "") === String(linkedItem.backendId ?? "")
        || String(ingredientInventoryItem?.backendId ?? "") === String(linkedItem.backendId ?? "")
        || String(ingredientInventoryItem?.id ?? "") === String(linkedItem.id);
    })) {
      toast.error("Ingredient adjustments can only target an ingredient already used by this recipe");
      return;
    }
    const quantity = Number(modifierQuantity);
    if (modifierType === "add_on" && (!Number.isFinite(quantity) || quantity <= 0)) {
      toast.error("Add-on quantity must be greater than zero");
      return;
    }
    const maxQuantity = Number(modifierMaxQuantity);
    if (modifierType === "add_on" && (!Number.isInteger(maxQuantity) || maxQuantity <= 0)) {
      toast.error("Maximum add-on quantity must be a whole number greater than zero");
      return;
    }
    const levelPercent = Number(modifierLevelPercent);
    if (modifierType === "ingredient_level" && (!Number.isFinite(levelPercent) || levelPercent < 0 || levelPercent > 100)) {
      toast.error("Ingredient level must be from 0% to 100%");
      return;
    }
    const sizeMultiplier = Number(modifierSizeMultiplier);
    const sizeSellingPrice = Number(modifierSizeSellingPrice);
    if (modifierType === "size_variant" && (!Number.isFinite(sizeMultiplier) || sizeMultiplier <= 0)) {
      toast.error("Size BOM multiplier must be greater than zero");
      return;
    }
    if (modifierType === "size_variant" && (!Number.isFinite(sizeSellingPrice) || sizeSellingPrice < 0)) {
      toast.error("Size selling price must be zero or greater");
      return;
    }
    const finalAdditionalPrice = modifierType === "size_variant"
      ? sizeSellingPrice - calculateMenuSellingPrice()
      : modifierType !== "add_on"
        ? 0
      : modifierPrice.trim() === ""
        ? suggestedModifierPrice
        : Number(modifierPrice || 0);
    if (!Number.isFinite(finalAdditionalPrice) || (modifierType === "add_on" && finalAdditionalPrice < 0)) {
      toast.error("Modifier price is invalid");
      return;
    }

    setModifiers([
      ...modifiers,
      {
        id: `MOD-${Date.now()}`,
        name: modifierName.trim(),
        group: modifierType === "add_on"
          ? modifierGroup.trim() || "Add-ons"
          : modifierType === "note"
            ? "Instruction / Preferences"
            : modifierType === "size_variant"
              ? "Size Variants"
              : "Basic Ingredients",
        type: modifierType,
        productId: linkedItem?.id,
        itemId: linkedItem?.backendId,
        itemName: linkedItem?.name,
        requiresStock: modifierType === "add_on",
        quantity: modifierType === "add_on" ? quantity : undefined,
        unit: modifierType === "add_on" ? linkedItem?.unit : undefined,
        maxQuantity: modifierType === "add_on" ? maxQuantity : undefined,
        levelPercent: modifierType === "ingredient_level" ? levelPercent : undefined,
        sizeMultiplier: modifierType === "size_variant" ? sizeMultiplier : undefined,
        sellingPrice: modifierType === "size_variant" ? sizeSellingPrice : undefined,
        priceDelta: finalAdditionalPrice,
        priceDeltaPercent: 0,
      },
    ]);
    setModifierItemId("");
    setModifierItemSearch("");
    setModifierName("");
    setModifierType("note");
    setModifierQuantity("1");
    setModifierMaxQuantity("");
    setModifierPrice("");
    setModifierLevelPercent("50");
    setModifierSizeMultiplier("1");
    setModifierSizeSellingPrice("");
  };

  const handleRemoveModifier = (id: string) => {
    setModifiers(modifiers.filter((modifier) => modifier.id !== id));
  };

  const handleModifierMaximumChange = (id: string, value: string) => {
    const parsed = Number(value);
    setModifiers((current) => current.map((modifier) => modifier.id === id
      ? { ...modifier, maxQuantity: value === "" || !Number.isFinite(parsed) ? undefined : Math.max(1, Math.floor(parsed)) }
      : modifier));
  };

  const applyPresetModifiers = () => {
    const recipeName = newRecipe.name.trim();
    const preset = Object.values(RECIPE_PRESETS).find((item) => item.match.test(recipeName)) ??
      (newRecipe.category === "Dessert" ? RECIPE_PRESETS["Leche Flan"] :
       newRecipe.category === "Beverage" ? RECIPE_PRESETS["Iced Tea"] : null);

    if (!preset) {
      toast.error("No dish preset matched this recipe name");
      return;
    }

    const presetMenuModifiers = preset.options.map((option, index): RecipeModifier => {
      const isRemove = /^(no|less)\b/i.test(option.name);
      const isLess = /^less\b/i.test(option.name);
      const isSizeVariant = /^(portion size|serving size|size)$/i.test(option.group);
      const ingredientLevelMatch = option.group === "Sweetness" ? option.name.match(/^(0|25|50|75|100)%/) : null;
      const ingredientLevelPercent = ingredientLevelMatch ? Number(ingredientLevelMatch[1]) : undefined;
      const sizeMultiplier = sizeMultiplierForName(option.name);
      const baseSellingPrice = calculateMenuSellingPrice();
      const adjustmentItem = ingredientLevelMatch
        ? findRecipeModifierInventoryItem("Sugar")
        : isRemove ? findRecipeModifierInventoryItem(option.name) : undefined;
      const requiresStock = !isRemove && modifierNeedsStock(option.group, option.name);
      const stockItem = adjustmentItem ?? (requiresStock ? findRecipeModifierInventoryItem(option.name) ?? findModifierInventoryItem(option.group, option.name) : undefined);
      const isAddOn = !isRemove && (
        /add-?ons?|toppings?|extra options?|beverage add-?ons?/i.test(option.group)
        || /^(extra|add)\b/i.test(option.name)
        || (/^double\b/i.test(option.name) && /patty/i.test(option.group))
        || /^(bacon|egg|boiled egg|mushroom)$/i.test(option.name)
      );
      return {
        id: `MOD-${Date.now()}-${index}`,
        name: ingredientLevelPercent == null ? option.name : `${ingredientLevelPercent}% Sweetness`,
        group: isSizeVariant ? "Size Variants" : ingredientLevelPercent == null ? option.group : "Basic Ingredients",
        type: isSizeVariant ? "size_variant" : ingredientLevelPercent != null && adjustmentItem ? "ingredient_level" : isLess && adjustmentItem ? "ingredient_level" : isRemove && adjustmentItem ? "remove" : isAddOn && stockItem ? "add_on" : "note",
        productId: stockItem?.id,
        itemId: stockItem?.backendId,
        itemName: stockItem?.name,
        requiresStock: Boolean(isAddOn && stockItem),
        quantity: isAddOn && stockItem ? 1 : undefined,
        unit: isAddOn && stockItem ? stockItem.unit : undefined,
        maxQuantity: undefined,
        levelPercent: ingredientLevelPercent ?? (isLess && adjustmentItem ? 50 : undefined),
        sizeMultiplier: isSizeVariant ? sizeMultiplier : undefined,
        sellingPrice: isSizeVariant ? baseSellingPrice * sizeMultiplier : undefined,
        priceDelta: isSizeVariant ? baseSellingPrice * (sizeMultiplier - 1) : isAddOn && stockItem ? option.priceDelta ?? 0 : 0,
        priceDeltaPercent: isAddOn && stockItem ? option.priceDeltaPercent ?? 0 : 0,
      };
    }).filter((modifier) => modifier.type !== "size_variant");
    setModifiers(presetMenuModifiers);
  };

  const calculateTotalCost = () => {
    return ingredients.reduce((sum, ing) => sum + ing.totalCost, 0);
  };

  const calculateYieldAdjustedCost = () => {
    const yieldPercentage = Number(newRecipe.yieldPercentage) || 100;
    return calculateTotalCost() / Math.max(yieldPercentage / 100, 0.01);
  };

  const calculateCostPerServing = () => {
    const servings = Number(newRecipe.servings) || 0;
    return servings > 0 ? calculateYieldAdjustedCost() / servings : 0;
  };

  const calculateSuggestedSellingPrice = () => {
    const targetFoodCost = Number(newRecipe.targetFoodCost) || 0;
    return targetFoodCost > 0 ? calculateCostPerServing() / (targetFoodCost / 100) : 0;
  };

  const calculateMenuSellingPrice = () => {
    const manualPrice = Number(newRecipe.sellingPrice);
    return Number.isFinite(manualPrice) && manualPrice > 0 ? manualPrice : calculateSuggestedSellingPrice();
  };

  const calculateGrossMargin = () => {
    return calculateMenuSellingPrice() - calculateCostPerServing();
  };

  const calculateGrossMarginPercent = () => {
    const menuSellingPrice = calculateMenuSellingPrice();
    return menuSellingPrice > 0 ? (calculateGrossMargin() / menuSellingPrice) * 100 : 0;
  };

  const ingredientVariantKey = (ingredient: Ingredient) => String(ingredient.itemBackendId ?? ingredient.productId ?? ingredient.id);
  const buildSizeIngredientSuggestions = (multiplier: number) => Object.fromEntries(
    ingredients.map((ingredient) => [
      ingredientVariantKey(ingredient),
      String(Math.round(((ingredient.inventoryQuantity ?? ingredient.quantity) * multiplier + Number.EPSILON) * 1000) / 1000),
    ]),
  );
  const calculateSizeVariantCost = (quantities: Record<string, string>) => ingredients.reduce((sum, ingredient) => {
    const quantity = Number(quantities[ingredientVariantKey(ingredient)] ?? 0);
    return sum + (Number.isFinite(quantity) ? quantity : 0) * Number(ingredient.unitCost ?? 0);
  }, 0);
  const resetSizeVariantDraft = () => {
    setEditingSizeVariantId(null);
    setSizeVariantName("");
    setSizeVariantMultiplier("1");
    setSizeVariantSellingPrice("");
    setSizeVariantIngredientQuantities(buildSizeIngredientSuggestions(1));
  };
  const handleSizeVariantMultiplierChange = (value: string) => {
    setSizeVariantMultiplier(value);
    const multiplier = Number(value);
    if (Number.isFinite(multiplier) && multiplier > 0) {
      setSizeVariantIngredientQuantities(buildSizeIngredientSuggestions(multiplier));
    }
  };
  const handleEditSizeVariant = (variant: RecipeModifier) => {
    const multiplier = Number(variant.sizeMultiplier ?? 1);
    setEditingSizeVariantId(variant.id);
    setSizeVariantName(variant.name);
    setSizeVariantMultiplier(String(multiplier));
    setSizeVariantSellingPrice(String(variant.sellingPrice ?? calculateMenuSellingPrice() + Number(variant.priceDelta ?? 0)));
    setSizeVariantIngredientQuantities(Object.fromEntries(ingredients.map((ingredient) => {
      const key = ingredientVariantKey(ingredient);
      const exactQuantity = variant.ingredientQuantities?.[key];
      return [key, String(exactQuantity ?? (ingredient.inventoryQuantity ?? ingredient.quantity) * multiplier)];
    })));
  };
  const handleSaveSizeVariant = () => {
    const name = sizeVariantName.trim();
    const multiplier = Number(sizeVariantMultiplier);
    const sellingPrice = Number(sizeVariantSellingPrice);
    if (!name) return toast.error("Size variant name is required");
    if (!Number.isFinite(multiplier) || multiplier <= 0) return toast.error("BOM multiplier must be greater than zero");
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) return toast.error("Size selling price must be zero or greater");
    if (sizeVariants.some((variant) => variant.id !== editingSizeVariantId && variant.name.trim().toLowerCase() === name.toLowerCase())) {
      return toast.error("A size variant with this name already exists");
    }
    const ingredientQuantities: Record<string, number> = {};
    for (const ingredient of ingredients) {
      const key = ingredientVariantKey(ingredient);
      const quantity = Number(sizeVariantIngredientQuantities[key]);
      if (!Number.isFinite(quantity) || quantity < 0) {
        return toast.error(`Enter a valid ${ingredient.inventoryUnit || ingredient.unit} quantity for ${ingredient.name}`);
      }
      ingredientQuantities[key] = quantity;
    }
    const variant: RecipeSizeVariant = {
      id: editingSizeVariantId ?? `SIZE-${Date.now()}`,
      name,
      group: "Size Variants",
      type: "size_variant",
      requiresStock: false,
      sizeMultiplier: multiplier,
      sellingPrice,
      ingredientQuantities,
      priceDelta: sellingPrice - calculateMenuSellingPrice(),
      priceDeltaPercent: 0,
    };
    setSizeVariants((current) => editingSizeVariantId
      ? current.map((currentVariant) => currentVariant.id === editingSizeVariantId ? variant : currentVariant)
      : [...current, variant]);
    resetSizeVariantDraft();
  };

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recipeSubmitLockRef.current) return;

    if (!canManageRecipes) {
      toast.error("Only Admin or Kitchen Staff users can create or edit recipes and pricing.");
      return;
    }
    const existingModifierIds = new Set((editingRecipe?.modifiers ?? []).map((modifier) => String(modifier.id)));
    const modifierWithoutMaximum = modifiers.find((modifier) =>
      modifier.type === "add_on"
      && !existingModifierIds.has(String(modifier.id))
      && (!Number.isInteger(Number(modifier.maxQuantity)) || Number(modifier.maxQuantity) <= 0));
    if (modifierWithoutMaximum) {
      toast.error(`Set a maximum add-on count for ${modifierWithoutMaximum.name}`);
      return;
    }

    if (ingredients.length === 0) {
      toast.error("Please add at least one ingredient");
      return;
    }

    const servings = parseInt(newRecipe.servings);
    const yieldPercentage = Number(newRecipe.yieldPercentage);
    const targetFoodCost = Number(newRecipe.targetFoodCost) || 0;
    const sellingPriceInput = Number(newRecipe.sellingPrice);
    const prepTime = parseInt(newRecipe.prepTime);

    if (!Number.isFinite(servings) || servings <= 0) {
      toast.error("Servings must be greater than zero");
      return;
    }
    if (!Number.isFinite(yieldPercentage) || yieldPercentage <= 0 || yieldPercentage > 100) {
      toast.error("Yield percentage must be between 1 and 100");
      return;
    }
    if (!Number.isFinite(targetFoodCost) || targetFoodCost <= 0 || targetFoodCost > 100) {
      toast.error("Target food cost percentage must be between 1 and 100");
      return;
    }
    if (newRecipe.sellingPrice && (!Number.isFinite(sellingPriceInput) || sellingPriceInput <= 0)) {
      toast.error("Menu selling price must be greater than zero when entered");
      return;
    }
    if (!Number.isFinite(prepTime) || prepTime < 0) {
      toast.error("Prep time cannot be negative");
      return;
    }

    const totalCost = calculateTotalCost();
    const yieldAdjustedCost = calculateYieldAdjustedCost();
    const costPerServing = yieldAdjustedCost / servings;
    const suggestedSellingPrice = targetFoodCost > 0 ? costPerServing / (targetFoodCost / 100) : 0;
    const sellingPrice = newRecipe.sellingPrice ? sellingPriceInput : suggestedSellingPrice;
    const grossMargin = sellingPrice > 0 ? sellingPrice - costPerServing : 0;

    const recipeToAdd: Recipe = {
      id: editingRecipe?.id || `RCP-${String(recipes.length + 1).padStart(3, '0')}`,
      name: newRecipe.name,
      category: newRecipe.category,
      servings: servings,
      yieldPercentage,
      targetFoodCost,
      prepTime,
      ingredients: ingredients,
      totalCost: totalCost,
      yieldAdjustedCost,
      costPerServing: costPerServing,
      suggestedSellingPrice,
      sellingPrice,
      grossMargin,
      isActive: newRecipe.isActive,
      modifiers,
      sizeVariants,
      instructions: newRecipe.instructions,
    };

    recipeSubmitLockRef.current = true;
    setIsRecipeSubmitting(true);
    try {
      await saveRecipe.mutateAsync({
        id: editingRecipe?.id,
        data: {
          name: recipeToAdd.name,
          description: newRecipe.description || null,
          imageUrl: newRecipe.imageUrl || null,
          category: recipeToAdd.category,
          servings: recipeToAdd.servings,
          yieldPercentage: recipeToAdd.yieldPercentage,
          prepTimeMinutes: recipeToAdd.prepTime,
          instructions: recipeToAdd.instructions,
          targetFoodCost: recipeToAdd.targetFoodCost,
          sellingPrice: recipeToAdd.sellingPrice,
          isActive: recipeToAdd.isActive,
          modifiers: menuModifiers.map((modifier) => {
            const inventoryItem = findInventoryItem(modifier.productId ?? modifier.itemId);
            if (modifier.itemId && !inventoryItem?.backendId) {
              throw new Error(`Inventory link is missing for modifier ${modifier.name}`);
            }
            return {
              id: modifier.id,
              name: modifier.name,
              group: modifier.group ?? "Modifiers",
              type: modifier.type === "note"
                ? "note"
                : inventoryItem?.backendId ? modifier.type : "note",
              itemId: inventoryItem?.backendId,
              itemName: inventoryItem?.name ?? modifier.itemName,
              requiresStock: Boolean(modifier.requiresStock),
              quantity: modifier.type === "add_on" ? Number(modifier.quantity ?? 1) : undefined,
              unit: modifier.type === "add_on" ? inventoryItem?.unit ?? modifier.unit : undefined,
              maxQuantity: modifier.type === "add_on" && Number.isInteger(Number(modifier.maxQuantity)) && Number(modifier.maxQuantity) > 0
                ? Math.floor(Number(modifier.maxQuantity))
                : undefined,
              levelPercent: modifier.type === "ingredient_level" ? Number(modifier.levelPercent ?? 50) : undefined,
              priceDelta: modifier.type === "add_on" ? Number(modifier.priceDelta ?? 0) : 0,
              priceDeltaPercent: modifier.type === "add_on" ? Number(modifier.priceDeltaPercent ?? 0) : 0,
            };
          }),
          sizeVariants: sizeVariants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            sizeMultiplier: Number(variant.sizeMultiplier),
            sellingPrice: Number(variant.sellingPrice),
            ingredientQuantities: Object.fromEntries(ingredients.map((ingredient) => {
              const inventoryItem = findInventoryItem(ingredient.productId ?? ingredient.itemBackendId);
              if (!inventoryItem?.backendId) {
                throw new Error(`Inventory link is missing for ${ingredient.name}`);
              }
              return [
                inventoryItem.backendId,
                Number(variant.ingredientQuantities[ingredientVariantKey(ingredient)] ?? 0),
              ];
            })),
          })),
          ingredients: recipeToAdd.ingredients.map((ingredient) => {
            const inventoryItem = findInventoryItem(ingredient.productId ?? ingredient.itemBackendId);
            if (!inventoryItem?.backendId) {
              throw new Error(`Inventory link is missing for ${ingredient.name}`);
            }
            return {
              itemId: inventoryItem.backendId,
              quantity: ingredient.inventoryQuantity ?? ingredient.quantity,
              unit: ingredient.inventoryUnit ?? ingredient.unit,
              unitCost: ingredient.unitCost,
            };
          }),
        },
      });
      setShowCreateModal(false);
      setEditingRecipe(null);
      setNewRecipe({
      name: "",
      description: "",
      imageUrl: "",
      category: "",
      servings: "",
      yieldPercentage: "100",
      targetFoodCost: "35",
      sellingPrice: "",
      isActive: true,
      prepTime: "",
      instructions: "",
      });
      setIngredients([]);
      setModifiers([]);
      setSizeVariants([]);
      setModifierGroup(MODIFIER_GROUPS[0]);
      setModifierItemId("");
      setModifierItemSearch("");
      setModifierName("");
      setModifierType("note");
      setModifierQuantity("1");
      setModifierMaxQuantity("");
      setModifierPrice("");
      setModifierLevelPercent("50");
      setModifierSizeMultiplier("1");
      setModifierSizeSellingPrice("");
      setIngredientSearch("");
      setIsIngredientPickerOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save recipe");
    } finally {
      recipeSubmitLockRef.current = false;
      setIsRecipeSubmitting(false);
    }
  };

  const handleViewRecipe = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setScaleMultiplier(1);
    setShowViewModal(true);
  };

  const handleEditRecipe = (recipe: Recipe) => {
    if (!canManageRecipes) {
      toast.error("Only Admin or Kitchen Staff users can edit recipes and pricing.");
      return;
    }

    setEditingRecipe(recipe);
    setNewRecipe({
      name: recipe.name,
      description: recipe.description ?? recipe.menuItem?.description ?? "",
      imageUrl: recipe.imageUrl ?? recipe.menuItem?.imageUrl ?? "",
      category: recipe.category,
      servings: recipe.servings.toString(),
      yieldPercentage: recipe.yieldPercentage.toString(),
      targetFoodCost: (recipe.targetFoodCost || 35).toString(),
      sellingPrice: (recipe.sellingPrice ?? recipe.suggestedSellingPrice ?? "").toString(),
      isActive: recipe.isActive ?? true,
      prepTime: recipe.prepTime.toString(),
      instructions: recipe.instructions,
    });
    setIngredients(recipe.ingredients);
    const legacySizeVariants = (recipe.modifiers ?? []).filter((modifier) => modifier.type === "size_variant") as RecipeSizeVariant[];
    setModifiers((recipe.modifiers ?? []).filter((modifier) => modifier.type !== "size_variant").map((modifier) => ({ ...modifier, group: modifier.group ?? "Modifiers" })));
    setSizeVariants((recipe.sizeVariants?.length ? recipe.sizeVariants : legacySizeVariants).map((variant) => ({
      ...variant,
      type: "size_variant",
      group: "Size Variants",
      sizeMultiplier: Number(variant.sizeMultiplier ?? 1),
      sellingPrice: Number(variant.sellingPrice ?? 0),
      ingredientQuantities: variant.ingredientQuantities ?? {},
    })));
    setModifierGroup(MODIFIER_GROUPS[0]);
    setModifierItemId("");
    setModifierItemSearch("");
    setModifierName("");
    setModifierType("note");
    setModifierQuantity("1");
    setModifierMaxQuantity("");
    setModifierPrice("");
    setModifierLevelPercent("50");
    setModifierSizeMultiplier("1");
    setModifierSizeSellingPrice("");
    setIngredientSearch("");
    setIsIngredientPickerOpen(false);
    setShowCreateModal(true);
  };

  const handleDeleteRecipe = (id: string) => {
    if (!canManageRecipes) {
      toast.error("Only Admin or Kitchen Staff users can modify recipes.");
      return;
    }
    setPendingDeleteId(id);
  };

  const handleRestoreRecipe = async (id: string) => {
    if (!canManageRecipes) {
      toast.error("Only Admin or Kitchen Staff users can restore recipes.");
      return;
    }
    try {
      await restoreRecipe.mutateAsync(id);
      toast.success("Recipe restored to the menu");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to restore recipe");
    }
  };

  const confirmDeleteRecipe = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    // In the archive bin "delete" means permanent removal; on the live menu it
    // means archive (a reversible soft-delete).
    const permanent = viewArchived;
    setPendingDeleteId(null);
    try {
      await removeRecipe.mutateAsync({ id, permanent });
      toast.success(permanent ? "Recipe permanently deleted" : "Recipe archived");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update recipe");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target instanceof HTMLInputElement && e.target.type === "checkbox"
      ? e.target.checked
      : e.target.value;

    setNewRecipe({
      ...newRecipe,
      [e.target.name]: value,
    });
  };

  const handleRecipeImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be 2MB or smaller.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setNewRecipe((current) => ({
        ...current,
        imageUrl: typeof reader.result === "string" ? reader.result : current.imageUrl,
      }));
    };
    reader.onerror = () => toast.error("Unable to read image file.");
    reader.readAsDataURL(file);
  };

  const removeRecipeImage = () => {
    setNewRecipe((current) => ({ ...current, imageUrl: "" }));
  };

  const handleIngredientInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    setCurrentIngredient({
      ...currentIngredient,
      [name]: value,
    });
  };

  const handleIngredientSearchChange = (value: string) => {
    setIngredientSearch(value);
    setIsIngredientPickerOpen(true);
    if (currentIngredient.productId) {
      setCurrentIngredient({
        ...currentIngredient,
        productId: "",
        name: "",
        inventoryUnit: "",
        unitCost: "",
      });
    }
  };

  const selectIngredient = (item: InventoryItem) => {
    setIngredientSearch(`${item.name}${item.sku ? ` (${item.sku})` : ""}`);
    setIsIngredientPickerOpen(false);
    setCurrentIngredient({
      ...currentIngredient,
      productId: item.id.toString(),
      name: item.name,
      unit: item.unit,
      inventoryUnit: item.unit,
      unitCost: item.price.toString(),
    });
  };

  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
    setEditingRecipe(null);
    setIngredientSearch("");
    setIsIngredientPickerOpen(false);
    setIngredients([]);
    setModifiers([]);
    setSizeVariants([]);
    setModifierItemId("");
    setModifierItemSearch("");
    setModifierName("");
    setModifierType("note");
    setModifierQuantity("1");
    setModifierMaxQuantity("");
    setModifierPrice("");
    setModifierLevelPercent("50");
    setModifierSizeMultiplier("1");
    setModifierSizeSellingPrice("");
    setCurrentIngredient({
      productId: "",
      name: "",
      quantity: "",
      unit: "kg",
      inventoryUnit: "",
      unitCost: "",
    });
    setNewRecipe({
      name: "",
      description: "",
      imageUrl: "",
      category: "",
      servings: "",
      yieldPercentage: "100",
      targetFoodCost: "35",
      sellingPrice: "",
      isActive: true,
      prepTime: "",
      instructions: "",
    });
  };

  const getScaledQuantity = (quantity: number) => {
    return (quantity * scaleMultiplier).toFixed(2);
  };

  const getScaledCost = (cost: number) => {
    return (cost * scaleMultiplier).toFixed(2);
  };

  // Count cards toggle the recipe list filter; clicking the active card (or Total
  // Recipes) clears it back to "all". Average / metric cards are not filters.
  const toggleActiveFilter = (filter: "all" | "active") => {
    setActiveFilter((current) => (current === filter ? "all" : filter));
  };

  const stats: Array<{
    label: string;
    value: number | string;
    color: string;
    filter: "all" | "active" | null;
  }> = [
    { label: "Total Recipes", value: recipes.length, color: "text-blue-600", filter: "all" },
    { label: "Active Menu Items", value: recipes.filter(r => r.isActive ?? true).length, color: "text-purple-600", filter: "active" },
    { label: "Recipes In Stock", value: recipes.filter(r => (r.availableOrders ?? 0) > 0).length, color: "text-emerald-600", filter: null },
    { label: "Avg Cost/Serving", value: formatMoney(recipes.length ? recipes.reduce((sum, r) => sum + r.costPerServing, 0) / recipes.length : 0), color: "text-green-600", filter: null },
    { label: "Avg Menu Price", value: formatMoney(recipes.length ? recipes.reduce((sum, r) => sum + (r.sellingPrice ?? r.suggestedSellingPrice ?? 0), 0) / recipes.length : 0), color: "text-orange-600", filter: null },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Recipe & BOM</h1>
          <p className="text-muted-foreground">
            {canManageRecipes
              ? "Manage recipes, ingredient costs, and menu pricing"
              : "View recipe costs, menu prices, and scaling"}
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <button
            onClick={() => setViewArchived((v) => !v)}
            aria-pressed={viewArchived}
            className={`px-5 py-3 rounded-2xl border transition-all duration-200 flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              viewArchived
                ? "bg-primary/10 text-primary border-primary/60"
                : "bg-card text-foreground border-border hover:border-primary/60"
            }`}
          >
            <Archive className="w-5 h-5" />
            {viewArchived ? `Back to Menu` : `Archived${archivedRecipes.length ? ` (${archivedRecipes.length})` : ""}`}
          </button>
          {canManageRecipes && !viewArchived && (
            <button
              onClick={handleOpenCreateModal}
              className="px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-2xl hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-md transition-all duration-200 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Recipe
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        {stats.map((stat, index) => {
          if (!stat.filter) {
            return (
              <div key={index} className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                <p className="text-muted-foreground text-sm mb-2">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            );
          }
          const isActive = activeFilter === stat.filter;
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggleActiveFilter(stat.filter!)}
              aria-pressed={isActive}
              aria-label={`Filter by ${stat.label}`}
              className={`group text-left w-full bg-card rounded-2xl p-6 shadow-sm border cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/25 hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-lg active:shadow-primary/30 ${
                isActive ? "border-primary bg-primary/5 shadow-md shadow-primary/20" : "border-border"
              }`}
            >
              <p className="text-muted-foreground text-sm mb-2">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </button>
          );
        })}
      </div>

      {/* Search and Filter */}
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-border mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search recipes by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer min-w-[200px]"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === "all" ? "All Categories" : cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Recipes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {!recipeListLoading && filteredRecipes.map((recipe) => (
          <div key={recipe.id} className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-all duration-200">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 overflow-hidden rounded-xl border border-border bg-muted flex items-center justify-center flex-shrink-0">
                  {recipe.imageUrl || recipe.menuItem?.imageUrl ? (
                    <img
                      src={recipe.imageUrl || recipe.menuItem?.imageUrl || ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ChefHat className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground">{recipe.name}</h3>
                  <p className="text-xs text-muted-foreground">{recipe.id}</p>
                </div>
              </div>
            </div>

            {(recipe.description || recipe.menuItem?.description) && (
              <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
                {recipe.description || recipe.menuItem?.description}
              </p>
            )}

            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Category:</span>
                <span className="font-medium text-foreground">{recipe.category}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Servings:</span>
                <span className="font-medium text-foreground">{recipe.servings}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Prep Time:</span>
                <span className="font-medium text-foreground">{recipe.prepTime} min</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Yield:</span>
                <span className="font-medium text-foreground">{recipe.yieldPercentage}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ingredients:</span>
                <span className="font-medium text-foreground">{recipe.ingredients.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Available Orders:</span>
                <span className={`font-semibold ${(recipe.availableOrders ?? 0) > 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {recipe.availableOrders ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Menu Status:</span>
                <span className={`font-medium ${(recipe.isActive ?? true) ? "text-green-600" : "text-muted-foreground"}`}>
                  {(recipe.isActive ?? true) ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-border mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Raw Cost</p>
                  <p className="text-lg font-bold text-primary">{formatMoney(recipe.totalCost)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Cost/Serving</p>
                  <p className="text-lg font-bold text-green-600">{formatMoney(recipe.costPerServing)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Yield-Adjusted</p>
                  <p className="text-sm font-semibold text-foreground">{formatMoney(calculateRecipeYieldAdjustedCost(recipe))}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Menu Price</p>
                  <p className="text-sm font-semibold text-foreground">{formatMoney(recipe.sellingPrice ?? recipe.suggestedSellingPrice ?? 0)}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleViewRecipe(recipe)}
                className="flex-1 px-4 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
              >
                <Calculator className="w-4 h-4" />
                View & Scale
              </button>
              {canManageRecipes && !viewArchived && (
                <>
                  <button
                    onClick={() => handleEditRecipe(recipe)}
                    className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                    title="Edit recipe and pricing"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRecipe(recipe.id)}
                    className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-colors"
                    title="Archive recipe (can be restored later)"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                </>
              )}
              {canManageRecipes && viewArchived && (
                <>
                  <button
                    onClick={() => handleRestoreRecipe(recipe.id)}
                    className="px-4 py-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors flex items-center gap-2"
                    title="Restore recipe to the menu"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restore
                  </button>
                  <button
                    onClick={() => handleDeleteRecipe(recipe.id)}
                    className="px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                    title="Delete permanently (only if never sold)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {recipeListLoading ? (
          <div className="col-span-full rounded-2xl border border-border bg-card shadow-sm">
            <InlineDataLoading label="Loading recipes…" className="min-h-48" />
          </div>
        ) : filteredRecipes.length === 0 && (
          <div className="col-span-full bg-card rounded-2xl p-12 shadow-sm border border-dashed border-border flex flex-col items-center justify-center text-center">
            <Archive className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-foreground font-medium">
              {viewArchived ? "No archived recipes" : "No recipes found"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {viewArchived
                ? "Recipes you archive will appear here and can be restored anytime."
                : "Try adjusting your search or filters, or create a new recipe."}
            </p>
          </div>
        )}
      </div>

      {/* Create Recipe Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { if (!isRecipeSubmitting) setShowCreateModal(false); }}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">{editingRecipe ? "Edit Recipe" : "Create New Recipe"}</h2>
              <button
                onClick={() => { if (!isRecipeSubmitting) setShowCreateModal(false); }}
                disabled={isRecipeSubmitting}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateRecipe} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm mb-2 text-foreground font-medium">
                    Recipe Name *
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={newRecipe.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground font-medium">
                    Picture / Image
                  </label>
                  <div className="grid grid-cols-[88px_minmax(0,1fr)_44px] items-center gap-3">
                    <div className="flex h-14 w-14 sm:h-20 sm:w-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-card p-2">
                      {newRecipe.imageUrl ? (
                        <img src={newRecipe.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ChefHat className="h-7 w-7 text-muted-foreground" />
                      )}
                    </div>
                    <label className="flex h-20 min-w-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-3 text-center transition-colors hover:bg-muted/40">
                      <Upload className="mb-1 h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-primary">Upload picture</span>
                      <span className="mt-0.5 text-[11px] text-muted-foreground">PNG, JPG or SVG</span>
                      <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleRecipeImageUpload} className="hidden" />
                    </label>
                    {newRecipe.imageUrl && (
                      <button
                        type="button"
                        onClick={removeRecipeImage}
                        title="Remove picture"
                        aria-label="Remove picture"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="category" className="block text-sm mb-2 text-foreground font-medium">
                    Category *
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={newRecipe.category}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                    required
                  >
                    <option value="">Select category</option>
                    <option value="Appetizer">Appetizer</option>
                    <option value="Main Course">Main Course</option>
                    <option value="Dessert">Dessert</option>
                    <option value="Beverage">Beverage</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label htmlFor="description" className="block text-sm mb-2 text-foreground font-medium">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={newRecipe.description}
                    onChange={handleInputChange}
                    rows={3}
                    placeholder="Short menu description shown in POS"
                    className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
                  />
                </div>

                <div>
                  <label htmlFor="servings" className="block text-sm mb-2 text-foreground font-medium">
                    Servings *
                  </label>
                  <input
                    id="servings"
                    name="servings"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    min="1"
                    value={newRecipe.servings}
                    onWheel={preventNumberWheel}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                    required
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Number of portions produced by one batch; used to calculate the cost per serving.</p>
                </div>

                <div>
                  <label htmlFor="yieldPercentage" className="block text-sm mb-2 text-foreground font-medium">
                    Yield Percentage *
                  </label>
                  <input
                    id="yieldPercentage"
                    name="yieldPercentage"
                    type="number"
                    min="1"
                    max="100"
                    step="any"
                    inputMode="decimal"
                    value={newRecipe.yieldPercentage}
                    onWheel={preventNumberWheel}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                    required
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Expected usable output after preparation or cooking loss; adjusts the recipe cost.</p>
                </div>

                <div>
                  <label htmlFor="targetFoodCost" className="block text-sm mb-2 text-foreground font-medium">
                    Target Food Cost % *
                  </label>
                  <input
                    id="targetFoodCost"
                    name="targetFoodCost"
                    type="number"
                    min="1"
                    max="100"
                    step="any"
                    inputMode="decimal"
                    value={newRecipe.targetFoodCost}
                    onWheel={preventNumberWheel}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                    required
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Used to compute the suggested price from current ingredient cost.</p>
                </div>

                <div>
                  <label htmlFor="sellingPrice" className="block text-sm mb-2 text-foreground font-medium">
                    Menu Selling Price
                  </label>
                  <input
                    id="sellingPrice"
                    name="sellingPrice"
                    type="number"
                    min="0.01"
                    step="any"
                    inputMode="decimal"
                    value={newRecipe.sellingPrice}
                    onWheel={preventNumberWheel}
                    onChange={handleInputChange}
                    placeholder={formatMoney(calculateSuggestedSellingPrice())}
                    className={`w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Leave blank to use the suggested price; edit this when the client wants a different menu price.</p>
                </div>

                <div>
                  <label htmlFor="prepTime" className="block text-sm mb-2 text-foreground font-medium">
                    Prep Time (minutes) *
                  </label>
                  <input
                    id="prepTime"
                    name="prepTime"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    min="0"
                    value={newRecipe.prepTime}
                    onWheel={preventNumberWheel}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                    required
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Estimated minutes needed to prepare one recipe batch for operational reference.</p>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
                  <input
                    name="isActive"
                    type="checkbox"
                    checked={newRecipe.isActive}
                    onChange={handleInputChange}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block font-medium">Active in POS menu</span>
                    <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Keep checked to make this recipe available in POS; uncheck to hide it without deleting the recipe.</span>
                  </span>
                </label>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Add Ingredients</h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  Ingredient unit cost is pulled from inventory so recipe cost follows the latest item unit cost.
                </p>

                <div className="grid grid-cols-5 gap-3 mb-4">
                  <div className="col-span-2">
                    <label htmlFor="ingredientSearch" className="block text-xs mb-1 text-foreground">
                      Ingredient
                    </label>
                    <div className="relative">
                      <input
                        id="ingredientSearch"
                        type="search"
                        value={ingredientSearch}
                        onFocus={() => setIsIngredientPickerOpen(true)}
                        onBlur={() => setTimeout(() => setIsIngredientPickerOpen(false), 120)}
                        onChange={(event) => handleIngredientSearchChange(event.target.value)}
                        placeholder="Search and select ingredient"
                        autoComplete="off"
                        className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                      />
                      {isIngredientPickerOpen && (
                        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                          {visibleIngredientOptions.length === 0 ? (
                            <div className="px-3 py-3 text-sm text-muted-foreground">
                              No matching ingredient
                            </div>
                          ) : (
                            visibleIngredientOptions.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectIngredient(item)}
                                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                                  String(currentIngredient.productId) === String(item.id)
                                    ? "bg-primary/10 text-primary"
                                    : "text-foreground hover:bg-muted/60"
                                }`}
                              >
                                <span className="min-w-0 truncate">
                                  {item.name}{item.sku ? ` (${item.sku})` : ""}
                                </span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {item.stock} {item.unit}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {currentIngredient.productId
                        ? `Selected: ${currentIngredient.name}`
                        : `Showing ${filteredInventoryItems.length} of ${availableInventoryItems.length} in-stock ingredients`}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="quantity" className="block text-xs mb-1 text-foreground">
                      Quantity
                    </label>
                    <input
                      id="quantity"
                      name="quantity"
                      type="number"
                      step="any"
                      inputMode="decimal"
                      min="0.01"
                      value={currentIngredient.quantity}
                      onWheel={preventNumberWheel}
                      onChange={handleIngredientInputChange}
                      className={`w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                    />
                  </div>

                  <div>
                    <label htmlFor="unit" className="block text-xs mb-1 text-foreground">
                      Recipe Unit
                    </label>
                    <select
                      id="unit"
                      name="unit"
                      value={currentIngredient.unit}
                      onChange={handleIngredientInputChange}
                      className="w-full px-3 py-2 text-sm bg-muted/50 border border-input rounded-lg focus:outline-none"
                    >
                      {UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                    {currentIngredient.inventoryUnit && (
                      <p className="mt-1 text-[10px] text-muted-foreground">Inventory unit: {currentIngredient.inventoryUnit}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="unitCost" className="block text-xs mb-1 text-foreground">
                      Inventory Unit Cost <span className="text-muted-foreground font-normal">(auto)</span>
                    </label>
                    <input
                      id="unitCost"
                      name="unitCost"
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={currentIngredient.unitCost}
                      onWheel={preventNumberWheel}
                      onChange={handleIngredientInputChange}
                      className={`w-full px-3 py-2 text-sm bg-muted/50 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                      readOnly
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddIngredient}
                  className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 mb-4"
                >
                  <Plus className="w-4 h-4" />
                  Add Ingredient
                </button>

                {ingredients.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground">Ingredients ({ingredients.length})</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {ingredients.map((ing) => (
                        <div key={ing.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{ing.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {ing.quantity} {ing.unit} = {(ing.inventoryQuantity ?? ing.quantity).toFixed(2)} {ing.inventoryUnit || ing.unit} x {formatMoney(ing.unitCost)} = {formatMoney(ing.totalCost)}
                            </p>
                            {ing.productSku && <p className="text-[10px] text-muted-foreground">SKU: {ing.productSku}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(ing.id)}
                            className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="pt-3 border-t border-border">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-foreground">Total Cost:</span>
                        <span className="text-xl font-bold text-primary">{formatMoney(calculateTotalCost())}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Size Variants</h3>
                    <p className="text-xs text-muted-foreground">Create recipe sizes with exact per-ingredient quantities, computed cost, and a separate POS selling price.</p>
                  </div>
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">{sizeVariants.length} size{sizeVariants.length !== 1 ? "s" : ""}</span>
                </div>

                <div className="mb-4 rounded-lg border border-violet-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Regular / Standard</p>
                      <p className="text-[11px] text-muted-foreground">Uses the basic recipe quantities shown above.</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">{formatMoney(calculateMenuSellingPrice())}</p>
                      <p className="text-[10px] text-muted-foreground">1× base BOM</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label htmlFor="sizeVariantName" className="mb-1 block text-xs text-foreground">Variant Name</label>
                    <input id="sizeVariantName" value={sizeVariantName} onChange={(event) => setSizeVariantName(event.target.value)} placeholder="e.g., Large" className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  </div>
                  <div>
                    <label htmlFor="sizeVariantMultiplier" className="mb-1 block text-xs text-foreground">Starting Multiplier</label>
                    <input id="sizeVariantMultiplier" type="number" min="0.01" step="0.01" value={sizeVariantMultiplier} onChange={(event) => handleSizeVariantMultiplierChange(event.target.value)} className={`w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${numberInputClassName}`} />
                    <p className="mt-1 text-[10px] text-muted-foreground">Generates starting quantities; each ingredient remains editable.</p>
                  </div>
                  <div>
                    <label htmlFor="sizeVariantSellingPrice" className="mb-1 block text-xs text-foreground">Final Selling Price (₱)</label>
                    <input id="sizeVariantSellingPrice" type="number" min="0" step="0.01" value={sizeVariantSellingPrice} onChange={(event) => setSizeVariantSellingPrice(event.target.value)} placeholder={(calculateSuggestedSellingPrice() * Number(sizeVariantMultiplier || 0)).toFixed(2)} className={`w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${numberInputClassName}`} />
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white">
                  <div className="grid grid-cols-[minmax(0,1fr)_100px_130px] gap-3 bg-muted/50 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                    <span>Ingredient</span><span>Base</span><span>Variant Quantity</span>
                  </div>
                  {ingredients.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">Add basic recipe ingredients first.</p>
                  ) : ingredients.map((ingredient) => {
                    const key = ingredientVariantKey(ingredient);
                    const baseQuantity = ingredient.inventoryQuantity ?? ingredient.quantity;
                    const unit = ingredient.inventoryUnit || ingredient.unit;
                    return (
                      <div key={`size-${key}`} className="grid grid-cols-[minmax(0,1fr)_100px_130px] items-center gap-3 border-t border-border px-3 py-2">
                        <span className="truncate text-sm text-foreground">{ingredient.name}</span>
                        <span className="text-xs text-muted-foreground">{baseQuantity} {unit}</span>
                        <div className="relative">
                          <input type="number" min="0" step="0.001" value={sizeVariantIngredientQuantities[key] ?? ""} onChange={(event) => setSizeVariantIngredientQuantities((current) => ({ ...current, [key]: event.target.value }))} className={`w-full rounded-md border border-input bg-input-background py-1.5 pl-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${numberInputClassName}`} aria-label={`${sizeVariantName || "Size"} quantity for ${ingredient.name}`} />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{unit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-violet-100/60 px-3 py-2">
                  <div className="text-xs text-foreground">
                    Computed ingredient cost: <strong>{formatMoney(calculateSizeVariantCost(sizeVariantIngredientQuantities))}</strong>
                  </div>
                  <div className="flex gap-2">
                    {editingSizeVariantId && <button type="button" onClick={resetSizeVariantDraft} className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium">Cancel Edit</button>}
                    <button type="button" onClick={handleSaveSizeVariant} disabled={ingredients.length === 0 || !sizeVariantName.trim()} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{editingSizeVariantId ? "Update Size" : "Add Size"}</button>
                  </div>
                </div>

                {sizeVariants.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-violet-200 pt-4">
                    <h4 className="text-sm font-semibold text-foreground">Created Size Variants</h4>
                    {sizeVariants.map((variant) => (
                      <div key={variant.id} className="flex items-center justify-between gap-3 rounded-lg border border-violet-100 bg-white px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{variant.name} — {formatMoney(Number(variant.sellingPrice ?? calculateMenuSellingPrice() + Number(variant.priceDelta ?? 0)))}</p>
                          <p className="text-[11px] text-muted-foreground">{variant.sizeMultiplier ?? 1}× starting multiplier • exact quantities saved for {Object.keys(variant.ingredientQuantities ?? {}).length || ingredients.length} ingredients</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => handleEditSizeVariant(variant)} className="rounded-md p-2 text-violet-700 hover:bg-violet-100" title="Edit size variant"><Edit className="size-4" /></button>
                          <button type="button" onClick={() => setSizeVariants((current) => current.filter((item) => item.id !== variant.id))} className="rounded-md p-2 text-red-600 hover:bg-red-100" title="Remove size variant"><Trash2 className="size-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Menu Modifiers</h3>
                    <p className="text-xs text-muted-foreground">Set the modifier choices that staff can use for this menu item in POS.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={applyPresetModifiers}
                      className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      Set defaults
                    </button>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      {menuModifiers.length} option{menuModifiers.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className={modifierType === "add_on" ? "md:order-2" : "hidden"}>
                    <label htmlFor="modifierGroup" className="block text-xs mb-1 text-foreground">
                      Category
                    </label>
                    <input
                      id="modifierGroup"
                      list="modifier-group-options"
                      value={modifierGroup}
                      onChange={(event) => setModifierGroup(event.target.value)}
                      placeholder="Flavor Adjustment"
                      className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    />
                    <datalist id="modifier-group-options">
                      {MODIFIER_GROUPS.map((group) => <option key={group} value={group} />)}
                    </datalist>
                    <p className="mt-1 text-[10px] text-muted-foreground">Groups related choices for easier Admin setup, such as Add-ons, Preparation, or Protein Choice.</p>
                  </div>
                  <div className="md:order-1">
                    <label htmlFor="modifierType" className="block text-xs mb-1 text-foreground">
                      Behavior
                    </label>
                    <select
                      id="modifierType"
                      value={modifierType}
                      onChange={(event) => {
                        const nextType = event.target.value as RecipeModifier["type"];
                        setModifierType(nextType);
                        setModifierPrice("");
                        setModifierLevelPercent("50");
                        setModifierSizeMultiplier("1");
                        setModifierSizeSellingPrice("");
                        setModifierItemId("");
                        setModifierItemSearch("");
                        if (nextType === "note") {
                          setModifierGroup("Instruction / Preferences");
                        } else if (nextType === "remove" || nextType === "ingredient_level") {
                          setModifierGroup("Basic Ingredients");
                        } else {
                          setModifierGroup("Add-ons");
                        }
                      }}
                      className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    >
                      <option value="note">Instruction / preference</option>
                      <option value="ingredient_level">Adjust ingredient level</option>
                      <option value="remove">Remove ingredient</option>
                      <option value="add_on">Add-on ingredient</option>
                    </select>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {modifierType === "note"
                        ? "Sends an instruction to POS and Kitchen without changing inventory quantity."
                        : modifierType === "ingredient_level"
                          ? "Sets the percentage of one linked recipe ingredient to use and deduct from stock."
                          : modifierType === "remove"
                            ? "Removes the linked basic ingredient and prevents its stock deduction for the order."
                            : "Adds a fixed extra portion, price, and inventory deduction for every 1x selected in POS."}
                    </p>
                  </div>
                  <div className={["remove", "ingredient_level", "add_on"].includes(modifierType) ? "md:order-3" : "hidden"}>
                    <label htmlFor="modifierItem" className="block text-xs mb-1 text-foreground">
                      Stock Link
                    </label>
                    <StockLinkAutocomplete
                      items={modifierStockLinkItems}
                      value={modifierItemId}
                      query={modifierItemSearch}
                      placeholder={modifierType === "add_on"
                        ? "Search or select any stock item"
                        : "Search or select a recipe ingredient"}
                      onQueryChange={(value) => {
                        setModifierItemSearch(value);
                        setModifierItemId("");
                      }}
                      onSelect={(item) => {
                        setModifierItemId(String(item.backendId ?? item.id));
                        setModifierItemSearch(item.name);
                        setModifierName(suggestedModifierNameForItem(item.name));
                      }}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {modifierType === "note"
                        ? "Optional for instructions because this behavior has no stock effect."
                        : modifierType === "remove" || modifierType === "ingredient_level"
                          ? "Only ingredients used by this specific recipe are listed, preventing unrelated inventory items from being reduced or removed."
                        : modifierType === "add_on"
                          ? "Select the inventory item that will be deducted whenever this add-on is ordered."
                        : "Select the basic recipe ingredient affected by this adjustment."}
                    </p>
                  </div>
                  <div className="md:order-4">
                    <label htmlFor="modifierName" className="block text-xs mb-1 text-foreground">
                      POS Label
                    </label>
                    <input
                      id="modifierName"
                      value={modifierName}
                      onChange={(event) => setModifierName(event.target.value)}
                      placeholder={modifierNamePlaceholder}
                      className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {modifierType === "note"
                        ? "Enter the instruction shown in POS, Kitchen Orders, order history, and receipts."
                        : modifierType === "size_variant"
                          ? "Enter the customer-facing size name shown in POS, Kitchen Orders, order history, and receipts."
                          : "Suggested automatically from the selected Stock Link. Admin/Kitchen may edit this label before adding it."}
                    </p>
                  </div>
                  <div className={modifierType === "ingredient_level" ? "md:order-5" : "hidden"}>
                    <label htmlFor="modifierLevelPercent" className="block text-xs mb-1 text-foreground">
                      Ingredient Level (%)
                    </label>
                    <input
                      id="modifierLevelPercent"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={modifierLevelPercent}
                      onChange={(event) => {
                        setModifierLevelPercent(event.target.value);
                        if (selectedModifierStockItem) setModifierName(`${event.target.value}% ${selectedModifierStockItem.name}`);
                      }}
                      className={`w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${numberInputClassName}`}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">0% removes the linked ingredient; 25%, 50%, 75%, or 100% deducts that percentage of its standard recipe quantity.</p>
                  </div>
                  <div className={modifierType === "size_variant" ? "md:order-5" : "hidden"}>
                    <label htmlFor="modifierSizeMultiplier" className="block text-xs mb-1 text-foreground">
                      Complete BOM Multiplier
                    </label>
                    <input
                      id="modifierSizeMultiplier"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={modifierSizeMultiplier}
                      onChange={(event) => setModifierSizeMultiplier(event.target.value)}
                      className={`w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${numberInputClassName}`}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">Example: Small 0.75×, Regular 1×, Large 1.5×. This scales every basic recipe ingredient.</p>
                  </div>
                  <div className={modifierType === "size_variant" ? "md:order-6" : "hidden"}>
                    <label htmlFor="modifierSizeSellingPrice" className="block text-xs mb-1 text-foreground">
                      Size Selling Price (₱)
                    </label>
                    <input
                      id="modifierSizeSellingPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={modifierSizeSellingPrice}
                      onChange={(event) => setModifierSizeSellingPrice(event.target.value)}
                      placeholder={(calculateSuggestedSellingPrice() * Number(modifierSizeMultiplier || 0)).toFixed(2)}
                      className={`w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${numberInputClassName}`}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">Estimated food cost: {formatMoney(calculateCostPerServing() * Number(modifierSizeMultiplier || 0))}. Enter the final POS selling price for this size.</p>
                  </div>
                  <div className={modifierType === "add_on" ? "md:order-5" : "hidden"}>
                    <label htmlFor="modifierQuantity" className="mb-1 flex items-center justify-between gap-2 text-xs text-foreground">
                      <span>Fixed Portion per 1x Add-on</span>
                      {selectedModifierStockItem && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                          Unit: {selectedModifierBaseUnit}
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        id="modifierQuantity"
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={modifierQuantity}
                        onChange={(event) => setModifierQuantity(event.target.value)}
                        disabled={modifierType !== "add_on"}
                        className={`w-full rounded-lg border border-input bg-input-background py-2 pl-3 pr-16 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 ${numberInputClassName} disabled:cursor-not-allowed disabled:opacity-50`}
                      />
                      {selectedModifierStockItem && (
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                          {selectedModifierBaseUnit}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {selectedModifierStockItem
                        ? `Enter the fixed quantity in ${selectedModifierBaseUnit}. Every 1x selected in POS deducts this amount from inventory.`
                        : "Select a Stock Link first to display its inventory base unit."}
                    </p>
                  </div>
                  <div className={modifierType === "add_on" ? "md:order-6" : "hidden"}>
                    <label htmlFor="modifierPrice" className="block text-xs mb-1 text-foreground">
                      Additional Price (₱) — Optional Override
                    </label>
                    <input
                      id="modifierPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={modifierPrice}
                      onChange={(event) => setModifierPrice(event.target.value)}
                      disabled={modifierType !== "add_on"}
                      placeholder={modifierType === "add_on" ? suggestedModifierPrice.toFixed(2) : "0.00"}
                      className={`w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName} disabled:cursor-not-allowed disabled:opacity-50`}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {modifierType === "remove" || modifierType === "ingredient_level"
                        ? "Disabled because removing or reducing a basic ingredient does not add a customer charge."
                        : modifierType === "add_on"
                        ? selectedModifierStockItem
                          ? `Suggested ${formatMoney(suggestedModifierPrice)}: ${formatMoney(Number(selectedModifierStockItem.price ?? 0))}/${selectedModifierBaseUnit} weighted average cost × ${Number(modifierQuantity || 0)} ${selectedModifierBaseUnit}. Leave blank to use it, or enter your own selling price.`
                          : "Select a Stock Link and enter a fixed portion to compute the price automatically."
                        : "Optional price adjustment applied once when this modifier is selected."}
                    </p>
                  </div>
                  <div className={modifierType === "add_on" ? "md:order-7" : "hidden"}>
                    <label htmlFor="modifierMaxQuantity" className="block text-xs mb-1 text-foreground">
                      Maximum Add-on Count
                    </label>
                    <input
                      id="modifierMaxQuantity"
                      type="number"
                      min="1"
                      step="1"
                      value={modifierMaxQuantity}
                      onChange={(event) => setModifierMaxQuantity(event.target.value)}
                      disabled={modifierType !== "add_on"}
                      className={`w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName} disabled:cursor-not-allowed disabled:opacity-50`}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">Available for Add-on behavior only. Limits how many times it may be selected for one menu item.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddModifier}
                    disabled={!modifierName.trim() || (modifierType === "add_on" && !modifierGroup.trim())}
                    className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 md:order-8"
                  >
                    Add
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {menuModifiers.length > 0 && (
                    <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Created Modifiers</h4>
                        <p className="text-[11px] text-muted-foreground">Configured options that will be available for this recipe in POS.</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {menuModifiers.length} total
                      </span>
                    </div>
                  )}
                  {menuModifiers.length === 0 ? (
                    <p className="rounded-lg bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
                      No modifiers configured for this menu item
                    </p>
                  ) : (
                    menuModifiers.map((modifier) => {
                      const unavailable = isModifierUnavailable(modifier);
                      return (
                      <div key={modifier.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${unavailable ? "bg-gray-100 text-gray-400" : "bg-muted/40"}`}>
                        <div>
                          <p className={`text-sm font-medium ${unavailable ? "text-gray-400" : "text-foreground"}`}>
                            {modifier.group ?? "Modifiers"} - {modifier.name}
                            {formatModifierPrice(modifier) && <span className="ml-2 text-xs text-primary">{formatModifierPrice(modifier)}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {unavailable
                              ? "Unavailable in stock - disabled in POS"
                              : modifier.type === "add_on"
                                ? `Add-on • ${modifier.quantity ?? 1} ${modifier.unit ?? "unit"} each • max ${modifier.maxQuantity ?? "not set"} • linked to ${modifier.itemName ?? "inventory"}`
                                : modifier.type === "ingredient_level"
                                  ? `Ingredient level ${modifier.levelPercent ?? 50}% • linked to ${modifier.itemName ?? "recipe ingredient"}`
                                : modifier.type === "remove"
                                  ? `Remove • linked to ${modifier.itemName ?? "recipe ingredient"}`
                                  : modifier.type === "size_variant"
                                    ? `Size variant • ${modifier.sizeMultiplier ?? 1}× complete BOM • selling price ${formatMoney(Number(modifier.sellingPrice ?? 0))}`
                                    : "Instruction only"}
                          </p>
                        </div>
                        {modifier.type === "add_on" && (
                          <label className="mx-3 flex items-center gap-2 text-xs text-muted-foreground">
                            Maximum
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={modifier.maxQuantity ?? ""}
                              onChange={(event) => handleModifierMaximumChange(modifier.id, event.target.value)}
                              className={`w-20 rounded-md border border-input bg-input-background px-2 py-1 text-foreground ${numberInputClassName}`}
                              aria-label={`Maximum add-on count for ${modifier.name}`}
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveModifier(modifier.id)}
                          className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-100"
                          title="Remove modifier"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )})
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Raw ingredient cost</p>
                  <p className="text-lg font-bold text-foreground">{formatMoney(calculateTotalCost())}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Yield-adjusted cost</p>
                  <p className="text-lg font-bold text-primary">{formatMoney(calculateYieldAdjustedCost())}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cost per serving</p>
                  <p className="text-lg font-bold text-green-600">{formatMoney(calculateCostPerServing())}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Target food cost</p>
                  <p className="text-sm font-semibold text-foreground">{Number(newRecipe.targetFoodCost) || 0}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Suggested menu price</p>
                  <p className="text-sm font-semibold text-foreground">{formatMoney(calculateSuggestedSellingPrice())}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Final menu price</p>
                  <p className="text-sm font-semibold text-foreground">{formatMoney(calculateMenuSellingPrice())}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gross margin</p>
                  <p className="text-sm font-semibold text-foreground">{formatMoney(calculateGrossMargin())} ({calculateGrossMarginPercent().toFixed(1)}%)</p>
                </div>
              </div>

              <div>
                <label htmlFor="instructions" className="block text-sm mb-2 text-foreground font-medium">
                  Instructions
                </label>
                <textarea
                  id="instructions"
                  name="instructions"
                  value={newRecipe.instructions}
                  onChange={handleInputChange}
                  rows={4}
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
                  placeholder="Enter cooking instructions..."
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-border">
                <button
                  type="submit"
                  disabled={isRecipeSubmitting}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRecipeSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {isRecipeSubmitting ? "Processing..." : editingRecipe ? "Save Recipe" : "Create Recipe"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isRecipeSubmitting}
                  className="px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRecipeSubmitting ? "Please wait..." : "Cancel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View & Scale Recipe Modal */}
      {showViewModal && selectedRecipe && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowViewModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{selectedRecipe.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{selectedRecipe.id} - {selectedRecipe.category}</p>
              </div>
              <button
                onClick={() => setShowViewModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Scale Controls */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Scale className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-blue-900">Recipe Scaling</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setScaleMultiplier(Math.max(0.5, scaleMultiplier - 0.5))}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      -
                    </button>
                    <span className="text-xl font-bold text-blue-900 min-w-[60px] text-center">
                      {scaleMultiplier}x
                    </span>
                    <button
                      onClick={() => setScaleMultiplier(scaleMultiplier + 0.5)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-700">Servings: {selectedRecipe.servings} x {scaleMultiplier} = <strong>{selectedRecipe.servings * scaleMultiplier}</strong></span>
                  <span className="text-blue-700">Yield-adjusted cost: <strong>{formatMoney(calculateRecipeYieldAdjustedCost(selectedRecipe) * scaleMultiplier)}</strong></span>
                </div>
              </div>

              {/* Recipe Info */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Prep Time</p>
                  <p className="text-lg font-bold text-foreground">{selectedRecipe.prepTime} min</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Yield %</p>
                  <p className="text-lg font-bold text-foreground">{selectedRecipe.yieldPercentage}%</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Cost/Serving</p>
                  <p className="text-lg font-bold text-green-600">{formatMoney(selectedRecipe.costPerServing)}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Ingredients</p>
                  <p className="text-lg font-bold text-foreground">{selectedRecipe.ingredients.length}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Available Orders</p>
                  <p className={`text-lg font-bold ${(selectedRecipe.availableOrders ?? 0) > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {selectedRecipe.availableOrders ?? 0}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Menu Price</p>
                  <p className="text-lg font-bold text-foreground">{formatMoney(selectedRecipe.sellingPrice ?? selectedRecipe.suggestedSellingPrice ?? 0)}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Target Food Cost</p>
                  <p className="text-lg font-bold text-foreground">{selectedRecipe.targetFoodCost || 0}%</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Gross Margin</p>
                  <p className="text-lg font-bold text-foreground">{calculateRecipeGrossMarginPercent(selectedRecipe).toFixed(1)}%</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">POS Status</p>
                  <p className={`text-lg font-bold ${(selectedRecipe.isActive ?? true) ? "text-green-600" : "text-muted-foreground"}`}>{(selectedRecipe.isActive ?? true) ? "Active" : "Inactive"}</p>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-lg font-semibold text-foreground">Size Variants</h3>
                <div className="rounded-xl bg-violet-50/50 p-4">
                  {selectedRecipe.sizeVariants?.length ? (
                    <div className="space-y-2">
                      {selectedRecipe.sizeVariants.map((variant) => (
                        <div key={variant.id} className="flex items-center justify-between gap-3 rounded-lg border border-violet-100 bg-white px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">{variant.name}</p>
                            <p className="text-[11px] text-muted-foreground">{variant.sizeMultiplier}× starting multiplier • exact BOM quantities saved</p>
                          </div>
                          <span className="text-sm font-semibold text-violet-700">{formatMoney(variant.sellingPrice)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No additional sizes configured; POS uses Regular / Standard.</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">Menu Modifiers</h3>
                <div className="bg-muted/30 rounded-xl p-4">
                  {selectedRecipe.modifiers?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedRecipe.modifiers.map((modifier) => (
                        <span key={modifier.id} className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                          {modifier.name}{formatModifierPrice(modifier) ? ` ${formatModifierPrice(modifier)}` : ""}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No menu modifiers configured</p>
                  )}
                </div>
              </div>

              {/* Ingredients Table */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">Bill of Materials (Scaled)</h3>
                <div className="bg-muted/30 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Ingredient</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Quantity</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Inventory Qty</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Max Orders</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Unit Cost</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedRecipe.ingredients.map((ing) => {
                        const stockStatus = getIngredientStockStatus(ing);
                        const physicalStock = Number(ing.inventoryStock ?? 0);
                        const usableStock = Number(
                          ing.inventoryUsableStock ?? (stockStatus === "expired" ? 0 : physicalStock),
                        );
                        return (
                          <tr key={ing.id}>
                            <td className="px-4 py-3 text-foreground">
                              <div className="flex items-center gap-2">
                                <p>{ing.name}</p>
                                {stockStatus !== "available" && (
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                    stockStatus === "expired"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-amber-100 text-amber-700"
                                  }`}>
                                    {stockStatus}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Stock: {formatNumber(physicalStock)} {ing.inventoryUnit || ing.unit}
                                {usableStock !== physicalStock && (
                                  <> | Usable: {formatNumber(usableStock)} {ing.inventoryUnit || ing.unit}</>
                                )}
                                {stockStatus === "expired" && ing.inventoryExpiry && (
                                  <> | Expired: {getManilaDateKey(ing.inventoryExpiry)}</>
                                )}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right text-foreground">
                              {getScaledQuantity(ing.quantity)} {ing.unit}
                            </td>
                            <td className="px-4 py-3 text-right text-foreground">
                              {getScaledQuantity(ing.inventoryQuantity ?? ing.quantity)} {ing.inventoryUnit || ing.unit}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-foreground">
                              {calculateIngredientAvailableOrders(ing)}
                            </td>
                            <td className="px-4 py-3 text-right text-foreground">{formatMoney(ing.unitCost)}</td>
                            <td className="px-4 py-3 text-right font-medium text-foreground">
                              {formatMoney(Number(getScaledCost(ing.totalCost)))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/50 border-t border-border">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-right font-semibold text-foreground">
                          Raw ingredient total:
                        </td>
                        <td className="px-4 py-3 text-right text-xl font-bold text-primary">
                          {formatMoney(Number(getScaledCost(selectedRecipe.totalCost)))}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-right font-semibold text-foreground">
                          Yield-adjusted total:
                        </td>
                        <td className="px-4 py-3 text-right text-xl font-bold text-green-600">
                          {formatMoney(calculateRecipeYieldAdjustedCost(selectedRecipe) * scaleMultiplier)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Instructions */}
              {selectedRecipe.instructions && (
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">Instructions</h3>
                  <div className="bg-muted/30 rounded-xl p-4">
                    <p className="text-sm text-foreground whitespace-pre-line">{selectedRecipe.instructions}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-border">
                <button
                  onClick={() => setShowViewModal(false)}
                  className="flex-1 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive / Delete Recipe Confirmation Modal */}
      {pendingDeleteId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm">
            <div className="p-6 border-b border-border flex items-center gap-3">
              {viewArchived ? (
                <Trash2 className="w-6 h-6 text-red-600 flex-shrink-0" />
              ) : (
                <Archive className="w-6 h-6 text-amber-600 flex-shrink-0" />
              )}
              <h2 className="text-lg font-bold text-foreground">
                {viewArchived ? "Delete Recipe Permanently" : "Archive Recipe"}
              </h2>
            </div>
            <div className="p-6">
              {viewArchived ? (
                <>
                  <p className="text-foreground mb-1">Permanently delete this recipe?</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    This cannot be undone. Recipes that have ever been sold cannot be deleted — archive them instead.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-foreground mb-1">Archive this recipe?</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    It will be removed from the menu and POS, but you can restore it anytime from the Archived view.
                  </p>
                </>
              )}
              <div className="flex gap-3">
                <button
                  onClick={confirmDeleteRecipe}
                  className={`flex-1 px-4 py-2 text-white rounded-xl transition-colors flex items-center justify-center gap-2 ${
                    viewArchived ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  {viewArchived ? <Trash2 className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                  {viewArchived ? "Delete" : "Archive"}
                </button>
                <button
                  onClick={() => setPendingDeleteId(null)}
                  className="px-4 py-2 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
