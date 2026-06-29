import { useEffect, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useSession } from "../../app/hooks/useSession";
import {
  useRestaurantCategoryHierarchyQuery,
  useUpsertRestaurantCategoryHierarchyMutation,
} from "../lib/restaurant";

type SupplierProduct = {
  name: string;
  price: number;
};

export type PurchaseOrderProductOption = {
  id: string;
  inventoryId?: number;
  name: string;
  sku?: string;
  category?: string;
  subCategory?: string;
  unit?: string;
  purchaseUnit?: string;
  baseUnit?: string;
  conversionFactor?: number;
};

export type PurchaseOrderItemInputValue = {
  productId?: string;
  inventoryId?: number;
  sku?: string;
  productName: string;
  category: string;
  subCategory: string;
  unit: string;
  purchaseUnit: string;
  baseUnit: string;
  conversionFactor: string;
  quantity: string;
  unitPrice: string;
  isNewProduct?: boolean;
  unitOverride?: boolean;
};

type PurchaseOrderItemInputProps = {
  supplierName: string;
  productDatabase: PurchaseOrderProductOption[];
  supplierProducts: SupplierProduct[];
  value: PurchaseOrderItemInputValue;
  onChange: (value: PurchaseOrderItemInputValue) => void;
  onAddItem: () => void;
  disabled?: boolean;
};

