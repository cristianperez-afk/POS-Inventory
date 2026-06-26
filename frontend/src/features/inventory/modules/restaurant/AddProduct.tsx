import { useMemo, useState, type WheelEvent } from "react";
import { Apple, PhilippinePeso, Hash, Folder, Save, X, Calendar, Plus, FolderPlus, ShieldAlert, Check } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../../app/hooks/useSession";
import {
  useCreateRestaurantInventoryMutation,
  useRestaurantCategoryHierarchyQuery,
  useRestaurantInventoryQuery,
  useRestaurantLocationsQuery,
  useRestaurantStorageTemperatureOptionsQuery,
  useUpdateRestaurantInventoryMutation,
  useUpsertRestaurantCategoryHierarchyMutation,
  useUpsertRestaurantStorageTemperatureOptionsMutation,
} from "../lib/restaurant";

const buildGeneratedSku = (name: string, id: number) => {
  const skuBase = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 10);
  return `${skuBase || "ITEM"}-${id}`;
};

type StoredProduct = {
  id: number;
  backendId?: string;
  locationId?: string;
  name: string;
  itemType?: string;
  sku: string;
  category: string;
  subcategory?: string;
  stock: number;
  maxStock: number;
  minStock?: number;
  reorderPoint?: number;
  price: number;
  expiry: string;
  expiryPeriod?: string;
  location?: string;
  unit: string;
  storageTemperature?: string;
};

const EXPIRY_PERIOD_OPTIONS = [
  "Early Morning",
  "Morning",
  "Afternoon",
  "Evening",
  "Midnight",
];

const normalizeSearch = (value: string | undefined) =>
  (value || "").trim().toLowerCase().replace(/\s+/g, " ");

const splitCategory = (value: string | undefined) => {
  const [main = "", sub = ""] = (value || "").split(" > ");
  return { main, sub };
};

const preventNumberWheel = (event: WheelEvent<HTMLInputElement>) => {
  event.currentTarget.blur();
};

