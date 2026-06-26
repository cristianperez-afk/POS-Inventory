import { useState, type WheelEvent } from "react";
import { ChefHat, Plus, Search, Edit, Trash2, X, Save, Calculator, Scale, Upload, Archive, RotateCcw } from "lucide-react";
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
  type: "remove" | "note";
  itemId?: string;
  itemName?: string;
  productId?: number | string;
  requiresStock?: boolean;
  priceDelta?: number;
  priceDeltaPercent?: number;
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
  instructions: string;
};

// Use the actual inventory product structure from the restaurant inventory query.
type InventoryItem = InventoryProduct & { backendId?: string };

const UNIT_OPTIONS = ["kg", "g", "L", "ml", "pcs", "piece", "liter", "bottle", "pack", "box", "dozen"];
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
      ...modifierPreset("Vegetables", ["No Lettuce", "No Tomato", "Extra Lettuce", "Extra Tomato", "Extra Onion"]),
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

const modifierNeedsStock = (group: string, name: string) => {
  if (/^no\b|^less\b|^mild$|^spicy$|well done|room temperature|chilled|sugar|ice|sour|salty|sweet|original|separate|dry style/i.test(name)) return false;
  return /\(\+P\)|extra|plain rice|garlic rice|chicken|pork|shrimp|patty|cheese|lettuce|tomato|onion|garlic|chili|egg|mushroom|vegetables|bacon|gravy|butter|lemon|caramel|cream|fruits|breast|thigh|leg|wing|lean|fatty|mixed/i.test(`${group} ${name}`);
};