const UNIT_OPTIONS = [
  "kg",
  "g",
  "pcs",
  "liter",
  "milliliter",
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

const normalizeSearch = (value: string | undefined) => (value || '').trim().toLowerCase();
const preventNumberWheel = (event: React.WheelEvent<HTMLInputElement>) => {
  event.currentTarget.blur();
};

const normalizeUnitLabel = (value: string | undefined) => {
  const raw = (value || "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    ml: "milliliter",
    l: "liter",
    cans: "can",
    bottles: "bottle",
    bags: "bag",
    sacks: "sack",
    cartons: "carton",
    trays: "tray",
    gallons: "gallon",
    pcs: "pcs",
    pc: "pcs",
  };
  return aliases[raw] || raw;
};

export function PurchaseOrderItemInput({
  supplierName,
  productDatabase,
  supplierProducts,
  value,
  onChange,
  onAddItem,
  disabled = false,
}: PurchaseOrderItemInputProps) {
  const { currentUser } = useSession();
  const isAdmin = currentUser?.role === "Admin";
  const [query, setQuery] = useState(value.productName);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { data: categoryHierarchy = {} } = useRestaurantCategoryHierarchyQuery();
  const [newCategory, setNewCategory] = useState("");
  const [newSubCategory, setNewSubCategory] = useState("");
  const saveHierarchy = useUpsertRestaurantCategoryHierarchyMutation();

  useEffect(() => {
    setQuery(value.productName);
  }, [value.productName]);

  const normalizedQuery = normalizeSearch(query);

  const matchingProducts = useMemo(() => {
    if (!normalizedQuery || !supplierName) return [];
    return productDatabase.filter(
      (product) =>
        (product.name || '').toLowerCase().includes(normalizedQuery)
    );
  }, [normalizedQuery, productDatabase, supplierName]);

  const exactMatch = useMemo(
    () =>
      productDatabase.find(
        (product) => (product.name || '').toLowerCase() === normalizedQuery
      ),
    [normalizedQuery, productDatabase]
  );

  const categoryOptions = Object.keys(categoryHierarchy);
  const subCategoryOptions = value.category ? categoryHierarchy[value.category] || [] : [];
  const canAddItem = Boolean(
    value.productName.trim() &&
      value.quantity.trim() &&
      value.purchaseUnit.trim() &&
      value.baseUnit.trim() &&
      Number(value.conversionFactor || 0) > 0 &&
      value.unitPrice.trim() &&
      (!value.isNewProduct || value.category.trim())
  );

  const handleQueryChange = (next: string) => {
    const trimmed = next;
    setQuery(trimmed);
    setShowSuggestions(Boolean(trimmed) && !disabled && Boolean(supplierName));
    onChange({
      ...value,
      productId: undefined,
      inventoryId: undefined,
      sku: "",
      productName: trimmed,
      category: "",
      subCategory: "",
      unit: "",
      purchaseUnit: "",
      baseUnit: "",
      conversionFactor: "1",
      isNewProduct: false,
    });
  };

  const handleSelectExistingProduct = (product: PurchaseOrderProductOption) => {
    const supplierPrice = supplierProducts.find((item) => (item.name || '').toLowerCase() === (product.name || '').toLowerCase())?.price;
    const purchaseUnit = normalizeUnitLabel(product.purchaseUnit || product.unit);
    const baseUnit = normalizeUnitLabel(product.baseUnit || product.unit || purchaseUnit);
    onChange({
      ...value,
      productId: product.id,
      inventoryId: product.inventoryId,
      sku: product.sku || "",
      productName: product.name,
      category: product.category || "",
      subCategory: product.subCategory || "",
      unit: purchaseUnit,
      purchaseUnit,
      baseUnit,
      conversionFactor: String(product.conversionFactor || 1),
      unitPrice: supplierPrice !== undefined ? supplierPrice.toString() : value.unitPrice,
      isNewProduct: false,
      unitOverride: false,
    });
    setQuery(product.name);
    setShowSuggestions(false);
  };

  const handleCreateNew = () => {
    const name = query.trim();
    if (!name) return;
    onChange({
      ...value,
      productId: undefined,
      inventoryId: undefined,
      sku: "",
      productName: name,
      category: "",
      subCategory: "",
      unit: "",
      purchaseUnit: "",
      baseUnit: "",
      conversionFactor: "1",
      isNewProduct: true,
      unitOverride: false,
    });
    setShowSuggestions(false);
  };

  const handleFieldChange = (field: keyof PurchaseOrderItemInputValue, next: string) => {
    onChange({
      ...value,
      [field]: next,
    });
  };

  const handleUnitOverrideChange = (next: boolean) => {
    let nextUnit = value.unit;
    if (!next && value.productId) {
      const selectedProduct = productDatabase.find((product) => product.id === value.productId);
      nextUnit = selectedProduct?.unit || value.unit;
    }

    onChange({
      ...value,
      unitOverride: next,
      unit: nextUnit,
      purchaseUnit: nextUnit,
    });
  };

  const handleAddCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed || categoryHierarchy[trimmed]) return;
    const nextHierarchy = {
      ...categoryHierarchy,
      [trimmed]: [],
    };
    await saveHierarchy.mutateAsync(nextHierarchy);
    onChange({
      ...value,
      category: trimmed,
      subCategory: "",
    });
    setNewCategory("");
  };

  const handleAddSubCategory = async () => {
    const trimmed = newSubCategory.trim();
    const exists = subCategoryOptions.some(
      (subCategory) => subCategory.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (!value.category || !trimmed || exists) return;
    const nextHierarchy = {
      ...categoryHierarchy,
      [value.category]: [...subCategoryOptions, trimmed],
    };
    await saveHierarchy.mutateAsync(nextHierarchy);
    onChange({
      ...value,
      subCategory: trimmed,
    });
    setNewSubCategory("");
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="po-item-name" className="block text-xs mb-1 text-foreground">
          Item Name
        </label>
        <div className="relative">
          <input
            id="po-item-name"
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder={!supplierName ? "Please select a supplier first" : "Search or type item name..."}
            disabled={!supplierName || disabled}
            className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {showSuggestions && (matchingProducts.length > 0 || (!exactMatch && query.trim())) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-56 overflow-y-auto">
              {matchingProducts.length > 0 && (
                <div className="divide-y divide-border">
                  {matchingProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleSelectExistingProduct(product)}
                      className="w-full px-3 py-2 text-left hover:bg-muted/50 text-sm text-foreground flex items-center justify-between"
                    >
                      <span>{product.name}{product.sku ? ` (${product.sku})` : ""}</span>
                      <Check className="w-4 h-4" style={{ color: "#008967" }} />
                    </button>
                  ))}
                </div>
              )}

              {!exactMatch && query.trim() && (
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className="w-full px-3 py-2 text-left hover:bg-muted/50 text-sm text-primary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create new item: <span className="font-semibold">{query.trim()}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {value.isNewProduct && (
          <div>
            <label htmlFor="po-item-sku" className="block text-xs mb-1 text-foreground">
              SKU <span className="text-muted-foreground font-normal">(auto-generated if blank)</span>
            </label>
            <input
              id="po-item-sku"
              type="text"
              value={value.sku || ""}
              onChange={(e) => handleFieldChange("sku", e.target.value)}
              placeholder="Leave blank to auto-generate"
              className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
        )}

        <div>
          <label htmlFor="po-item-category" className="block text-xs mb-1 text-foreground">
            Category {value.isNewProduct ? "*" : ""}
          </label>
          <div className="space-y-2">
            <select
              id="po-item-category"
              value={value.category}
              onChange={(e) => {
                setNewSubCategory("");
                onChange({ ...value, category: e.target.value, subCategory: "" });
              }}
              disabled={!value.isNewProduct}
              className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
            >
              <option value="">Select category</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            {value.isNewProduct && isAdmin && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="New category"
                  className="min-w-0 flex-1 px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  disabled={!newCategory.trim()}
                  className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Add category"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="po-item-subcategory" className="block text-xs mb-1 text-foreground">
            Subcategory
          </label>
          <div className="space-y-2">
            <select
              id="po-item-subcategory"
              value={value.subCategory}
              onChange={(e) => handleFieldChange("subCategory", e.target.value)}
              disabled={!value.isNewProduct || !value.category}
              className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
            >
              <option value="">Select subcategory</option>
              {subCategoryOptions.map((subCategory) => (
                <option key={subCategory} value={subCategory}>
                  {subCategory}
                </option>
              ))}
            </select>
            {value.isNewProduct && isAdmin && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSubCategory}
                  onChange={(e) => setNewSubCategory(e.target.value)}
                  disabled={!value.category}
                  placeholder={value.category ? "New subcategory" : "Select category first"}
                  className="min-w-0 flex-1 px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={handleAddSubCategory}
                  disabled={!value.category || !newSubCategory.trim()}
                  className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Add subcategory"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="po-item-purchase-unit" className="block text-xs mb-1 text-foreground">
            Purchase Unit *
          </label>
          <select
            id="po-item-purchase-unit"
            value={value.purchaseUnit}
            onChange={(e) =>
              onChange({ ...value, purchaseUnit: e.target.value, unit: e.target.value })
            }
            disabled={!value.isNewProduct && !value.unitOverride}
            className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Select unit</option>
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
          {value.productId && !value.isNewProduct && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                id="unit-override"
                type="checkbox"
                checked={Boolean(value.unitOverride)}
                onChange={(e) => handleUnitOverrideChange(e.target.checked)}
                className="h-4 w-4 rounded border-muted-foreground text-primary focus:ring-primary"
              />
              <label htmlFor="unit-override" className="cursor-pointer">
                Override units
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label htmlFor="po-item-base-unit" className="block text-xs mb-1 text-foreground">
            Base Unit *
          </label>
          <select
            id="po-item-base-unit"
            value={value.baseUnit}
            onChange={(e) => handleFieldChange("baseUnit", e.target.value)}
            disabled={!value.isNewProduct && !value.unitOverride}
            className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Select unit</option>
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="po-item-conversion" className="block text-xs mb-1 text-foreground">
            Conversion Factor *
          </label>
          <input
            id="po-item-conversion"
            type="number"
            step="any"
            inputMode="decimal"
            min="0"
            value={value.conversionFactor}
            onWheel={preventNumberWheel}
            onChange={(e) => handleFieldChange("conversionFactor", e.target.value)}
            disabled={!value.isNewProduct && !value.unitOverride}
            placeholder="1"
            className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            1 {value.purchaseUnit || "purchase unit"} = {value.conversionFactor || "?"} {value.baseUnit || "base unit"}
          </p>
        </div>

        <div>
          <label htmlFor="po-item-quantity" className="block text-xs mb-1 text-foreground">
            Quantity Ordered *
          </label>
          <input
            id="po-item-quantity"
            type="number"
            step="any"
            inputMode="decimal"
            min="0"
            value={value.quantity}
            onWheel={preventNumberWheel}
            onChange={(e) => handleFieldChange("quantity", e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="po-item-price" className="block text-xs mb-1 text-foreground">
            Unit Price (₱) *
          </label>
          <input
            id="po-item-price"
            type="number"
            step="any"
            inputMode="decimal"
            min="0"
            value={value.unitPrice}
            onWheel={preventNumberWheel}
            onChange={(e) => handleFieldChange("unitPrice", e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onAddItem}
        disabled={!canAddItem || disabled || !supplierName}
        className="w-full px-4 py-3 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ backgroundColor: "#007A5E" }}
        onMouseEnter={(e) => !disabled && (e.currentTarget.style.backgroundColor = "#008967")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#007A5E")}
      >
        <Plus className="w-4 h-4" />
        Add Item
      </button>
    </div>
  );
}