const numberInputClassName =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function AddProduct({ onClose }: { onClose?: () => void } = {}) {
  const { currentUser } = useSession();
  const userRole = currentUser?.role === "Admin" ? "admin" : "staff";

  if (userRole !== "admin") {
    return (
      <div className="p-8">
        <div className="max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-center gap-3 text-red-800">
            <ShieldAlert className="h-6 w-6" />
            <h1 className="text-xl font-bold">Admin Access Required</h1>
          </div>
          <p className="mt-3 text-sm text-red-700">Initial Stock Setup is restricted to admin users. To add new items to inventory, use the Purchase Orders workflow.</p>
        </div>
      </div>
    );
  }
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubCategory, setSelectedSubCategory] = useState("");
  const [selectedExistingProduct, setSelectedExistingProduct] = useState<StoredProduct | null>(null);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showStorageTemperatureModal, setShowStorageTemperatureModal] = useState(false);
  const [newMainCategory, setNewMainCategory] = useState("");
  const [newSubCategory, setNewSubCategory] = useState("");
  const [categoryForSubCategory, setCategoryForSubCategory] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    itemType: "INGREDIENT",
    sku: "",
    price: "",
    stock: "",
    minStock: "",
    maxStock: "",
    reorderPoint: "",
    expiryDate: "",
    expiryPeriod: "",
    noExpiry: false,
    storageTemp: "",
    unit: "",
  });

  const { data: products = [] } = useRestaurantInventoryQuery<StoredProduct[]>();
  const { data: locations = [] } = useRestaurantLocationsQuery();
  const { data: categoryHierarchy = {} } = useRestaurantCategoryHierarchyQuery();
  const { data: storageTemperatureOptions = [] } = useRestaurantStorageTemperatureOptionsQuery();
  const [newStorageTemperature, setNewStorageTemperature] = useState("");
  const createProduct = useCreateRestaurantInventoryMutation();
  const updateProduct = useUpdateRestaurantInventoryMutation();
  const saveCategoryHierarchy = useUpsertRestaurantCategoryHierarchyMutation();
  const saveStorageTemperatureOptions = useUpsertRestaurantStorageTemperatureOptionsMutation();

  const normalizedName = normalizeSearch(formData.name);
  const matchingProducts = useMemo(() => {
    if (!normalizedName) return [];
    return products.filter((product) => normalizeSearch(product.name).includes(normalizedName));
  }, [normalizedName, products]);
  const exactNameMatch = useMemo(
    () => products.find((product) => normalizeSearch(product.name) === normalizedName),
    [normalizedName, products],
  );

  const createStoredProduct = async (product: StoredProduct) => {
      if (!locations[0]) throw new Error("Create a location before adding inventory");
      return createProduct.mutateAsync({
        name: product.name,
        itemType: product.itemType,
        sku: product.sku || undefined,
        category: product.category,
        subcategory: product.subcategory || splitCategory(product.category).sub || undefined,
        quantity: product.stock,
        price: product.price,
        unit: product.unit,
        minStock: product.minStock,
        maxStock: product.maxStock,
        reorderPoint: product.reorderPoint,
        expiryDate: product.expiry ? new Date(`${product.expiry}T00:00:00`).toISOString() : undefined,
        expiryPeriod: product.expiryPeriod || undefined,
        storageTemperature: product.storageTemperature || undefined,
        locationId: locations[0].id,
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextId = products.length > 0 ? Math.max(...products.map(product => product.id)) + 1 : 1;
    const stock = Number(formData.stock) || 0;
    const minStock = formData.minStock ? Number(formData.minStock) : undefined;
    const maxStock = formData.maxStock ? Number(formData.maxStock) : Math.max(stock * 2, 1);
    const reorderPoint = formData.reorderPoint ? Number(formData.reorderPoint) : undefined;
    const sku = formData.sku.trim() || buildGeneratedSku(formData.name, nextId);
    const expiryDate = formData.noExpiry ? "" : formData.expiryDate;
    const expiryPeriod = formData.noExpiry ? "" : formData.expiryPeriod;

    const productToAdd: StoredProduct = {
      id: nextId,
      name: formData.name,
      itemType: formData.itemType,
      sku,
      category: `${selectedCategory} > ${selectedSubCategory}`,
      subcategory: selectedSubCategory,
      stock,
      maxStock,
      minStock,
      reorderPoint,
      price: Number(formData.price) || 0,
      expiry: expiryDate,
      expiryPeriod,
      location: "Unassigned",
      unit: formData.unit || "pcs",
      storageTemperature: formData.storageTemp,
    };

    try {
      const existingProduct = selectedExistingProduct ?? exactNameMatch ?? null;

      if (existingProduct?.backendId) {
        const { main, sub } = splitCategory(existingProduct.category);
        const nextCategory = selectedCategory || main;
        const nextSubCategory = selectedSubCategory || sub || "General";
        const nextQuantity = Number(existingProduct.stock ?? 0) + stock;
        await updateProduct.mutateAsync({
          id: existingProduct.backendId,
          data: {
            name: existingProduct.name,
            itemType: existingProduct.itemType,
            sku: existingProduct.sku || undefined,
            category: `${nextCategory} > ${nextSubCategory}`,
            subcategory: nextSubCategory,
            quantity: nextQuantity,
            price: Number(formData.price) || existingProduct.price || 0,
            unit: formData.unit || existingProduct.unit || "pcs",
            minStock,
            maxStock,
            reorderPoint,
            expiryDate: expiryDate ? new Date(`${expiryDate}T00:00:00`).toISOString() : undefined,
            expiryPeriod: expiryPeriod || undefined,
            noExpiry: formData.noExpiry,
            storageTemperature: formData.storageTemp || undefined,
            locationId: existingProduct.locationId || locations[0]?.id,
          },
        });
      } else {
        await createStoredProduct(productToAdd);
      }
      onClose?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create inventory item");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const checked = e.target instanceof HTMLInputElement ? e.target.checked : false;

    if (name === "noExpiry") {
      setFormData({
        ...formData,
        noExpiry: checked,
        expiryDate: checked ? "" : formData.expiryDate,
        expiryPeriod: checked ? "" : formData.expiryPeriod,
      });
      return;
    }

    if (name === "name") {
      setSelectedExistingProduct(null);
      setShowNameSuggestions(Boolean(value.trim()));
    }

    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSelectExistingProduct = (product: StoredProduct) => {
    const { main, sub } = splitCategory(product.category);
    setSelectedExistingProduct(product);
    setSelectedCategory(main);
    setSelectedSubCategory(sub);
    setFormData({
      name: product.name,
      itemType: product.itemType || "INGREDIENT",
      sku: product.sku || "",
      price: product.price ? String(product.price) : "",
      stock: "",
      minStock: product.minStock ? String(product.minStock) : "",
      maxStock: product.maxStock ? String(product.maxStock) : "",
      reorderPoint: product.reorderPoint ? String(product.reorderPoint) : "",
      expiryDate: product.expiry || "",
      expiryPeriod: product.expiryPeriod || "",
      noExpiry: !product.expiry,
      storageTemp: product.storageTemperature || "",
      unit: product.unit || "",
    });
    setShowNameSuggestions(false);
  };

  const handleCreateNewFromName = () => {
    const name = formData.name.trim();
    if (!name) return;
    setSelectedExistingProduct(null);
    setFormData({
      ...formData,
      name,
      sku: "",
      itemType: "INGREDIENT",
      price: "",
      minStock: "",
      maxStock: "",
      reorderPoint: "",
      expiryDate: "",
      expiryPeriod: "",
      noExpiry: false,
      storageTemp: "",
      unit: "",
    });
    setSelectedCategory("");
    setSelectedSubCategory("");
    setShowNameSuggestions(false);
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setSelectedSubCategory("");
  };

  const handleAddMainCategory = async () => {
    if (newMainCategory.trim()) {
      const nextHierarchy = {
        ...categoryHierarchy,
        [newMainCategory.trim()]: []
      };
      await saveCategoryHierarchy.mutateAsync(nextHierarchy);
      setNewMainCategory("");
      setShowCategoryModal(false);
    }
  };

  const handleAddSubCategory = async () => {
    if (categoryForSubCategory && newSubCategory.trim()) {
      const nextHierarchy = {
        ...categoryHierarchy,
        [categoryForSubCategory]: [
          ...(categoryHierarchy[categoryForSubCategory] || []),
          newSubCategory.trim()
        ]
      };
      await saveCategoryHierarchy.mutateAsync(nextHierarchy);
      setNewSubCategory("");
      setCategoryForSubCategory("");
      setShowCategoryModal(false);
    }
  };

  const handleAddStorageTemperature = async () => {
    const trimmed = newStorageTemperature.trim();
    if (!trimmed || storageTemperatureOptions.includes(trimmed)) return;
    const nextOptions = [...storageTemperatureOptions, trimmed];
    await saveStorageTemperatureOptions.mutateAsync(nextOptions);
    setFormData({ ...formData, storageTemp: trimmed });
    setNewStorageTemperature("");
    setShowStorageTemperatureModal(false);
  };

  const handleSelectStorageTemperature = (option: string) => {
    setFormData({ ...formData, storageTemp: option });
    setNewStorageTemperature("");
    setShowStorageTemperatureModal(false);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Initial Stock Setup</h1>
        <p className="text-muted-foreground">Add opening stock for items that entered inventory outside the standard purchase order process (e.g. opening stock, samples, donations).</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Main Form */}
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
              <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                <Apple className="w-5 h-5 text-primary" />
                Basic Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label htmlFor="name" className="block text-sm mb-2 text-foreground">
                    Name *
                  </label>
                  <div className="relative">
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleChange}
                      onFocus={() => setShowNameSuggestions(Boolean(formData.name.trim()))}
                      placeholder="Search or type item name..."
                      className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                      required
                    />
                    {showNameSuggestions && (matchingProducts.length > 0 || (!exactNameMatch && formData.name.trim())) && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto">
                        {matchingProducts.length > 0 && (
                          <div className="divide-y divide-border">
                            {matchingProducts.map((product) => (
                              <button
                                key={product.backendId ?? product.id}
                                type="button"
                                onClick={() => handleSelectExistingProduct(product)}
                                className="w-full px-4 py-3 text-left hover:bg-muted/50 text-sm text-foreground flex items-center justify-between gap-3"
                              >
                                <span className="min-w-0">
                                  <span className="block font-medium truncate">{product.name}</span>
                                  <span className="block text-xs text-muted-foreground truncate">
                                    {product.sku || "No SKU"} - {product.category || "Uncategorized"} - Current stock: {product.stock} {product.unit}
                                  </span>
                                </span>
                                <Check className="w-4 h-4 shrink-0 text-primary" />
                              </button>
                            ))}
                          </div>
                        )}

                        {!exactNameMatch && formData.name.trim() && (
                          <button
                            type="button"
                            onClick={handleCreateNewFromName}
                            className="w-full px-4 py-3 text-left hover:bg-muted/50 text-sm text-primary flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            Create new item: <span className="font-semibold">{formData.name.trim()}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {selectedExistingProduct && (
                    <p className="mt-2 text-xs text-primary">
                      Existing item selected. Saving will add this opening stock to the current inventory quantity.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="itemType" className="block text-sm mb-2 text-foreground">
                    Item Type *
                  </label>
                  <select
                    id="itemType"
                    name="itemType"
                    value={formData.itemType}
                    onChange={handleChange}
                    disabled={Boolean(selectedExistingProduct)}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                    required
                  >
                    {/* Inventory stores raw items only — menu items are created
                        on the menu/recipe screens, not here. */}
                    <option value="INGREDIENT">Ingredient</option>
                    <option value="SUPPLY">Supply</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="sku" className="block text-sm mb-2 text-foreground flex items-center gap-2">
                    <Hash className="w-4 h-4 text-muted-foreground" />
                    SKU <span className="text-xs text-muted-foreground font-normal">(auto-generated if blank)</span>
                  </label>
                  <input
                    id="sku"
                    name="sku"
                    type="text"
                    value={formData.sku}
                    onChange={handleChange}
                    placeholder="Leave blank to auto-generate"
                    disabled={Boolean(selectedExistingProduct)}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground flex items-center gap-2">
                    <Folder className="w-4 h-4 text-muted-foreground" />
                    Category *
                  </label>
                  <div className="grid grid-cols-[minmax(0,1fr)_3rem] gap-2">
                    <select
                      value={selectedCategory}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      disabled={Boolean(selectedExistingProduct)}
                      className="flex-1 px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                      required
                    >
                      <option value="">Select category</option>
                      {Object.keys(categoryHierarchy).map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowCategoryModal(true)}
                      disabled={Boolean(selectedExistingProduct)}
                      className="h-12 w-12 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Add Category"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground flex items-center gap-2">
                    <Folder className="w-4 h-4 text-muted-foreground" />
                    Subcategory *
                  </label>
                  <select
                    value={selectedSubCategory}
                    onChange={(e) => setSelectedSubCategory(e.target.value)}
                    disabled={!selectedCategory || Boolean(selectedExistingProduct)}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    required
                  >
                    <option value="">
                      {selectedCategory ? `Select ${(selectedCategory || '').toLowerCase()} type` : "Select category first"}
                    </option>
                    {selectedCategory && categoryHierarchy[selectedCategory]?.map((subCat) => (
                      <option key={subCat} value={subCat}>
                        {subCat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2 rounded-xl border border-border bg-muted/20 p-4">
                  <label className="flex items-start gap-3 text-sm text-foreground">
                    <input
                      name="noExpiry"
                      type="checkbox"
                      checked={formData.noExpiry}
                      onChange={handleChange}
                      className="mt-0.5 h-4 w-4 rounded border-muted-foreground text-primary focus:ring-primary"
                    />
                    <span>
                      <span className="block font-medium">No expiry date</span>
                      <span className="block text-xs text-muted-foreground">Use this for items that do not expire, like ice or non-perishable supplies.</span>
                    </span>
                  </label>
                </div>

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="expiryDate" className="block text-sm mb-2 text-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      Expiry Date {!formData.noExpiry && "*"}
                    </label>
                    <input
                      id="expiryDate"
                      name="expiryDate"
                      type="date"
                      value={formData.expiryDate}
                      onChange={handleChange}
                      disabled={formData.noExpiry}
                      className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      required={!formData.noExpiry}
                    />
                  </div>

                  <div>
                    <label htmlFor="expiryPeriod" className="block text-sm mb-2 text-foreground">
                      Expiry Period {!formData.noExpiry && "*"}
                    </label>
                    <select
                      id="expiryPeriod"
                      name="expiryPeriod"
                      value={formData.expiryPeriod}
                      onChange={handleChange}
                      disabled={formData.noExpiry}
                      className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      required={!formData.noExpiry}
                    >
                      <option value="">Select expiry period</option>
                      {EXPIRY_PERIOD_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="storageTemp" className="block text-sm mb-2 text-foreground">
                    Storage Temperature
                  </label>
                  <div className="grid grid-cols-[minmax(0,1fr)_3rem] gap-2">
                    <select
                      id="storageTemp"
                      name="storageTemp"
                      value={formData.storageTemp}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Select temperature</option>
                      {storageTemperatureOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowStorageTemperatureModal(true)}
                      className="h-12 w-12 bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      title="Add storage temperature"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* Pricing & Inventory */}
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
              <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                <PhilippinePeso className="w-5 h-5" style={{ color: "#007A5E" }} />
                Pricing & Inventory
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label htmlFor="price" className="block text-sm mb-2 text-foreground">
                    Price (₱) *
                  </label>
                  <div className="relative">
                    <PhilippinePeso className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="price"
                      name="price"
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={formData.price}
                      onWheel={preventNumberWheel}
                      onChange={handleChange}
                      placeholder="0.00"
                      className={`w-full pl-10 pr-2 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="stock" className="block text-sm mb-2 text-foreground">
                    Stock Qty *
                  </label>
                  <input
                    id="stock"
                    name="stock"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={formData.stock}
                    onWheel={preventNumberWheel}
                    onChange={handleChange}
                    placeholder="0"
                    className={`w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="unit" className="block text-sm mb-2 text-foreground">
                    Unit *
                  </label>
                  <select
                    id="unit"
                    name="unit"
                    value={formData.unit}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                    required
                  >
                    <option value="">Select unit</option>
                    <option value="pcs">pcs</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="liter">liter</option>
                    <option value="bottle">bottle</option>
                    <option value="pack">pack</option>
                    <option value="box">box</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="minStock" className="block text-sm mb-2 text-foreground">
                    Min Stock
                  </label>
                  <input
                    id="minStock"
                    name="minStock"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={formData.minStock}
                    onWheel={preventNumberWheel}
                    onChange={handleChange}
                    placeholder="Critical threshold"
                    className={`w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                  />
                </div>

                <div>
                  <label htmlFor="maxStock" className="block text-sm mb-2 text-foreground">
                    Max Stock
                  </label>
                  <input
                    id="maxStock"
                    name="maxStock"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={formData.maxStock}
                    onWheel={preventNumberWheel}
                    onChange={handleChange}
                    placeholder="Maximum capacity"
                    className={`w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                  />
                </div>

                <div>
                  <label htmlFor="reorderPoint" className="block text-sm mb-2 text-foreground">
                    Reorder Point
                  </label>
                  <input
                    id="reorderPoint"
                    name="reorderPoint"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={formData.reorderPoint}
                    onWheel={preventNumberWheel}
                    onChange={handleChange}
                    placeholder="Low stock threshold"
                    className={`w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all ${numberInputClassName}`}
                  />
                </div>

              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] gap-6 items-stretch">
            <div className="bg-gradient-to-br from-primary to-secondary rounded-2xl p-6 text-white">
              <h3 className="font-semibold text-sm mb-4">Storage Tips</h3>
              <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-1 gap-3 text-sm">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-white rounded-full mt-1.5 flex-shrink-0"></div>
                  <span>Enter accurate expiry dates only for perishable items</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-white rounded-full mt-1.5 flex-shrink-0"></div>
                  <span>Monitor temperature requirements</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-white rounded-full mt-1.5 flex-shrink-0"></div>
                  <span>List all allergens in description</span>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 flex flex-col justify-center gap-3">
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-secondary text-white py-3 text-sm rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 font-medium flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                {selectedExistingProduct ? "Add Stock to Existing Item" : "Save Food Item"}
              </button>
              <button
                type="button"
                onClick={() => onClose?.()}
                className="w-full bg-muted text-foreground py-3 text-sm rounded-xl hover:bg-muted/80 transition-all duration-200 font-medium flex items-center justify-center gap-2"
              >
                <X className="w-5 h-5" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Add Storage Temperature Modal */}
      {showStorageTemperatureModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl max-w-sm w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Add Storage Temperature</h2>
              <button
                type="button"
                onClick={() => {
                  setShowStorageTemperatureModal(false);
                  setNewStorageTemperature("");
                }}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <input
                type="text"
                value={newStorageTemperature}
                onChange={(e) => setNewStorageTemperature(e.target.value)}
                placeholder="e.g., Frozen, Chilled, Dry Storage"
                className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                autoFocus
              />
              <button
                type="button"
                onClick={handleAddStorageTemperature}
                disabled={!newStorageTemperature.trim()}
                className="w-full bg-gradient-to-r from-primary to-secondary text-white py-3 text-sm rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add Storage Temperature
              </button>

              <div className="bg-muted/30 rounded-xl p-4 max-h-44 overflow-y-auto">
                <h3 className="text-sm font-semibold text-foreground mb-3">Current Storage Temperatures</h3>
                {storageTemperatureOptions.length > 0 ? (
                  <div className="space-y-2">
                    {storageTemperatureOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleSelectStorageTemperature(option)}
                        className="w-full text-left text-sm text-foreground hover:text-primary transition-colors flex items-center justify-between gap-3"
                      >
                        <span className="truncate">{option}</span>
                        {formData.storageTemp === option && <Check className="w-4 h-4 shrink-0 text-primary" />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No storage temperatures yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-primary" />
                Add Food Category
              </h2>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setNewMainCategory("");
                  setNewSubCategory("");
                  setCategoryForSubCategory("");
                }}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Add Main Category */}
              <div className="bg-muted/30 rounded-lg p-3">
                <h3 className="text-sm font-semibold text-foreground mb-2">Add Main Category</h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newMainCategory}
                    onChange={(e) => setNewMainCategory(e.target.value)}
                    placeholder="e.g., Beverages"
                    className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                  <button
                    onClick={handleAddMainCategory}
                    disabled={!newMainCategory.trim()}
                    className="w-full bg-gradient-to-r from-primary to-secondary text-white py-2 text-sm rounded-lg hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    Add Main Category
                  </button>
                </div>
              </div>

              {/* Add Subcategory */}
              <div className="bg-muted/30 rounded-lg p-3">
                <h3 className="text-sm font-semibold text-foreground mb-2">Add Subcategory</h3>
                <div className="space-y-2">
                  <select
                    value={categoryForSubCategory}
                    onChange={(e) => setCategoryForSubCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Select main category</option>
                    {Object.keys(categoryHierarchy).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newSubCategory}
                    onChange={(e) => setNewSubCategory(e.target.value)}
                    placeholder="e.g., Soft Drinks"
                    className="w-full px-3 py-2 text-sm bg-input-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all"
                    disabled={!categoryForSubCategory}
                  />
                  <button
                    onClick={handleAddSubCategory}
                    disabled={!categoryForSubCategory || !newSubCategory.trim()}
                    className="w-full bg-gradient-to-r from-primary to-secondary text-white py-2 text-sm rounded-lg hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    Add Subcategory
                  </button>
                </div>
              </div>

              {/* Current Categories Preview */}
              <div className="bg-muted/30 rounded-2xl p-6 max-h-32 overflow-y-auto">
                <h3 className="text-sm font-semibold text-foreground mb-6">Current Categories</h3>
                <div className="space-y-3">
                  {Object.keys(categoryHierarchy).map((cat) => (
                    <div key={cat} className="text-sm">
                      <span className="font-medium text-foreground">{cat}</span>
                      {categoryHierarchy[cat].length > 0 && (
                        <span className="text-muted-foreground ml-1">
                          ({categoryHierarchy[cat].length} subcategories)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border">
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setNewMainCategory("");
                  setNewSubCategory("");
                  setCategoryForSubCategory("");
                }}
                className="w-full bg-muted text-foreground py-3 text-sm rounded-xl hover:bg-muted/80 transition-all duration-200 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