const normalizeUnit = (unit: string | undefined) => {
  const normalized = (unit || '').trim().toLowerCase();
  if (normalized === "ltr" || normalized === "litre" || normalized === "liters" || normalized === "liter") return "l";
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
  const isAdmin = currentUser?.role === "Admin";
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
  const [modifierGroup, setModifierGroup] = useState(MODIFIER_GROUPS[0]);
  const [modifierItemId, setModifierItemId] = useState("");
  const [modifierName, setModifierName] = useState("");
  const [currentIngredient, setCurrentIngredient] = useState({
    productId: "",
    name: "",
    quantity: "",
    unit: "kg",
    inventoryUnit: "",
    unitCost: "",
  });

  const { data: inventoryItems = [] } = useRestaurantInventoryQuery<InventoryItem[]>();

  // Only show products that are actually in stock and not expired.
  const availableInventoryItems = inventoryItems.filter(item => item.stock > 0 && !isExpiredInventoryItem(item));

  const { data: recipes = [] } = useRestaurantRecipesQuery();
  const { data: archivedRecipes = [] } = useRestaurantRecipesQuery({ archived: true });
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
    return inventoryItems.find((item) => {
      const itemName = item.name.toLowerCase();
      return itemName === cleaned || itemName.includes(cleaned) || cleaned.includes(itemName);
    });
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

    setModifiers([
      ...modifiers,
      {
        id: `MOD-${Date.now()}`,
        name: modifierName.trim(),
        group: modifierGroup.trim() || "Modifiers",
        type: linkedItem ? "remove" : "note",
        productId: linkedItem?.id,
        itemId: linkedItem?.backendId,
        itemName: linkedItem?.name,
        requiresStock: Boolean(linkedItem),
        priceDelta: 0,
        priceDeltaPercent: 0,
      },
    ]);
    setModifierItemId("");
    setModifierName("");
  };

  const handleRemoveModifier = (id: string) => {
    setModifiers(modifiers.filter((modifier) => modifier.id !== id));
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

    setModifiers(preset.options.map((option, index) => {
      const requiresStock = modifierNeedsStock(option.group, option.name);
      const stockItem = requiresStock ? findModifierInventoryItem(option.group, option.name) : undefined;
      return {
        id: `MOD-${Date.now()}-${index}`,
        name: option.name,
        group: option.group,
        type: stockItem ? "remove" : "note",
        productId: stockItem?.id,
        itemId: stockItem?.backendId,
        itemName: stockItem?.name,
        requiresStock,
        priceDelta: option.priceDelta ?? 0,
        priceDeltaPercent: option.priceDeltaPercent ?? 0,
      };
    }));
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

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAdmin) {
      toast.error("Only admin users can create or edit recipes and pricing.");
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
      instructions: newRecipe.instructions,
    };

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
          modifiers: modifiers.map((modifier) => {
            const inventoryItem = findInventoryItem(modifier.productId ?? modifier.itemId);
            if (modifier.itemId && !inventoryItem?.backendId) {
              throw new Error(`Inventory link is missing for modifier ${modifier.name}`);
            }
            return {
              id: modifier.id,
              name: modifier.name,
              group: modifier.group ?? "Modifiers",
              type: inventoryItem?.backendId ? modifier.type : "note",
              itemId: inventoryItem?.backendId,
              itemName: inventoryItem?.name ?? modifier.itemName,
              requiresStock: Boolean(modifier.requiresStock),
              priceDelta: Number(modifier.priceDelta ?? 0),
              priceDeltaPercent: Number(modifier.priceDeltaPercent ?? 0),
            };
          }),
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
      setModifierGroup(MODIFIER_GROUPS[0]);
      setModifierItemId("");
      setModifierName("");
      setIngredientSearch("");
      setIsIngredientPickerOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save recipe");
    }
  };

  const handleViewRecipe = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setScaleMultiplier(1);
    setShowViewModal(true);
  };

  const handleEditRecipe = (recipe: Recipe) => {
    if (!isAdmin) {
      toast.error("Only admin users can edit recipes and pricing.");
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
    setModifiers((recipe.modifiers ?? []).map((modifier) => ({ ...modifier, group: modifier.group ?? "Modifiers" })));
    setModifierGroup(MODIFIER_GROUPS[0]);
    setModifierItemId("");
    setModifierName("");
    setIngredientSearch("");
    setIsIngredientPickerOpen(false);
    setShowCreateModal(true);
  };

  const handleDeleteRecipe = (id: string) => {
    if (!isAdmin) {
      toast.error("Only admin users can modify recipes.");
      return;
    }
    setPendingDeleteId(id);
  };

  const handleRestoreRecipe = async (id: string) => {
    if (!isAdmin) {
      toast.error("Only admin users can restore recipes.");
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
    setModifierIngredientId("");
    setModifierName("");
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
            {isAdmin
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
          {isAdmin && !viewArchived && (
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
        {filteredRecipes.map((recipe) => (
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
              {isAdmin && !viewArchived && (
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
              {isAdmin && viewArchived && (
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
        {filteredRecipes.length === 0 && (
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">{editingRecipe ? "Edit Recipe" : "Create New Recipe"}</h2>
              <button
                onClick={() => setShowCreateModal(false)}
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
                </div>

                <label className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
                  <input
                    name="isActive"
                    type="checkbox"
                    checked={newRecipe.isActive}
                    onChange={handleInputChange}
                    className="h-4 w-4 accent-primary"
                  />
                  Active in POS menu
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
                      {modifiers.length} option{modifiers.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                  <div>
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
                  </div>
                  <div>
                    <label htmlFor="modifierItem" className="block text-xs mb-1 text-foreground">
                      Stock Link
                    </label>
                    <select
                      id="modifierItem"
                      value={modifierItemId}
                      onChange={(event) => setModifierItemId(event.target.value)}
                      className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    >
                      <option value="">No stock effect</option>
                      {inventoryItems.map((item) => (
                        <option key={item.backendId ?? item.id} value={item.backendId ?? item.id}>
                          {item.name} ({item.stock} {item.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="modifierName" className="block text-xs mb-1 text-foreground">
                      POS Label
                    </label>
                    <input
                      id="modifierName"
                      value={modifierName}
                      onChange={(event) => setModifierName(event.target.value)}
                      placeholder="No cheese"
                      className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddModifier}
                    disabled={!modifierName.trim() || !modifierGroup.trim()}
                    className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {modifiers.length === 0 ? (
                    <p className="rounded-lg bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
                      No modifiers configured for this menu item
                    </p>
                  ) : (
                    modifiers.map((modifier) => {
                      const unavailable = isModifierUnavailable(modifier);
                      return (
                      <div key={modifier.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${unavailable ? "bg-gray-100 text-gray-400" : "bg-muted/40"}`}>
                        <div>
                          <p className={`text-sm font-medium ${unavailable ? "text-gray-400" : "text-foreground"}`}>
                            {modifier.group ?? "Modifiers"} - {modifier.name}
                            {formatModifierPrice(modifier) && <span className="ml-2 text-xs text-primary">{formatModifierPrice(modifier)}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {unavailable ? "Unavailable in stock - disabled in POS" : modifier.itemName ? `Linked to ${modifier.itemName}` : "Instruction only"}
                          </p>
                        </div>
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
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingRecipe ? "Save Recipe" : "Create Recipe"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200"
                >
                  Cancel
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
                                  <> | Expired: {new Date(ing.inventoryExpiry).toLocaleDateString()}</>
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
