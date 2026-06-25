import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Sidebar } from '../../shared/components/Sidebar';
import { Page, type StoreBrand } from '../../shared/App';
import type { StaffType, StoreType } from '../../auth/types/auth';
import { Banknote, Building2, Minus, Plus, Search, Edit2, Trash2, X, AlertCircle, Printer, Download, Users, Smartphone, Wallet, MoreVertical } from 'lucide-react';
import { useOrders, type Order } from '../../shared/context/OrderContext';
import { useTables } from '../../shared/context/TableContext';
import { useStoreSettings } from '../../shared/context/StoreSettingsContext';
import { ThermalReceipt } from '../../shared/components/ThermalReceipt';
import { DeleteConfirmDialog } from '../../shared/components/DeleteConfirmDialog';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { getLocalDateKey } from '../../shared/utils/date';
import { useCompletePaymentMutation, usePosIngredientsQuery, usePosMenuQuery, useProductRecipeQuery } from '../../features/pos/hooks/usePosMenuQuery';

interface CreateOrderProps {
  currentUser: AuthenticatedUser | null;
  onNavigate: (page: Page) => void;
  onOrderCreated: (order: any) => void;
  onLogout: () => void;
  storeBrand?: StoreBrand;
  userName?: string | null;
  storeType?: StoreType;
  staffType?: StaffType;
}

interface Ingredient {
  id?: number;
  itemId?: string;
  inventory_item_id?: string;
  ingredient_id?: number;
  product_ingredient_id?: number;
  original_quantity?: number;
  name: string;
  quantity: number;
  unit: string;
  is_removable?: boolean;
  replacement_ingredient_id?: number;
  replacement_name?: string;
  additional_price?: number;
  customization_type?: 'REMOVE' | 'ADD' | 'CHANGE_QUANTITY' | 'REPLACE';
  notes?: string;
  removed?: boolean;
  alternatives?: any[];
}

interface Modifier {
  id: string;
  name: string;
  group?: string;
  type: 'remove' | 'note';
  itemId?: string;
  itemName?: string;
  quantityAvailable?: number | null;
  unit?: string;
  stockStatus?: 'available' | 'unavailable' | 'untracked';
  requiresStock?: boolean;
  priceDelta?: number;
  priceDeltaPercent?: number;
}

interface MenuProduct {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  categoryName?: string;
  image: string;
  availableQuantity?: number;
  servings?: number;
  prepTimeMinutes?: number;
  ingredients: Ingredient[];
  modifiers: Modifier[];
}

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  image: string;
  prepTimeMinutes?: number;
  customizationPrepMinutes?: number;
  orderType: 'dine-in' | 'takeout';
  notes: string;
  ingredients: Ingredient[];
  originalIngredients: Ingredient[];
  modifiers?: Modifier[];
  selectedModifierIds?: string[];
}

// Customer history is now derived from actual orders
const finiteNumberOrUndefined = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const finiteNumberIncludingZeroOrUndefined = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function toOrderListFormat(order: any, paid: boolean) {
  const hasDineIn = order.items.some((i: CartItem) => i.orderType === 'dine-in');
  const hasTakeout = order.items.some((i: CartItem) => i.orderType === 'takeout');
  const type: 'Dine-In' | 'Takeout' | 'Mixed' =
    hasDineIn && hasTakeout ? 'Mixed' : hasDineIn ? 'Dine-In' : 'Takeout';
  const now: Date = order.timestamp instanceof Date ? order.timestamp : new Date();
  const discountTypeLabel =
    order.discountType === 'senior' ? 'Senior Citizen' :
    order.discountType === 'pwd' ? 'PWD' :
    order.discountType === 'promo' ? 'Promo Discount' :
    order.discountType === 'custom' ? 'Custom Discount' : order.discountType;
  const tableLabel = order.tableNumber
    ? `Table ${order.tableNumber}`
    : Array.isArray(order.tableNumbers) && order.tableNumbers.length > 0
    ? order.tableNumbers.map((tableNumber: number) => `Table ${tableNumber}`).join(' + ')
    : order.isQueued ? 'Queue' : '—';

  return {
    orderNumber: order.orderNumber,
    customer: order.customerName,
    type,
    amountNumber: order.total,
    subtotal: order.subtotal,
    serviceFee: order.serviceFee,
    tax: order.tax,
    discount: order.discount,
    discountType: discountTypeLabel,
    paymentStatus: paid ? 'Paid' as const : 'Not Paid' as const,
    orderStatus: 'Pending' as const,
    date: getLocalDateKey(now),
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    cashier: order.cashier,
    items: order.items.map((item: CartItem) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      lineTotal: (item.price * item.quantity) + item.ingredients.reduce((sum, ingredient) => sum + Number(ingredient.additional_price ?? 0), 0) * item.quantity,
      image: item.image,
      itemType: item.orderType,
      notes: item.notes,
      ingredients: item.ingredients,
      prepTimeMinutes: item.prepTimeMinutes,
      customizationPrepMinutes: item.customizationPrepMinutes,
    })),
    isQueued: order.isQueued || false,
    queuePosition: order.queuePosition,
    partySize: order.partySize,
    tableNumbers: order.tableNumbers,
    table: tableLabel,
    estimatedPrepMinutes: order.estimatedPrepMinutes,
    estimatedReadyAt: order.estimatedReadyAt,
  };
}

export function CreateOrder({ currentUser, onNavigate, onOrderCreated, onLogout, storeBrand, userName, storeType, staffType }: CreateOrderProps) {
  const { addOrder, orders, queuedOrders, reloadOrders } = useOrders();
  const { tables } = useTables();
  const { settings, discounts } = useStoreSettings();
  const posMenuQuery = usePosMenuQuery(currentUser?.id);
  const posIngredientsQuery = usePosIngredientsQuery(currentUser?.id);
  const completePaymentMutation = useCompletePaymentMutation();
  const tableManagementEnabled = settings.enable_table_management;
  const customerRecommendationEnabled = settings.enable_customer_recommendation;
  const discountEnabled = settings.enable_discount;
  const enabledDiscounts = discounts.filter((discount) => discount.is_enabled);
  const orderNumberRef = useRef(100001); // Start from 100001
  const [currentOrderNumber, setCurrentOrderNumber] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [hasHistory, setHasHistory] = useState(false);
  const [recommendedProducts, setRecommendedProducts] = useState<MenuProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [deletingCartItem, setDeletingCartItem] = useState<{ index: number; name: string } | null>(null);
  const [deletingIngredient, setDeletingIngredient] = useState<{ index: number; name: string } | null>(null);
  const [diningOption, setDiningOption] = useState<'' | 'dine-in' | 'takeout'>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [customizeItemIndex, setCustomizeItemIndex] = useState<number | null>(null);
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [addIngredientName, setAddIngredientName] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showTakeoutMode, setShowTakeoutMode] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [showSuccess, setShowSuccess] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);
  const [changeAmount, setChangeAmount] = useState(0);
  const [successOrderDetails, setSuccessOrderDetails] = useState<any>(null);
  const [showTableSelection, setShowTableSelection] = useState(false);
  const [selectedTableNumber, setSelectedTableNumber] = useState<string | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [partySize, setPartySize] = useState<string>('');
  const [discountType, setDiscountType] = useState<string>('none');
  const [customDiscountPercent, setCustomDiscountPercent] = useState<number>(0);
  const [discountIdNumber, setDiscountIdNumber] = useState<string>('');
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountModalError, setDiscountModalError] = useState('');
  const [validationError, setValidationError] = useState<string>('');
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isInQueue, setIsInQueue] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [hoveredProductId, setHoveredProductId] = useState<number | null>(null);
  const customizeProductId = customizeItemIndex !== null ? cart[customizeItemIndex]?.id : null;
  const productRecipeQuery = useProductRecipeQuery(currentUser?.id, customizeProductId);
  const hoveredProductRecipeQuery = useProductRecipeQuery(currentUser?.id, hoveredProductId);
  const enabledPaymentMethods = settings.enabled_payment_methods.length > 0 ? settings.enabled_payment_methods : ['Cash'];
  const selectedPaymentAccount = settings.payment_method_accounts[paymentMethod];
  const posProducts = useMemo<MenuProduct[]>(() => {
    return (posMenuQuery.data ?? []).map((product: any) => ({
      id: Number(product.id),
      name: product.name,
      description: product.description ?? '',
      price: Number(product.price ?? 0),
      category: product.category_name ?? 'Uncategorized',
      categoryName: product.category_name ?? null,
      image: product.image_url || storeBrand?.logo || '',
      availableQuantity: Number(product.available_quantity ?? 0),
      servings: finiteNumberIncludingZeroOrUndefined(product.servings),
      prepTimeMinutes: finiteNumberIncludingZeroOrUndefined(product.prep_time_minutes),
      ingredients: (product.ingredients ?? []).map((ingredient: any) => ({
        id: finiteNumberOrUndefined(ingredient.id) ?? finiteNumberOrUndefined(ingredient.product_ingredient_id) ?? finiteNumberOrUndefined(ingredient.ingredient_id) ?? 0,
        itemId: ingredient.inventory_item_id ?? ingredient.itemId,
        inventory_item_id: ingredient.inventory_item_id,
        product_ingredient_id: finiteNumberOrUndefined(ingredient.product_ingredient_id ?? ingredient.id),
        ingredient_id: finiteNumberOrUndefined(ingredient.ingredient_id),
        name: ingredient.name,
        quantity: Number(ingredient.quantity ?? 0),
        original_quantity: Number(ingredient.quantity ?? 0),
        unit: ingredient.unit,
        is_removable: ingredient.is_removable,
        alternatives: ingredient.alternatives ?? [],
      })),
      modifiers: Array.isArray(product.modifiers) && product.modifiers.length > 0
        ? product.modifiers.map((modifier: any): Modifier => ({
            id: String(modifier.id),
            name: String(modifier.name),
            group: String(modifier.group ?? 'Modifiers'),
            type: modifier.type === 'note' ? 'note' : 'remove',
            itemId: modifier.itemId,
            itemName: modifier.itemName,
            quantityAvailable: modifier.quantityAvailable,
            unit: modifier.unit,
            stockStatus: modifier.stockStatus,
            requiresStock: modifier.requiresStock,
            priceDelta: Number(modifier.priceDelta ?? 0),
            priceDeltaPercent: Number(modifier.priceDeltaPercent ?? 0),
          }))
        : [],
    }));
  }, [posMenuQuery.data, storeBrand?.logo]);
  const dynamicMenuCategories = useMemo(
    () => [
      { id: 'all', name: 'All' },
      ...Array.from(new Set(posProducts.map((product) => product.category))).map((category) => ({ id: category, name: category })),
    ],
    [posProducts],
  );

  useEffect(() => {
    const highestOrderNumber = orders.reduce((highest, order) => {
      const match = String(order.orderNumber ?? order.id ?? '').match(/(\d+)$/);
      const numericOrder = match ? Number(match[1]) : 0;
      return Number.isFinite(numericOrder) ? Math.max(highest, numericOrder) : highest;
    }, 100000);

    orderNumberRef.current = Math.max(orderNumberRef.current, highestOrderNumber + 1);
  }, [orders]);

  useEffect(() => {
    const loadNextOrderNumber = async () => {
      if (!currentUser?.id) return;

      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/pos/next-order-number?user_id=${currentUser.id}`);
        const data = await response.json();
        const nextOrderNumber = Number(data?.order_number);

        if (response.ok && Number.isFinite(nextOrderNumber)) {
          orderNumberRef.current = Math.max(orderNumberRef.current, nextOrderNumber);
        }
      } catch {
        // Existing order history still seeds a reasonable local preview number.
      }
    };

    void loadNextOrderNumber();
  }, [currentUser?.id]);

  useEffect(() => {
    const ingredients = Array.isArray((productRecipeQuery.data as any)?.ingredients)
      ? (productRecipeQuery.data as any).ingredients
      : [];
    const modifiers = Array.isArray((productRecipeQuery.data as any)?.modifiers)
      ? (productRecipeQuery.data as any).modifiers
      : [];

    if (customizeItemIndex === null || (ingredients.length === 0 && modifiers.length === 0)) return;

    setCart((items) => items.map((item, index) => {
      if (index !== customizeItemIndex) return item;

      const currentByIngredientId = new Map(
        item.ingredients.map((ingredient) => [Number(ingredient.ingredient_id ?? ingredient.replacement_ingredient_id ?? ingredient.id), ingredient]),
      );
      const nextIngredients = ingredients.map((ingredient: any) => {
        const ingredientId = Number(ingredient.ingredient_id);
        const current = currentByIngredientId.get(ingredientId);
        return current ?? {
          id: finiteNumberOrUndefined(ingredient.id) ?? finiteNumberOrUndefined(ingredient.product_ingredient_id) ?? finiteNumberOrUndefined(ingredient.ingredient_id) ?? 0,
          itemId: ingredient.inventory_item_id ?? ingredient.itemId,
          inventory_item_id: ingredient.inventory_item_id,
          product_ingredient_id: finiteNumberOrUndefined(ingredient.product_ingredient_id ?? ingredient.id),
          ingredient_id: finiteNumberOrUndefined(ingredientId),
          name: ingredient.name,
          quantity: Number(ingredient.quantity ?? 0),
          original_quantity: Number(ingredient.quantity ?? 0),
          unit: ingredient.unit,
          is_removable: ingredient.is_removable,
          alternatives: ingredient.alternatives ?? [],
        };
      });

      return {
        ...item,
        ingredients: nextIngredients.length > 0
          ? [...nextIngredients, ...item.ingredients.filter((ingredient) => ingredient.customization_type === 'ADD')]
          : item.ingredients,
        originalIngredients: nextIngredients.length > 0 ? nextIngredients : item.originalIngredients,
        modifiers: modifiers.length > 0
          ? modifiers.map((modifier: any): Modifier => ({
              id: String(modifier.id),
              name: String(modifier.name),
              group: String(modifier.group ?? 'Modifiers'),
              type: modifier.type === 'note' ? 'note' : 'remove',
              itemId: modifier.itemId,
              itemName: modifier.itemName,
              quantityAvailable: modifier.quantityAvailable,
              unit: modifier.unit,
              stockStatus: modifier.stockStatus,
              requiresStock: modifier.requiresStock,
              priceDelta: Number(modifier.priceDelta ?? 0),
              priceDeltaPercent: Number(modifier.priceDeltaPercent ?? 0),
            }))
          : item.modifiers,
      };
    }));
  }, [customizeItemIndex, productRecipeQuery.data]);

  // Autocomplete for customer name
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const customerInputRef = useRef<HTMLDivElement>(null);

  // Autocomplete: Get unique customer names and filter based on input
  useEffect(() => {
    if (!customerRecommendationEnabled || !customerName.trim()) {
      setShowCustomerSuggestions(false);
      setCustomerSuggestions([]);
      return;
    }

    // Get unique customer names from orders
    const uniqueCustomers = Array.from(new Set(
      orders.map(order => order.customer)
    ));

    // Filter based on input (case-insensitive)
    const filtered = uniqueCustomers.filter(name =>
      name.toLowerCase().includes(customerName.toLowerCase())
    );

    // Only show suggestions if there are matches and input is not exact match
    const exactMatch = filtered.some(name => name.toLowerCase() === customerName.toLowerCase());

    if (filtered.length > 0 && !exactMatch) {
      setCustomerSuggestions(filtered.slice(0, 5)); // Limit to 5 suggestions
      setShowCustomerSuggestions(true);
    } else {
      setShowCustomerSuggestions(false);
      setCustomerSuggestions([]);
    }

    setSelectedSuggestionIndex(-1);
  }, [customerName, orders, customerRecommendationEnabled]);

  // Close suggestions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerInputRef.current && !customerInputRef.current.contains(event.target as Node)) {
        setShowCustomerSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle customer suggestion selection
  const handleSelectCustomer = (name: string) => {
    setCustomerName(name);
    setShowCustomerSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  // Handle keyboard navigation in customer suggestions
  const handleCustomerKeyDown = (e: React.KeyboardEvent) => {
    if (!showCustomerSuggestions || customerSuggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev =>
          prev < customerSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          handleSelectCustomer(customerSuggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowCustomerSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  // Auto-check customer history from actual orders
  useEffect(() => {
    if (!customerRecommendationEnabled || !customerName.trim()) {
      setHasHistory(false);
      setRecommendedProducts([]);
      return;
    }

    const nameLower = customerName.toLowerCase();
    console.log('Checking history for:', nameLower);

    // Find all past orders for this customer
    const customerOrders = orders.filter(order =>
      order.customer.toLowerCase() === nameLower
    );

    console.log('Found customer orders:', customerOrders.length);

    if (customerOrders.length > 0) {
      setHasHistory(true);

      // Count frequency of each item ordered
      const itemFrequency: Record<string, number> = {};
      customerOrders.forEach(order => {
        order.items.forEach(item => {
          itemFrequency[item.name] = (itemFrequency[item.name] || 0) + item.quantity;
        });
      });

      console.log('Item frequency:', itemFrequency);

      // Get top 4 most frequently ordered items
      const topItems = Object.entries(itemFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name]) => name);

      console.log('Top items:', topItems);

      // Find matching products
      const recommended = posProducts.filter(p => topItems.includes(p.name));
      console.log('Recommended products:', recommended.length);
      setRecommendedProducts(recommended);
    } else {
      setHasHistory(false);
      setRecommendedProducts([]);
    }
  }, [customerName, orders, customerRecommendationEnabled, posProducts]);

  const addToCart = (product: MenuProduct, orderType?: 'dine-in' | 'takeout') => {
    const typeToUse = orderType || (diningOption === 'dine-in' || diningOption === 'takeout' ? diningOption : 'dine-in');
    const newItem: CartItem = {
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity: 1,
      prepTimeMinutes: product.prepTimeMinutes ?? 0,
      customizationPrepMinutes: 0,
      orderType: typeToUse,
      notes: '',
      ingredients: JSON.parse(JSON.stringify(product.ingredients)),
      originalIngredients: JSON.parse(JSON.stringify(product.ingredients)),
      modifiers: product.modifiers,
      selectedModifierIds: [],
    };

    setCart((items) => [...items, newItem]);
  };

  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      setCart(cart.filter((_, i) => i !== index));
    } else {
      setCart(cart.map((item, i) =>
        i === index ? { ...item, quantity: newQuantity } : item
      ));
    }
  };

  const updateNotes = (index: number, notes: string) => {
    setCart(cart.map((item, i) =>
      i === index ? { ...item, notes } : item
    ));
  };

  const toggleModifier = (index: number, modifierId: string) => {
    setCart(cart.map((item, i) => {
      if (i !== index) return item;
      const modifier = (item.modifiers ?? []).find((option) => option.id === modifierId);
      if (modifier?.stockStatus === 'unavailable') return item;
      const selectedModifierIds = item.selectedModifierIds ?? [];
      const selected = selectedModifierIds.includes(modifierId);
      return {
        ...item,
        selectedModifierIds: selected
          ? selectedModifierIds.filter((id) => id !== modifierId)
          : [...selectedModifierIds, modifierId],
      };
    }));
  };

  const updateIngredientQuantity = (index: number, ingredientName: string, newQuantity: number) => {
    setCart(cart.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          ingredients: item.ingredients.map(ing =>
            ing.name === ingredientName
              ? {
                  ...ing,
                  quantity: Math.max(0, newQuantity),
                  removed: newQuantity <= 0,
                  customization_type: newQuantity <= 0 ? 'REMOVE' : 'CHANGE_QUANTITY',
                }
              : ing
          )
        };
      }
      return item;
    }));
  };

  const replaceIngredient = (index: number, ingredientName: string, alternativeId: string) => {
    setCart(cart.map((item, i) => {
      if (i !== index) return item;

      return {
        ...item,
        ingredients: item.ingredients.map((ing) => {
          if (ing.name !== ingredientName) return ing;

          if (!alternativeId) {
            return {
              ...ing,
              replacement_ingredient_id: undefined,
              replacement_name: undefined,
              additional_price: 0,
              customization_type: ing.quantity !== ing.original_quantity ? 'CHANGE_QUANTITY' : undefined,
            };
          }

          const alternative = ing.alternatives?.find((item) => String(item.alternative_ingredient_id) === alternativeId);
          return {
            ...ing,
            replacement_ingredient_id: Number(alternativeId),
            replacement_name: alternative?.ingredient_name ?? 'Alternative',
            additional_price: Number(alternative?.additional_price ?? 0),
            customization_type: 'REPLACE',
          };
        }),
      };
    }));
  };

  const addIngredient = (index: number) => {
    const name = addIngredientName.trim().toLowerCase();
    const ingredient = (posIngredientsQuery.data ?? []).find((item) => item.name.toLowerCase() === name);
    if (!ingredient) return;

    setCart(cart.map((item, i) => {
      if (i !== index || item.ingredients.some((ing) => Number(ing.ingredient_id ?? ing.replacement_ingredient_id) === Number(ingredient.id))) {
        return item;
      }

      return {
        ...item,
        ingredients: [
          ...item.ingredients,
          {
            name: ingredient.name,
            quantity: 1,
            original_quantity: 0,
            unit: ingredient.unit ?? 'pcs',
            replacement_ingredient_id: Number(ingredient.id),
            replacement_name: ingredient.name,
            additional_price: 0,
            customization_type: 'ADD',
          },
        ],
      };
    }));
    setAddIngredientName('');
    setShowAddIngredient(false);
  };

  const deleteIngredient = (index: number, ingredientName: string) => {
    setCart(cart.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          ingredients: item.ingredients
            .filter((ing) => !(ing.name === ingredientName && ing.customization_type === 'ADD'))
            .map(ing =>
              ing.name === ingredientName ? { ...ing, quantity: 0, removed: true, customization_type: 'REMOVE' } : ing
            )
        };
      }
      return item;
    }));
    setDeletingIngredient(null);
  };

  const removeItem = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
    if (customizeItemIndex === index) {
      setCustomizeItemIndex(null);
    }
    setDeletingCartItem(null);
  };

  const filteredProducts = posProducts.filter(p => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const modifierPrice = (item: CartItem) => (item.modifiers ?? [])
    .filter((modifier) => (item.selectedModifierIds ?? []).includes(modifier.id))
    .reduce((sum, modifier) => sum + Number(modifier.priceDelta ?? 0) + (item.price * (Number(modifier.priceDeltaPercent ?? 0) / 100)), 0);
  const formatModifierPrice = (modifier: Modifier) => {
    if (modifier.priceDeltaPercent) return `${modifier.priceDeltaPercent > 0 ? '+' : ''}${modifier.priceDeltaPercent}%`;
    if (modifier.priceDelta) return `${modifier.priceDelta > 0 ? '+' : '-'}₱${Math.abs(modifier.priceDelta)}`;
    return '';
  };
  const itemAdditionalCost = (item: CartItem) => (item.ingredients.reduce((sum, ingredient) => sum + Number(ingredient.additional_price ?? 0), 0) + modifierPrice(item)) * item.quantity;
  const itemLineTotal = (item: CartItem) => (item.price * item.quantity) + itemAdditionalCost(item);
  function applySelectedModifiers(item: CartItem) {
    const selectedModifierIds = item.selectedModifierIds ?? [];
    const selectedRemoveModifiers = (item.modifiers ?? []).filter((modifier) =>
      modifier.type === 'remove' && selectedModifierIds.includes(modifier.id)
    );

    return item.ingredients.map((ingredient): Ingredient => {
      const removeModifier = selectedRemoveModifiers.find((modifier) =>
        (modifier.itemId && modifier.itemId === (ingredient.itemId ?? ingredient.inventory_item_id)) ||
        (modifier.itemName && modifier.itemName === ingredient.name)
      );

      if (!removeModifier) return ingredient;

      return /^less\b/i.test(removeModifier.name)
        ? { ...ingredient, quantity: Number(ingredient.quantity ?? 0) / 2, customization_type: 'CHANGE_QUANTITY', notes: removeModifier.name }
        : { ...ingredient, quantity: 0, removed: true, customization_type: 'REMOVE', notes: removeModifier.name };
    });
  }

  const getIngredientChanges = (item: CartItem) => {
    const selectedIngredients = applySelectedModifiers(item);
    const changedIngredients = selectedIngredients.filter((ingredient) => {
      const original = item.originalIngredients.find((originalIngredient) => originalIngredient.name === ingredient.name);
      return (
        ingredient.removed ||
        ingredient.customization_type === 'ADD' ||
        ingredient.replacement_name ||
        !original ||
        Number(ingredient.quantity) !== Number(original.quantity)
      );
    });

    return {
      addedIngredients: changedIngredients.filter((ingredient) => ingredient.customization_type === 'ADD' && !ingredient.removed),
      removedIngredients: changedIngredients.filter((ingredient) => ingredient.removed || Number(ingredient.quantity) <= 0),
      replacedIngredients: changedIngredients.filter((ingredient) => ingredient.customization_type !== 'ADD' && ingredient.replacement_name && !ingredient.removed),
      quantityChanges: changedIngredients.filter((ingredient) => {
        const original = item.originalIngredients.find((originalIngredient) => originalIngredient.name === ingredient.name);
        return original && !ingredient.removed && !ingredient.replacement_name && Number(ingredient.quantity) !== Number(original.quantity);
      }),
      selectedModifiers: (item.modifiers ?? []).filter((modifier) => (item.selectedModifierIds ?? []).includes(modifier.id)),
    };
  };
  const hasItemCustomization = (item: CartItem) => {
    const { addedIngredients, removedIngredients, replacedIngredients, quantityChanges, selectedModifiers } = getIngredientChanges(item);
    return Boolean(item.notes?.trim()) ||
      selectedModifiers.length > 0 ||
      addedIngredients.length > 0 ||
      removedIngredients.length > 0 ||
      replacedIngredients.length > 0 ||
      quantityChanges.length > 0;
  };
  const estimateItemMinutes = (item: CartItem) => {
    const baseMinutes = Math.max(0, Number(item.prepTimeMinutes ?? 0));
    const customizationMinutes = hasItemCustomization(item)
      ? Math.max(0, Number(settings.customization_prep_time_minutes ?? 0))
      : 0;
    const lineMinutes = baseMinutes + customizationMinutes;
    return settings.prep_time_strategy === 'sequential'
      ? lineMinutes * Math.max(1, Number(item.quantity ?? 1))
      : lineMinutes;
  };
  const cartPrepMinutes = settings.prep_time_strategy === 'sequential'
    ? cart.reduce((sum, item) => sum + estimateItemMinutes(item), 0)
    : cart.reduce((max, item) => Math.max(max, estimateItemMinutes(item)), 0);
  const estimateExistingOrderMinutes = (order: Order) => {
    const itemMinutes = order.items.map((item) => {
      const baseMinutes = Math.max(0, Number(item.prepTimeMinutes ?? 0));
      const customizationMinutes = Math.max(0, Number(item.customizationPrepMinutes ?? 0));
      const lineMinutes = baseMinutes + customizationMinutes;
      const quantity = Math.max(1, Number(item.quantity ?? 1));
      return lineMinutes > 0
        ? settings.prep_time_strategy === 'sequential' ? lineMinutes * quantity : lineMinutes
        : 5 * quantity;
    });
    if (itemMinutes.length === 0) return 0;
    return settings.prep_time_strategy === 'sequential'
      ? itemMinutes.reduce((sum, minutes) => sum + minutes, 0)
      : Math.max(0, ...itemMinutes);
  };
  const remainingEstimateMinutes = (order: Order) => {
    if (!['Pending', 'Preparing'].includes(order.orderStatus)) return 0;
    const estimate = estimateExistingOrderMinutes(order);
    if (!Number.isFinite(estimate) || estimate <= 0) return 0;
    return Math.max(0, estimate - Math.max(0, order.runningTimeMinutes ?? 0));
  };
  const activeKitchenWorkloadMinutes = settings.enable_estimated_prep_time
    ? orders
        .reduce((sum, order) => sum + remainingEstimateMinutes(order), 0)
    : 0;
  const estimatedWaitingMinutes = settings.enable_estimated_prep_time
    ? Math.max(0, Math.ceil(cartPrepMinutes + activeKitchenWorkloadMinutes))
    : 0;
  const estimatedReadyAt = settings.enable_estimated_prep_time && estimatedWaitingMinutes > 0
    ? new Date(Date.now() + estimatedWaitingMinutes * 60000)
    : null;
  const estimatedReadyTimeLabel = estimatedReadyAt
    ? estimatedReadyAt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
    : '';
  const subtotal = cart.reduce((sum, item) => sum + itemLineTotal(item), 0);
  const serviceFee = settings.enable_service_charge ? subtotal * (settings.service_charge_rate / 100) : 0;
  const tax = 0;
  const selectedDiscount = enabledDiscounts.find((item) => String(item.id) === discountType);
  const selectedDiscountName = selectedDiscount?.discount_name ?? '';
  const selectedDiscountRate = selectedDiscount ? Number(selectedDiscount.discount_rate) : 0;
  const selectedDiscountNeedsId = /pwd|senior/i.test(selectedDiscountName);

  // Calculate discount based on type
  const discountRate = discountEnabled && selectedDiscount ? selectedDiscountRate / 100 : 0;
  const discount = subtotal * discountRate;

  const total = subtotal + serviceFee - discount;
  const getOrderTypeForPayload = (items: CartItem[]) => {
    const hasDineIn = items.some(item => item.orderType === 'dine-in');
    const hasTakeout = items.some(item => item.orderType === 'takeout');
    return hasDineIn && hasTakeout ? 'MIXED' : hasDineIn ? 'DINE_IN' : 'TAKEOUT';
  };
  const serializeIngredientForOrder = (ingredient: Ingredient) => ({
    id: ingredient.id,
    itemId: ingredient.itemId ?? ingredient.inventory_item_id,
    ingredient_id: finiteNumberOrUndefined(ingredient.ingredient_id),
    product_ingredient_id: finiteNumberOrUndefined(ingredient.product_ingredient_id),
    original_quantity: ingredient.original_quantity,
    name: ingredient.name,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    replacement_ingredient_id: finiteNumberOrUndefined(ingredient.replacement_ingredient_id),
    replacement_name: ingredient.replacement_name,
    additional_price: ingredient.additional_price,
    customization_type: ingredient.customization_type,
    removed: ingredient.removed,
    notes: ingredient.notes,
  });
  const serializeItemForOrder = (item: CartItem) => ({
    id: item.id,
    productId: item.id,
    name: item.name,
    categoryName: posProducts.find((product) => product.id === item.id)?.categoryName ?? null,
    price: item.price,
    quantity: item.quantity,
    lineTotal: itemLineTotal(item),
    orderType: item.orderType,
    notes: item.notes,
    modifiers: (item.modifiers ?? []).filter((modifier) => (item.selectedModifierIds ?? []).includes(modifier.id)),
    ingredients: applySelectedModifiers(item).map(serializeIngredientForOrder),
    prepTimeMinutes: item.prepTimeMinutes ?? 0,
    customizationPrepMinutes: hasItemCustomization(item) ? settings.customization_prep_time_minutes : 0,
  });

  const persistRestaurantOrder = async (
    orderDetails: any,
    paid: boolean,
    payment?: { amountPaid: number; changeAmount: number; method: string },
  ) => {
    if (!currentUser?.id) return null;

    return completePaymentMutation.mutateAsync({
      user_id: currentUser.id,
      orderNumber: orderDetails.orderNumber,
      customerName: orderDetails.customerName || null,
      orderType: getOrderTypeForPayload(orderDetails.items),
      tableName: orderDetails.tableNumber
        ? `Table ${orderDetails.tableNumber}`
        : Array.isArray(orderDetails.tableNumbers) && orderDetails.tableNumbers.length > 0
        ? orderDetails.tableNumbers.map((tableNumber: number) => `Table ${tableNumber}`).join(' + ')
        : orderDetails.isQueued
        ? `Queue #${orderDetails.queuePosition || 1}`
        : null,
      partySize: orderDetails.partySize ?? null,
      subtotal: orderDetails.subtotal,
      discount: orderDetails.discount,
      discountType: orderDetails.discountType ?? null,
      serviceFee: orderDetails.serviceFee,
      tax: orderDetails.tax,
      total: orderDetails.total,
      estimatedPrepMinutes: orderDetails.estimatedPrepMinutes ?? null,
      estimatedReadyAt: orderDetails.estimatedReadyAt ?? null,
      orderStatus: 'PENDING',
      paymentStatus: paid ? 'PAID' : 'NOT_PAID',
      items: orderDetails.items.map(serializeItemForOrder),
      payment: paid && payment ? {
        paymentNumber: `PAY-${orderDetails.orderNumber}`,
        method: payment.method,
        amountPaid: payment.amountPaid,
        changeAmount: payment.changeAmount,
      } : undefined,
    });
  };

  const validateOrder = (): boolean => {
    if (!diningOption) {
      setValidationError('Please select a dining option.');
      return false;
    }
    if (cart.length === 0) {
      setValidationError('Cart is empty.');
      return false;
    }

    if (selectedDiscountNeedsId && !discountIdNumber.trim()) {
      setValidationError(`Please enter the ID number for ${selectedDiscountName}.`);
      return false;
    }

    // Only validate party size and table for dine-in orders
    const hasDineIn = tableManagementEnabled && cart.some(item => item.orderType === 'dine-in');
    if (hasDineIn) {
      if (!partySize || parseInt(partySize) < 1) {
        setValidationError('Please enter the number of customers.');
        return false;
      }
      if (selectedTables.length === 0 && !isInQueue) {
        setValidationError('Please select a table or join the queue.');
        return false;
      }
    }

    setValidationError('');
    return true;
  };

  const handlePreviewOrder = () => {
    if (validateOrder()) {
      // Generate order number when opening preview
      const orderNum = String(orderNumberRef.current).padStart(6, '0');
      setCurrentOrderNumber(orderNum);
      setShowPreview(true);
    }
  };

  const handleConfirmOrder = () => {
    console.log('Confirm Order clicked'); // Debug log

    const hasDineIn = cart.some(item => item.orderType === 'dine-in');
    const hasTakeout = cart.some(item => item.orderType === 'takeout');

    const order = {
      orderNumber: currentOrderNumber,
      customerName: customerName.trim(),
      items: cart,
      subtotal,
      discount,
      discountType: selectedDiscountName || undefined,
      serviceFee,
      tax,
      total,
      timestamp: new Date(),
      paid: false,
      cashier: userName || 'Staff',
      tableNumber: selectedTables.length === 1 ? selectedTables[0] : null,
      tableNumbers: selectedTables.length > 0 ? selectedTables : undefined,
      partySize: parseInt(partySize) || undefined,
      isQueued: isInQueue,
      queuePosition,
      estimatedPrepMinutes: settings.enable_estimated_prep_time ? estimatedWaitingMinutes : undefined,
      estimatedReadyAt: estimatedReadyAt?.toISOString(),
    };

    console.log('Order data:', order); // Debug log

    // Increment order number for next order
    orderNumberRef.current += 1;

    // Close preview first
    setShowPreview(false);

    // Small delay to ensure state updates properly
    setTimeout(() => {
      const shouldPayDirectly = !tableManagementEnabled || !hasDineIn;

      if (shouldPayDirectly) {
        setSuccessOrderDetails(order);
        setPaymentMethod(enabledPaymentMethods[0] ?? 'Cash');
        setShowPayment(true);
      } else if (hasDineIn) {
        setSuccessOrderDetails(order);
        setShowPaymentChoice(true);
      }
    }, 100);
  };

  const handlePayLater = async () => {
    if (isPaymentSubmitting) return;
    if (!successOrderDetails) return;

    setIsPaymentSubmitting(true);
    try {
      const savedOrder = await persistRestaurantOrder(successOrderDetails, false);
      const savedOrderDetails = { ...successOrderDetails, orderNumber: savedOrder?.order_number ?? successOrderDetails.orderNumber };
      const savedOrderNumber = Number(savedOrderDetails.orderNumber);
      if (Number.isFinite(savedOrderNumber)) {
        orderNumberRef.current = Math.max(orderNumberRef.current, savedOrderNumber + 1);
      }
      const orderForList = toOrderListFormat(savedOrderDetails, false);
      if (savedOrderDetails.isQueued && savedOrderDetails.queuePosition) {
        addOrder({ ...orderForList, isQueued: true, queuePosition: savedOrderDetails.queuePosition });
      } else {
        addOrder(orderForList);
      }
      await reloadOrders();
      onOrderCreated(savedOrderDetails);
      setSuccessOrderDetails(savedOrderDetails);
      setShowPaymentChoice(false);
      setShowSuccess(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to save order.');
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  const handlePaymentSubmit = async () => {
    if (isPaymentSubmitting) return;

    const amountPaid = paymentMethod === 'Cash' ? Number(cashAmount) : total;
    if (paymentMethod === 'Cash' && (!Number.isFinite(amountPaid) || amountPaid < total)) {
      return;
    }

    setIsPaymentSubmitting(true);
    const change = paymentMethod === 'Cash' ? amountPaid - total : 0;
    setChangeAmount(change);
    try {
      if (successOrderDetails) {
        const paidOrder = { ...successOrderDetails, paid: true, cashReceived: amountPaid, changeGiven: change };
        try {
          const savedOrder = await persistRestaurantOrder(paidOrder, true, { amountPaid, changeAmount: change, method: paymentMethod });
          paidOrder.orderNumber = savedOrder?.order_number ?? paidOrder.orderNumber;
          const savedOrderNumber = Number(paidOrder.orderNumber);
          if (Number.isFinite(savedOrderNumber)) {
            orderNumberRef.current = Math.max(orderNumberRef.current, savedOrderNumber + 1);
          }
          setCurrentOrderNumber(paidOrder.orderNumber);
        } catch (error) {
          alert(error instanceof Error ? error.message : 'Unable to complete order.');
          return;
        }
        addOrder({ ...toOrderListFormat(paidOrder, true), cashReceived: amountPaid, changeGiven: change });
        await reloadOrders();
        onOrderCreated(paidOrder);
        setSuccessOrderDetails(paidOrder);
      }
      setCashAmount('');
      setShowPaymentChoice(false);
      setShowPayment(false);
      // Show receipt preview first for takeout orders
      setShowReceiptPreview(true);
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    setSuccessOrderDetails(null);
    setChangeAmount(0);
    setCart([]);
    setCustomerName('');
    setDiningOption('');
    setSelectedTableNumber(null);
    setSelectedTables([]);
    setPartySize('');
    setDiscountType('none');
    setCustomDiscountPercent(0);
    setDiscountIdNumber('');
    setValidationError('');
    setCurrentOrderNumber('');
    setIsInQueue(false);
    setQueuePosition(null);
    setShowPaymentChoice(false);
    setPaymentMethod(enabledPaymentMethods[0] ?? 'Cash');
    setShowReceiptPreview(false);
    onNavigate('create-order');
  };

  const handleTakeTable = () => {
    if (selectedTables.length > 0) {
      const party = parseInt(partySize) || 0;
      const totalCapacity = selectedTables.reduce((sum, tableNum) => {
        const table = tables.find(t => t.number === tableNum);
        return sum + (table?.isShared ? table.availableSeats : table?.seats || 0);
      }, 0);

      if (party > totalCapacity) {
        alert(`Selected tables have ${totalCapacity} seats total, but you need ${party} seats. Please select more tables or reduce party size.`);
        return;
      }

      setShowTableSelection(false);
      setIsInQueue(false);
      setQueuePosition(null);
    }
  };

  const handleAddToQueue = () => {
    if (!partySize || parseInt(partySize) < 1) {
      alert('Please enter the number of customers');
      return;
    }

    const position = queuedOrders.length + 1;
    setQueuePosition(position);
    setIsInQueue(true);
    setShowTableSelection(false);

    // Add to queue with party size info (would be handled by context in full implementation)
    // For now we're just tracking the position
  };

  const getTableTheme = (status: string) => {
    switch (status) {
      case 'available':
        return {
          accent: '#10b981',
          accentSoft: 'rgba(16, 185, 129, 0.16)',
          border: 'rgba(16, 185, 129, 0.7)',
          glow: 'rgba(16, 185, 129, 0.22)',
          frame: '#dce7ec',
          surface: 'linear-gradient(145deg, #f8fafc 0%, #eef4f7 100%)',
        };
      case 'occupied':
        return {
          accent: '#f97316',
          accentSoft: 'rgba(249, 115, 22, 0.16)',
          border: 'rgba(249, 115, 22, 0.7)',
          glow: 'rgba(249, 115, 22, 0.22)',
          frame: '#f7d5bf',
          surface: 'linear-gradient(145deg, #fff9f4 0%, #fff2e8 100%)',
        };
      case 'partially_occupied':
        return {
          accent: '#eab308',
          accentSoft: 'rgba(234, 179, 8, 0.16)',
          border: 'rgba(234, 179, 8, 0.72)',
          glow: 'rgba(234, 179, 8, 0.22)',
          frame: '#f3df8b',
          surface: 'linear-gradient(145deg, #fffdf2 0%, #fef7d2 100%)',
        };
      default:
        return {
          accent: '#6b7280',
          accentSoft: 'rgba(107, 114, 128, 0.18)',
          border: 'rgba(107, 114, 128, 0.72)',
          glow: 'rgba(107, 114, 128, 0.18)',
          frame: '#d8dee5',
          surface: 'linear-gradient(145deg, #fbfbfc 0%, #eef1f4 100%)',
        };
    }
  };

  type ChairSide = 'top' | 'right' | 'bottom' | 'left';

  const getChairLayout = (seats: number, rectangular: boolean) => {
    if (seats <= 1) {
      return [{ side: 'bottom' as ChairSide, offset: 50 }];
    }

    if (seats === 2) {
      return [
        { side: 'left' as ChairSide, offset: 50 },
        { side: 'right' as ChairSide, offset: 50 },
      ];
    }

    if (seats === 3) {
      return [
        { side: 'top' as ChairSide, offset: 50 },
        { side: 'left' as ChairSide, offset: 50 },
        { side: 'right' as ChairSide, offset: 50 },
      ];
    }

    if (seats <= 4) {
      return [
        { side: 'top' as ChairSide, offset: 50 },
        { side: 'right' as ChairSide, offset: 50 },
        { side: 'bottom' as ChairSide, offset: 50 },
        { side: 'left' as ChairSide, offset: 50 },
      ];
    }

    if (rectangular && seats === 5) {
      return [
        { side: 'top' as ChairSide, offset: 24 },
        { side: 'top' as ChairSide, offset: 50 },
        { side: 'top' as ChairSide, offset: 76 },
        { side: 'bottom' as ChairSide, offset: 35 },
        { side: 'bottom' as ChairSide, offset: 65 },
      ];
    }

    if (rectangular && seats === 6) {
      return [
        { side: 'top' as ChairSide, offset: 24 },
        { side: 'top' as ChairSide, offset: 50 },
        { side: 'top' as ChairSide, offset: 76 },
        { side: 'bottom' as ChairSide, offset: 24 },
        { side: 'bottom' as ChairSide, offset: 50 },
        { side: 'bottom' as ChairSide, offset: 76 },
      ];
    }

    if (rectangular && seats === 7) {
      return [
        { side: 'top' as ChairSide, offset: 18 },
        { side: 'top' as ChairSide, offset: 39 },
        { side: 'top' as ChairSide, offset: 61 },
        { side: 'top' as ChairSide, offset: 82 },
        { side: 'bottom' as ChairSide, offset: 24 },
        { side: 'bottom' as ChairSide, offset: 50 },
        { side: 'bottom' as ChairSide, offset: 76 },
      ];
    }

    if (rectangular) {
      return [
        { side: 'top' as ChairSide, offset: 18 },
        { side: 'top' as ChairSide, offset: 39 },
        { side: 'top' as ChairSide, offset: 61 },
        { side: 'top' as ChairSide, offset: 82 },
        { side: 'bottom' as ChairSide, offset: 18 },
        { side: 'bottom' as ChairSide, offset: 39 },
        { side: 'bottom' as ChairSide, offset: 61 },
        { side: 'bottom' as ChairSide, offset: 82 },
      ];
    }

    return [
      { side: 'top' as ChairSide, offset: 24 },
      { side: 'top' as ChairSide, offset: 50 },
      { side: 'top' as ChairSide, offset: 76 },
      { side: 'right' as ChairSide, offset: 50 },
      { side: 'bottom' as ChairSide, offset: 76 },
      { side: 'bottom' as ChairSide, offset: 50 },
      { side: 'bottom' as ChairSide, offset: 24 },
      { side: 'left' as ChairSide, offset: 50 },
    ];
  };

  const getChairStyle = (side: ChairSide, offset: number, rectangular: boolean): CSSProperties => {
    const edgeInset = rectangular ? 16 : 10;
    const sideInset = rectangular ? 12 : 10;

    switch (side) {
      case 'top':
        return {
          left: `${offset}%`,
          top: edgeInset,
          transform: 'translate(-50%, 0) rotate(0deg)',
        };
      case 'right':
        return {
          right: sideInset,
          top: `${offset}%`,
          transform: 'translate(0, -50%) rotate(90deg)',
        };
      case 'bottom':
        return {
          left: `${offset}%`,
          bottom: edgeInset,
          transform: 'translate(-50%, 0) rotate(180deg)',
        };
      case 'left':
        return {
          left: sideInset,
          top: `${offset}%`,
          transform: 'translate(0, -50%) rotate(-90deg)',
        };
      default:
        return {};
    }
  };

  const renderChairIcon = (key: string, side: ChairSide, offset: number, accent: string, rectangular: boolean) => (
    <div
      key={key}
      className="absolute h-10 w-10 drop-shadow-[0_6px_10px_rgba(15,23,42,0.14)]"
      style={getChairStyle(side, offset, rectangular)}
    >
      <svg viewBox="0 0 48 48" className="h-full w-full">
        <path d="M12 13c-3.5 3-5.5 7-5.5 11s2 8 5.5 11" fill="none" stroke="#4b5563" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M36 13c3.5 3 5.5 7 5.5 11s-2 8-5.5 11" fill="none" stroke="#4b5563" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="14" y="10" width="20" height="5" rx="2.5" fill="#525b67" />
        <rect x="12" y="14" width="24" height="21" rx="7" fill="#626c79" />
        <rect x="15" y="17" width="18" height="12" rx="5" fill={accent} opacity="0.9" />
        <rect x="16" y="31" width="16" height="4" rx="2" fill="#d8dee6" />
      </svg>
    </div>
  );

  const tableCanSeat = (table: (typeof tables)[number], party: number) =>
    table.isShared
      ? table.availableSeats >= party
      : table.status === 'available' && table.seats >= party;
  const availableTables = tables.filter(t => tableCanSeat(t, Math.max(1, parseInt(partySize) || 1)));

  const dineInItems = cart.filter(item => item.orderType === 'dine-in');
  const takeoutItems = cart.filter(item => item.orderType === 'takeout');

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentPage="create-order" onNavigate={onNavigate} onLogout={onLogout} storeBrand={storeBrand} userName={userName} storeType={storeType} staffType={staffType} />

      <div className="flex-1 min-w-0 overflow-auto bg-gray-50">
        <div className="p-5">
          <h2 className="text-lg mb-4">Menu</h2>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Products"
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            />
          </div>

          {hasHistory && recommendedProducts.length > 0 && (
            <div className="mb-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 border-2 border-blue-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <p className="text-sm font-medium text-blue-900">
                  ⭐ Recommended for {customerName}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {recommendedProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="bg-white rounded-lg p-3 text-left hover:shadow-lg transition-all border border-blue-200 hover:border-blue-400"
                  >
                    <div className="w-20 h-20 rounded-full overflow-hidden mx-auto mb-2 bg-muted ring-2 ring-blue-300">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <h3 className="text-xs text-center mb-1">{product.name}</h3>
                    <p className="text-xs text-center text-primary">₱ {product.price.toFixed(2)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg p-1 mb-4 inline-flex gap-1">
            {dynamicMenuCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-1.5 rounded-lg text-xs transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredProducts.map(product => {
              const hoveredRecipeDetails =
                product.id === hoveredProductId
                  ? hoveredProductRecipeQuery.data as Record<string, unknown> | undefined
                  : undefined;
              const resolvedPrepTimeMinutes = finiteNumberIncludingZeroOrUndefined(
                hoveredRecipeDetails?.prep_time_minutes ?? hoveredRecipeDetails?.prepTimeMinutes ?? product.prepTimeMinutes,
              );
              const resolvedServings = finiteNumberIncludingZeroOrUndefined(
                hoveredRecipeDetails?.servings ?? product.servings,
              );

              return (
                <button
                key={product.id}
                onClick={() => addToCart(product)}
                onMouseEnter={() => setHoveredProductId(product.id)}
                onMouseLeave={() => setHoveredProductId((current) => (current === product.id ? null : current))}
                onFocus={() => setHoveredProductId(product.id)}
                onBlur={() => setHoveredProductId((current) => (current === product.id ? null : current))}
                disabled={product.availableQuantity !== undefined && product.availableQuantity <= 0}
                className="group relative isolate overflow-visible rounded-2xl text-left transition-transform duration-300 ease-out hover:z-30 hover:-translate-y-3 hover:scale-[1.18] focus-visible:z-30 focus-visible:-translate-y-3 focus-visible:scale-[1.18] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="overflow-hidden rounded-2xl border border-border bg-white p-2.5 shadow-sm transition-all duration-300 ease-out group-hover:border-primary/35 group-hover:shadow-[0_18px_38px_rgba(15,23,42,0.18)] group-focus-visible:border-primary/35 group-focus-visible:shadow-[0_18px_38px_rgba(15,23,42,0.18)]">
                  <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.06] group-focus-visible:scale-[1.06]"
                  />
                </div>
                <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-foreground">{product.name}</h3>
                <p className="text-xs text-primary font-medium">₱ {product.price.toFixed(2)}</p>
                </div>
                <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 w-[118%] max-w-[280px] -translate-x-1/2 -translate-y-1/2 opacity-0 transition-all duration-300 ease-out group-hover:opacity-100 group-focus-visible:opacity-100">
                  <div className="overflow-hidden rounded-[1.35rem] border border-primary/20 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.22)] ring-1 ring-primary/10">
                    <div className="aspect-[16/10] overflow-hidden bg-slate-100">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-full w-full object-contain p-2"
                      />
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="min-w-0 space-y-2">
                        <h3 className="text-base font-semibold leading-5 text-foreground">{product.name}</h3>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {product.description || 'No description available.'}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs font-semibold text-primary">₱ {product.price.toFixed(2)}</p>
                    </div>
                    <div className="mx-4 mb-4 space-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-xs">
                      <p className="text-foreground">
                        <span className="font-semibold text-slate-700">Prep Time:</span>{' '}
                          {resolvedPrepTimeMinutes !== undefined
                            ? `${resolvedPrepTimeMinutes} mins`
                            : hoveredProductRecipeQuery.isFetching && product.id === hoveredProductId
                              ? 'Loading...'
                              : 'N/A'}
                      </p>
                      <p className="text-foreground">
                        <span className="font-semibold text-slate-700">Servings:</span>{' '}
                          {resolvedServings !== undefined
                            ? resolvedServings
                            : hoveredProductRecipeQuery.isFetching && product.id === hoveredProductId
                              ? 'Loading...'
                              : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right sidebar - Order Summary */}
      <div className="w-72 xl:w-80 shrink-0 bg-white border-l border-border p-4 xl:p-5 flex flex-col">
        <div className="mb-4">
          <label className="block text-xs text-muted-foreground mb-1.5">Customer Name (Optional):</label>
          <div ref={customerInputRef} className="relative">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onKeyDown={handleCustomerKeyDown}
              placeholder="Enter customer name if available"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-gray-50"
              autoComplete="off"
            />

            {/* Autocomplete Dropdown */}
            {showCustomerSuggestions && customerSuggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {customerSuggestions.map((name, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectCustomer(name)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors flex items-center gap-2 ${
                      index === selectedSuggestionIndex ? 'bg-primary/10' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-primary font-medium text-xs">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{name}</p>
                      <p className="text-xs text-gray-500">
                        {orders.filter(o => o.customer.toLowerCase() === name.toLowerCase()).length} previous orders
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dining Option Dropdown */}
        <div className="mb-4">
          <label className="block text-xs text-muted-foreground mb-1.5">Select Dining Option:</label>
          <select
            value={diningOption || ''}
            onChange={(e) => {
              const newOption = e.target.value as 'dine-in' | 'takeout' | '';
              setDiningOption(newOption);

              if (newOption === 'takeout') {
                // Clear dine-in specific data
                setSelectedTableNumber(null);
                setSelectedTables([]);
                setPartySize('');
                setIsInQueue(false);
                setQueuePosition(null);

                // Update all cart items to takeout
                setCart(cart.map(item => ({ ...item, orderType: 'takeout' as const })));
              } else if (newOption === 'dine-in') {
                // Update all cart items to dine-in
                setCart(cart.map(item => ({ ...item, orderType: 'dine-in' as const })));
              }
            }}
            className={`w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
              !diningOption ? 'text-gray-400' : 'bg-white'
            }`}
          >
            <option value="" disabled hidden>Select Dining Option</option>
            <option value="dine-in">Dine-In</option>
            <option value="takeout">Takeout</option>
          </select>
        </div>

        {/* Show party size and table selection when Dine-In is selected */}
        {tableManagementEnabled && diningOption === 'dine-in' && (
          <div className="mb-4 space-y-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Number of Customers (Pila mo kabuok?):</label>
              <input
                type="number"
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                placeholder="Enter number of customers"
                min="1"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              onClick={() => {
                if (!partySize || parseInt(partySize) < 1) {
                  alert('Please enter number of customers first');
                  return;
                }
                setShowTableSelection(true);
              }}
              className={`w-full px-3 py-2 ${selectedTables.length > 0 ? 'bg-primary text-primary-foreground' : isInQueue ? 'bg-orange-500 text-white' : 'bg-secondary text-secondary-foreground'} rounded-lg hover:opacity-90 transition-colors text-xs`}
            >
              {selectedTables.length > 0
                ? selectedTables.length === 1
                  ? `Table #${selectedTables[0]}`
                  : `Tables: ${selectedTables.map(t => `#${t}`).join(' + ')}`
                : isInQueue
                ? `Queue #${queuePosition}`
                : 'Select Available Table'}
            </button>
            {isInQueue && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
                <p className="text-xs text-orange-800">
                  <strong>In Queue:</strong> No tables currently available. Position #{queuePosition}
                </p>
              </div>
            )}
            <button
              onClick={() => setShowTakeoutMode(true)}
              className="w-full text-xs bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-muted/80 transition-colors"
            >
              + Add Takeout Order
            </button>
          </div>
        )}

        <div className="mb-3">
          <h3 className="text-sm mb-2">Order Summary</h3>
        </div>

        {/* Order cart display - conditional dividers */}
        <div className="flex-1 overflow-auto mb-4">
          {cart.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No items in cart</p>
          ) : (
            <div className="space-y-3">
              {/* Show separate sections ONLY when order contains BOTH types */}
              {dineInItems.length > 0 && takeoutItems.length > 0 ? (
                <>
                  {/* Dine-In Order List */}
                  <div className="border border-primary/30 rounded-lg p-2 bg-primary/5">
                    <h4 className="text-xs font-medium text-primary mb-2">Dine-In Orders</h4>
                    <div className="space-y-2">
                      {cart.map((item, index) => item.orderType === 'dine-in' && (
                        <div key={`cart-${index}`} className="border border-border rounded-lg p-2 bg-white">
                          <div className="flex items-start gap-2">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground">₱ {item.price.toFixed(2)} each</p>
                              <p className="text-xs text-primary font-medium">₱ {(item.price * item.quantity).toFixed(2)}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateQuantity(index, item.quantity - 1)}
                                className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs w-6 text-center">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(index, item.quantity + 1)}
                                className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => setDeletingCartItem({ index, name: item.name })}
                              className="text-destructive hover:bg-destructive/10 p-1 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <button
                            onClick={() => setCustomizeItemIndex(index)}
                            className="text-xs text-primary hover:underline mt-2 flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" />
                            Modify
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Takeout Order List */}
                  <div className="border border-secondary/30 rounded-lg p-2 bg-secondary/5">
                    <h4 className="text-xs font-medium text-secondary mb-2">Takeout Orders</h4>
                    <div className="space-y-2">
                      {cart.map((item, index) => item.orderType === 'takeout' && (
                        <div key={`cart-${index}`} className="border border-border rounded-lg p-2 bg-white">
                          <div className="flex items-start gap-2">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground">₱ {item.price.toFixed(2)} each</p>
                              <p className="text-xs text-secondary font-medium">₱ {(item.price * item.quantity).toFixed(2)}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateQuantity(index, item.quantity - 1)}
                                className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs w-6 text-center">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(index, item.quantity + 1)}
                                className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => setDeletingCartItem({ index, name: item.name })}
                              className="text-destructive hover:bg-destructive/10 p-1 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <button
                            onClick={() => setCustomizeItemIndex(index)}
                            className="text-xs text-secondary hover:underline mt-2 flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" />
                            Modify
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* Single unified list when order contains ONLY one type */
                <div className="space-y-2">
                  {cart.map((item, index) => (
                    <div key={`cart-${index}`} className="border border-border rounded-lg p-2 bg-white">
                      <div className="flex items-start gap-2">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">₱ {item.price.toFixed(2)} each</p>
                          <p className="text-xs font-medium">₱ {(item.price * item.quantity).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateQuantity(index, item.quantity - 1)}
                            className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs w-6 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(index, item.quantity + 1)}
                            className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => setDeletingCartItem({ index, name: item.name })}
                          className="text-destructive hover:bg-destructive/10 p-1 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={() => setCustomizeItemIndex(index)}
                        className="text-xs text-primary hover:underline mt-2 flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        Modify
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Order totals */}
        <div className="space-y-1.5 mb-4 text-xs border-t border-border pt-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal:</span>
            <span>₱ {subtotal.toFixed(2)}</span>
          </div>
          {settings.enable_service_charge && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service Fee ({settings.service_charge_rate}%):</span>
              <span>PHP {serviceFee.toFixed(2)}</span>
            </div>
          )}
          {/* Discount section with Edit button */}
          {discountEnabled && (
          <div className="border-t border-border pt-2 mt-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-muted-foreground">Discount:</span>
              <button
                onClick={() => {
                  setDiscountModalError('');
                  setShowDiscountModal(true);
                }}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Edit2 className="w-3 h-3" />
                Edit
              </button>
            </div>
            {discount > 0 ? (
              <div className="flex justify-between text-destructive text-xs">
                <span>
                  {selectedDiscountName} ({selectedDiscountRate}%)
                  {discountIdNumber && ` - ID: ${discountIdNumber}`}
                </span>
                <span>- ₱ {discount.toFixed(2)}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No discount applied</p>
            )}
          </div>
          )}

          <div className="flex justify-between pt-2 border-t border-border font-medium">
            <span>TOTAL:</span>
            <span className="text-primary">₱ {total.toFixed(2)}</span>
          </div>
          {settings.enable_estimated_prep_time && cart.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-primary">
              <p className="font-medium">Estimated waiting time: {estimatedWaitingMinutes} minutes</p>
              {estimatedReadyTimeLabel && <p className="text-[11px] text-muted-foreground">Approx. ready by {estimatedReadyTimeLabel}</p>}
            </div>
          )}
        </div>

        {validationError && (
          <div className="mb-3 bg-destructive/10 border border-destructive/20 rounded-lg p-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-xs text-destructive">{validationError}</p>
          </div>
        )}

        <button
          onClick={handlePreviewOrder}
          className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg hover:bg-primary/90 transition-colors text-sm"
        >
          PREVIEW ORDER
        </button>
      </div>

      {/* Order Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl my-8 max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-border flex-shrink-0">
              <h2 className="text-lg text-primary">Order Preview</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <div className="mb-4 space-y-1">
                <p className="text-sm"><strong>Order Number:</strong> {currentOrderNumber}</p>
                {customerName.trim() && (
                  <p className="text-sm"><strong>Customer Name:</strong> {customerName.trim()}</p>
                )}
                <p className="text-sm"><strong>Dining Type:</strong> {diningOption === 'dine-in' ? 'Dine-In' : 'Takeout'}</p>
                {partySize && parseInt(partySize) > 0 && (
                  <p className="text-sm"><strong>Party Size:</strong> {partySize} {parseInt(partySize) === 1 ? 'person' : 'people'}</p>
                )}
                {selectedTables.length > 0 && (
                  <p className="text-sm">
                    <strong>Table{selectedTables.length > 1 ? 's' : ''}:</strong>{' '}
                    {selectedTables.length === 1
                      ? `#${selectedTables[0]}`
                      : selectedTables.map(t => `#${t}`).join(' + ')}
                    {selectedTables.length > 1 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({selectedTables.reduce((sum, tableNum) => {
                          const table = tables.find(t => t.number === tableNum);
                          return sum + (table?.seats || 0);
                        }, 0)} seats total)
                      </span>
                    )}
                  </p>
                )}
                {isInQueue && <p className="text-sm"><strong>Queue Position:</strong> #{queuePosition}</p>}
                {settings.enable_estimated_prep_time && (
                  <p className="text-sm">
                    <strong>Estimated preparation time:</strong> {estimatedWaitingMinutes} minutes
                    {estimatedReadyTimeLabel ? ` (ready around ${estimatedReadyTimeLabel})` : ''}
                  </p>
                )}
              </div>

              {/* Dine-In Order List */}
              {dineInItems.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium mb-2 text-primary">Dine-In Orders:</h3>
                  <div className="space-y-2">
                    {dineInItems.map((item, index) => {
                      const { addedIngredients, removedIngredients, replacedIngredients, quantityChanges, selectedModifiers } = getIngredientChanges(item);
                      const hasCustomization = item.notes || selectedModifiers.length > 0 || addedIngredients.length > 0 || removedIngredients.length > 0 || replacedIngredients.length > 0 || quantityChanges.length > 0;

                      return (
                        <div key={`preview-dinein-${index}`} className="border border-border rounded-lg p-3 bg-primary/5">
                          <div className="flex justify-between mb-1">
                            <p className="text-sm font-medium">{item.name} x{item.quantity}</p>
                            <p className="text-sm font-medium">₱{(item.price * item.quantity).toFixed(2)}</p>
                          </div>
                          {hasCustomization && (
                            <div className="mt-2 pt-2 border-t border-primary/20 space-y-1">
                              {removedIngredients.length > 0 && (
                                <p className="text-xs text-red-600">
                                  ❌ No: {removedIngredients.map(ing => ing.name).join(', ')}
                                </p>
                              )}
                              {addedIngredients.length > 0 && (
                                <p className="text-xs text-green-700">
                                  Add: {addedIngredients.map(ing => `${ing.name} ${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`).join(', ')}
                                </p>
                              )}
                              {replacedIngredients.length > 0 && (
                                <p className="text-xs text-primary">
                                  Replace: {replacedIngredients.map(ing => `${ing.name} to ${ing.replacement_name}`).join(', ')}
                                </p>
                              )}
                              {selectedModifiers.length > 0 && (
                                <p className="text-xs text-primary">
                                  Modifiers: {selectedModifiers.map((modifier) => modifier.name).join(', ')}
                                </p>
                              )}
                              {quantityChanges.length > 0 && (
                                <p className="text-xs text-blue-700">
                                  Quantity: {quantityChanges.map((ing) => {
                                    const original = item.originalIngredients.find((originalIngredient) => originalIngredient.name === ing.name);
                                    return `${ing.name} ${original?.quantity ?? 0}${ing.unit ? ` ${ing.unit}` : ''} to ${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`;
                                  }).join(', ')}
                                </p>
                              )}
                              {item.notes && (
                                <p className="text-xs text-gray-700 bg-yellow-50 px-2 py-1 rounded border border-yellow-200">
                                  📝 <strong>Note:</strong> {item.notes}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Takeout Order List */}
              {takeoutItems.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium mb-2 text-secondary">Takeout Orders:</h3>
                  <div className="space-y-2">
                    {takeoutItems.map((item, index) => {
                      const { addedIngredients, removedIngredients, replacedIngredients, quantityChanges, selectedModifiers } = getIngredientChanges(item);
                      const hasCustomization = item.notes || selectedModifiers.length > 0 || addedIngredients.length > 0 || removedIngredients.length > 0 || replacedIngredients.length > 0 || quantityChanges.length > 0;

                      return (
                        <div key={`preview-takeout-${index}`} className="border border-border rounded-lg p-3 bg-secondary/5">
                          <div className="flex justify-between mb-1">
                            <p className="text-sm font-medium">{item.name} x{item.quantity}</p>
                            <p className="text-sm font-medium">₱{(item.price * item.quantity).toFixed(2)}</p>
                          </div>
                          {hasCustomization && (
                            <div className="mt-2 pt-2 border-t border-secondary/20 space-y-1">
                              {removedIngredients.length > 0 && (
                                <p className="text-xs text-red-600">
                                  ❌ No: {removedIngredients.map(ing => ing.name).join(', ')}
                                </p>
                              )}
                              {addedIngredients.length > 0 && (
                                <p className="text-xs text-green-700">
                                  Add: {addedIngredients.map(ing => `${ing.name} ${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`).join(', ')}
                                </p>
                              )}
                              {replacedIngredients.length > 0 && (
                                <p className="text-xs text-primary">
                                  Replace: {replacedIngredients.map(ing => `${ing.name} to ${ing.replacement_name}`).join(', ')}
                                </p>
                              )}
                              {selectedModifiers.length > 0 && (
                                <p className="text-xs text-primary">
                                  Modifiers: {selectedModifiers.map((modifier) => modifier.name).join(', ')}
                                </p>
                              )}
                              {quantityChanges.length > 0 && (
                                <p className="text-xs text-blue-700">
                                  Quantity: {quantityChanges.map((ing) => {
                                    const original = item.originalIngredients.find((originalIngredient) => originalIngredient.name === ing.name);
                                    return `${ing.name} ${original?.quantity ?? 0}${ing.unit ? ` ${ing.unit}` : ''} to ${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`;
                                  }).join(', ')}
                                </p>
                              )}
                              {item.notes && (
                                <p className="text-xs text-gray-700 bg-yellow-50 px-2 py-1 rounded border border-yellow-200">
                                  📝 <strong>Note:</strong> {item.notes}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t border-border pt-3 mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₱{subtotal.toFixed(2)}</span>
                </div>
                {settings.enable_service_charge && (
                <div className="flex justify-between">
                  <span>Service Fee ({settings.service_charge_rate}%):</span>
                  <span>₱{serviceFee.toFixed(2)}</span>
                </div>
                )}
                {discount > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Discount ({selectedDiscountName} {selectedDiscountRate}%):</span>
                    <span>- ₱{discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-medium text-primary border-t border-border pt-2">
                  <span>Total Amount:</span>
                  <span>₱{total.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-3 flex-shrink-0">
              <button
                onClick={() => setShowPreview(false)}
                className="flex-1 px-6 py-2.5 border border-border rounded-lg hover:bg-muted transition-colors text-sm font-medium"
              >
                Back to Edit
              </button>
              <button
                onClick={handleConfirmOrder}
                className="flex-1 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 active:scale-95 transition-all text-sm font-semibold shadow-sm"
              >
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modify Item Modal */}
      {customizeItemIndex !== null && cart[customizeItemIndex] && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg my-8 max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-border flex-shrink-0">
              <h2 className="text-lg text-primary">Modify - {cart[customizeItemIndex].name}</h2>
              <button
                onClick={() => setCustomizeItemIndex(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {(cart[customizeItemIndex].modifiers ?? []).length > 0 && (
                <div className="mb-4">
                  <label className="block text-xs text-muted-foreground mb-2">Modifiers:</label>
                  <div className="space-y-3">
                    {Object.entries((cart[customizeItemIndex].modifiers ?? []).reduce<Record<string, Modifier[]>>((groups, modifier) => {
                      const group = modifier.group ?? 'Modifiers';
                      groups[group] = [...(groups[group] ?? []), modifier];
                      return groups;
                    }, {})).map(([group, options]) => (
                      <div key={group} className="rounded-lg border border-border p-3">
                        <p className="mb-2 text-xs font-semibold text-foreground">{group}</p>
                        <div className="space-y-2">
                          {options.map((modifier) => {
                            const disabled = modifier.stockStatus === 'unavailable';
                            return (
                              <label
                                key={modifier.id}
                                className={`flex items-center justify-between gap-2 rounded-lg border p-2 text-sm ${disabled ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400' : 'border-border hover:bg-muted/50'}`}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <input
                                    type="checkbox"
                                    name={`modifier-${customizeItemIndex}-${group}`}
                                    checked={(cart[customizeItemIndex].selectedModifierIds ?? []).includes(modifier.id)}
                                    onChange={() => toggleModifier(customizeItemIndex, modifier.id)}
                                    disabled={disabled}
                                  />
                                  <span className="truncate">
                                    {modifier.name}
                                    {formatModifierPrice(modifier) && <span className="ml-1 text-xs text-primary">{formatModifierPrice(modifier)}</span>}
                                  </span>
                                </span>
                                {modifier.itemId && (
                                  <span className="shrink-0 text-[10px] text-muted-foreground">
                                    {disabled ? 'Out of stock' : `${Number(modifier.quantityAvailable ?? 0)} ${modifier.unit ?? ''}`}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-xs text-muted-foreground">Ingredients:</label>
                  <button
                    type="button"
                    title="add ingredient"
                    onClick={() => setShowAddIngredient((open) => !open)}
                    className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-primary"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {showAddIngredient && (
                  <div className="mb-2 flex gap-2">
                    <input
                      list="pos-available-ingredients"
                      value={addIngredientName}
                      onChange={(event) => setAddIngredientName(event.target.value)}
                      placeholder="Search ingredient"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-input-background px-3 py-2 text-xs"
                    />
                    <datalist id="pos-available-ingredients">
                      {(posIngredientsQuery.data ?? []).map((ingredient) => (
                        <option key={ingredient.id} value={ingredient.name}>
                          {Number(ingredient.quantity_available ?? 0)} {ingredient.unit ?? 'pcs'}
                        </option>
                      ))}
                    </datalist>
                    <button
                      type="button"
                      onClick={() => addIngredient(customizeItemIndex)}
                      disabled={!addIngredientName.trim()}
                      className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                )}
                <div className="space-y-2">
                  {cart[customizeItemIndex].ingredients.map((ingredient, ingIndex) => (
                    <div key={`ing-${ingIndex}-${ingredient.name}`} className="p-2 border border-border rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-xs">{ingredient.name}</p>
                          <p className="text-xs text-muted-foreground">{ingredient.quantity} {ingredient.unit}</p>
                          {ingredient.replacement_name && (
                            <p className="text-xs text-primary">{ingredient.replacement_name} instead +PHP {Number(ingredient.additional_price ?? 0).toFixed(2)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateIngredientQuantity(customizeItemIndex, ingredient.name, ingredient.quantity - (ingredient.unit === 'g' || ingredient.unit === 'ml' ? 5 : 1))}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs w-10 text-center">{ingredient.quantity}</span>
                          <button
                            onClick={() => updateIngredientQuantity(customizeItemIndex, ingredient.name, ingredient.quantity + (ingredient.unit === 'g' || ingredient.unit === 'ml' ? 5 : 1))}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => setDeletingIngredient({ index: customizeItemIndex, name: ingredient.name })}
                          className="text-destructive hover:bg-destructive/10 p-1.5 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {ingredient.alternatives && ingredient.alternatives.length > 0 && (
                        <select
                          value={ingredient.replacement_ingredient_id ? String(ingredient.replacement_ingredient_id) : ''}
                          onChange={(event) => replaceIngredient(customizeItemIndex, ingredient.name, event.target.value)}
                          className="mt-2 w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs"
                        >
                          <option value="">No replacement</option>
                          {ingredient.alternatives.map((alternative) => (
                            <option key={alternative.id} value={alternative.alternative_ingredient_id}>
                              {alternative.ingredient_name} +PHP {Number(alternative.additional_price ?? 0).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs text-muted-foreground mb-1.5">Special Instructions:</label>
                <textarea
                  value={cart[customizeItemIndex].notes}
                  onChange={(e) => updateNotes(customizeItemIndex, e.target.value)}
                  placeholder="e.g., Well done, Extra sauce"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={3}
                />
              </div>
            </div>
            <div className="p-5 border-t border-border flex-shrink-0">
              <button
                onClick={() => setCustomizeItemIndex(null)}
                className="w-full px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Takeout Mode Modal */}
      {showTakeoutMode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-4xl my-8 max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-border flex-shrink-0">
              <h2 className="text-lg text-secondary">Add Takeout Order</h2>
              <button
                onClick={() => setShowTakeoutMode(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <div className="mb-4">
                <div className="bg-white rounded-lg p-1 inline-flex gap-1">
                  {dynamicMenuCategories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-4 py-1.5 rounded-lg text-xs transition-colors ${
                        selectedCategory === cat.id
                          ? 'bg-secondary text-secondary-foreground'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {filteredProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => {
                      addToCart(product, 'takeout');
                    }}
                    className="group rounded-lg border border-border bg-white p-2.5 text-left shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-secondary/50 hover:bg-secondary/[0.03] hover:shadow-lg focus-visible:-translate-y-0.5 focus-visible:border-secondary/50 focus-visible:ring-2 focus-visible:ring-secondary/20"
                  >
                    <div className="mb-2 aspect-square overflow-hidden rounded-lg bg-muted">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-150 ease-out group-hover:scale-[1.03]"
                      />
                    </div>
                    <h3 className="text-xs font-medium mb-0.5 line-clamp-1">{product.name}</h3>
                    {product.description && <p className="text-xs text-muted-foreground mb-1 line-clamp-2">{product.description}</p>}
                    <p className="text-xs text-secondary font-medium">₱ {product.price.toFixed(2)}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-5 border-t border-border flex-shrink-0">
              <button
                onClick={() => setShowTakeoutMode(false)}
                className="w-full px-6 py-2.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors text-sm"
              >
                Done Adding Takeout Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Choice Modal */}
      {showPaymentChoice && successOrderDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-border">
              <h2 className="text-lg text-primary">Dine-In Payment</h2>
              <button
                onClick={() => setShowPaymentChoice(false)}
                disabled={isPaymentSubmitting}
                className="text-muted-foreground hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <div className="rounded-lg bg-muted p-4 mb-4">
                <p className="text-xs text-muted-foreground">Total Amount</p>
                <p className="mt-1 text-3xl text-primary font-medium">PHP {total.toFixed(2)}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose Pay Later if the table should stay occupied until the customer pays.
                </p>
                {settings.enable_estimated_prep_time && (
                  <p className="mt-2 text-sm font-medium text-primary">
                    Estimated preparation time: {successOrderDetails.estimatedPrepMinutes ?? estimatedWaitingMinutes} minutes
                  </p>
                )}
              </div>
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod(enabledPaymentMethods[0] ?? 'Cash');
                    setShowPaymentChoice(false);
                    setShowPayment(true);
                  }}
                  disabled={isPaymentSubmitting}
                  className="w-full rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Pay Now
                </button>
                <button
                  type="button"
                  onClick={handlePayLater}
                  disabled={isPaymentSubmitting}
                  className="w-full rounded-lg border border-border py-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPaymentSubmitting ? 'Processing...' : 'Pay Later'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-md my-8 max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-border flex-shrink-0">
              <h2 className="text-lg text-primary">Payment Summary</h2>
              <button
                onClick={() => setShowPayment(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div className="mb-4">
                <p className="text-sm mb-2"><strong>Order Number:</strong> {currentOrderNumber}</p>
                <p className="text-sm mb-2"><strong>Customer:</strong> {customerName}</p>
                {settings.enable_estimated_prep_time && (
                  <p className="text-sm mb-2"><strong>Estimated waiting time:</strong> {estimatedWaitingMinutes} minutes</p>
                )}
                <div className="bg-muted rounded-lg p-3 mb-3">
                  <h4 className="text-xs font-medium mb-2">Ordered Items:</h4>
                  <div className="space-y-1">
                    {cart.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span>{item.quantity}x {item.name}</span>
                        <span>₱{(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-muted rounded-lg p-4 mb-4">
                <div className="space-y-1 text-sm mb-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span>₱{subtotal.toFixed(2)}</span>
                  </div>
                  {settings.enable_service_charge && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Service Fee ({settings.service_charge_rate}%):</span>
                    <span>₱{serviceFee.toFixed(2)}</span>
                  </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-destructive text-xs">
                      <span>Discount:</span>
                      <span>- ₱{discount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-border pt-2">
                  <p className="text-xs text-muted-foreground mb-1">Total Amount Due</p>
                  <p className="text-3xl text-primary font-medium">₱ {total.toFixed(2)}</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {enabledPaymentMethods.map((method) => {
                    const Icon = method === 'Cash' ? Banknote : method === 'Bank Transfer' ? Building2 : method === 'GCash' ? Smartphone : Wallet;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(method);
                          if (method !== 'Cash') setCashAmount('');
                        }}
                        className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          paymentMethod === method ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {method}
                      </button>
                    );
                  })}
                </div>
              </div>

              {paymentMethod === 'Cash' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Amount Received</label>
                  <input
                    type="number"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full px-4 py-3 border border-border rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                  />
                </div>
              )}

              {paymentMethod !== 'Cash' && selectedPaymentAccount && (
                <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                  {selectedPaymentAccount.qr_image && <img src={selectedPaymentAccount.qr_image} alt={`${paymentMethod} QR code`} className="mb-3 h-40 w-40 rounded-lg border border-border bg-white object-contain p-2" />}
                  {selectedPaymentAccount.account_name && <p><span className="font-medium">Account Name:</span> {selectedPaymentAccount.account_name}</p>}
                  {selectedPaymentAccount.account_number && <p><span className="font-medium">Account Details:</span> {selectedPaymentAccount.account_number}</p>}
                  {selectedPaymentAccount.instructions && <p className="mt-2 text-muted-foreground">{selectedPaymentAccount.instructions}</p>}
                </div>
              )}

              {paymentMethod === 'Cash' && cashAmount && parseFloat(cashAmount) >= total && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-muted-foreground mb-1">Change</p>
                  <p className="text-2xl text-green-600 font-medium">₱ {(parseFloat(cashAmount) - total).toFixed(2)}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPayment(false)}
                  disabled={isPaymentSubmitting}
                  className="flex-1 border border-border py-3 rounded-lg hover:bg-muted transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePaymentSubmit}
                  disabled={isPaymentSubmitting || (paymentMethod === 'Cash' && (!cashAmount || parseFloat(cashAmount) < total))}
                  className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPaymentSubmitting ? 'Processing...' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && successOrderDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-md my-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="p-5 text-center">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl text-primary mb-2">
                {successOrderDetails.paid ? 'Payment Successful!' : 'Order Successfully Created!'}
              </h2>
              <div className="bg-muted rounded-lg p-4 mb-4 text-left">
                <p className="text-sm mb-2"><strong>Order Number:</strong> {successOrderDetails.orderNumber}</p>
                {successOrderDetails.customerName?.trim() && (
                  <p className="text-sm mb-2"><strong>Customer Name:</strong> {successOrderDetails.customerName.trim()}</p>
                )}
                {successOrderDetails.tableNumber && (
                  <p className="text-sm mb-2"><strong>Table Number:</strong> {successOrderDetails.tableNumber}</p>
                )}
                {isInQueue && (
                  <p className="text-sm mb-2"><strong>Queue Position:</strong> #{queuePosition}</p>
                )}
                <p className="text-sm mb-2">
                  <strong>Order Type:</strong> {
                    successOrderDetails.items.some((i: any) => i.orderType === 'dine-in') &&
                    successOrderDetails.items.some((i: any) => i.orderType === 'takeout')
                      ? 'Mixed'
                      : successOrderDetails.items.some((i: any) => i.orderType === 'dine-in')
                      ? 'Dine-In'
                      : 'Takeout'
                  }
                </p>
                <p className="text-sm mb-2"><strong>Total Amount:</strong> ₱{successOrderDetails.total?.toFixed(2)}</p>
                {settings.enable_estimated_prep_time && successOrderDetails.estimatedPrepMinutes !== undefined && (
                  <p className="text-sm mb-2">
                    <strong>Estimated Ready:</strong> {successOrderDetails.estimatedPrepMinutes} minutes
                    {successOrderDetails.estimatedReadyAt ? ` (${new Date(successOrderDetails.estimatedReadyAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })})` : ''}
                  </p>
                )}
                <p className="text-sm mb-2">
                  <strong>Payment Status:</strong>{' '}
                  <span className={successOrderDetails.paid ? 'text-green-600' : 'text-orange-600'}>
                    {successOrderDetails.paid ? 'Paid' : 'Pending'}
                  </span>
                </p>
                <p className="text-sm mb-2">
                  <strong>Order Status:</strong>{' '}
                  <span className="text-blue-600">Pending</span>
                </p>
                {successOrderDetails.paid && successOrderDetails.cashReceived && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-sm mb-1"><strong>Amount Received:</strong> ₱{successOrderDetails.cashReceived.toFixed(2)}</p>
                    <p className="text-sm text-green-600 font-medium"><strong>Change:</strong> ₱{(successOrderDetails.changeGiven || 0).toFixed(2)}</p>
                  </div>
                )}
              </div>

              {successOrderDetails.paid ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleSuccessClose}
                    className="flex-1 bg-muted text-foreground py-3 rounded-lg hover:bg-muted/80 transition-colors text-sm"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => setShowReceiptPreview(true)}
                    className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors text-sm"
                  >
                    View Receipt
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {successOrderDetails.items.some((i: any) => i.orderType === 'dine-in')
                      ? isInQueue
                        ? `Order added to queue (Position #${queuePosition}). Customer will be seated when a table becomes available.`
                        : 'Order sent to kitchen. Customer will pay after dining.'
                      : 'Order created and ready for payment.'}
                  </p>
                  <button
                    onClick={handleSuccessClose}
                    className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors text-sm"
                  >
                    Back to Dashboard
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex justify-between items-center p-5 border-b border-border">
              <h2 className="text-lg text-primary">Apply Discount</h2>
              <button
                onClick={() => setShowDiscountModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Discount Type</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted">
                      <input
                        type="radio"
                        name="discount"
                        value="none"
                        checked={discountType === 'none'}
                        onChange={(e) => {
                          setDiscountType('none');
                          setDiscountIdNumber('');
                          setDiscountModalError('');
                          setCustomDiscountPercent(0);
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">No Discount</span>
                    </label>
                    {enabledDiscounts.map((discountSetting) => (
                      <label key={discountSetting.id} className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted">
                        <input
                          type="radio"
                          name="discount"
                          value={discountSetting.id}
                          checked={discountType === String(discountSetting.id)}
                          onChange={() => {
                            setDiscountType(String(discountSetting.id));
                            setDiscountIdNumber('');
                            setDiscountModalError('');
                          }}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">{discountSetting.discount_name} - {Number(discountSetting.discount_rate).toFixed(2)}%</span>
                      </label>
                    ))}
                    {false && (
                    <>
                    <label className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted">
                      <input
                        type="radio"
                        name="discount"
                        value="senior"
                        checked={discountType === 'senior'}
                        onChange={(e) => setDiscountType('senior')}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Senior Citizen — 20%</span>
                    </label>
                    <label className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted">
                      <input
                        type="radio"
                        name="discount"
                        value="pwd"
                        checked={discountType === 'pwd'}
                        onChange={(e) => setDiscountType('pwd')}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">PWD — 20%</span>
                    </label>
                    <label className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted">
                      <input
                        type="radio"
                        name="discount"
                        value="promo"
                        checked={discountType === 'promo'}
                        onChange={(e) => {
                          setDiscountType('promo');
                          setDiscountIdNumber('');
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Promo Discount</span>
                    </label>
                    <label className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted">
                      <input
                        type="radio"
                        name="discount"
                        value="custom"
                        checked={discountType === 'custom'}
                        onChange={(e) => {
                          setDiscountType('custom');
                          setDiscountIdNumber('');
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Custom Discount</span>
                    </label>
                    </>
                    )}
                  </div>
                </div>

                {selectedDiscountNeedsId && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      {selectedDiscountName} ID Number *
                    </label>
                    <input
                      type="text"
                      value={discountIdNumber}
                      onChange={(e) => {
                        setDiscountIdNumber(e.target.value);
                        setDiscountModalError('');
                      }}
                      placeholder="Enter ID number"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      ID number is required for {selectedDiscountName}.
                    </p>
                  </div>
                )}
                {discountModalError && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {discountModalError}
                  </div>
                )}

                {false && (discountType === 'senior' || discountType === 'pwd') && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      {discountType === 'senior' ? 'Senior Citizen' : 'PWD'} ID Number *
                    </label>
                    <input
                      type="text"
                      value={discountIdNumber}
                      onChange={(e) => setDiscountIdNumber(e.target.value)}
                      placeholder="Enter ID number"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      ID number is required for {discountType === 'senior' ? 'Senior Citizen' : 'PWD'} discount
                    </p>
                  </div>
                )}

                {false && discountType === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Discount Percentage *</label>
                    <input
                      type="number"
                      value={customDiscountPercent}
                      onChange={(e) => setCustomDiscountPercent(parseFloat(e.target.value) || 0)}
                      placeholder="Enter discount %"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      min="0"
                      max="100"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter a percentage between 0 and 100
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setShowDiscountModal(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (selectedDiscountNeedsId && !discountIdNumber.trim()) {
                      setDiscountModalError(`Please enter the ID number for ${selectedDiscountName}.`);
                      return;
                    }
                    setDiscountModalError('');
                    setShowDiscountModal(false);
                  }}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
                >
                  Apply Discount
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table Selection Modal */}
      {showTableSelection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-[1180px] my-8 max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-border flex-shrink-0">
              <h2 className="text-lg text-primary">Select Available Table</h2>
              <button
                onClick={() => setShowTableSelection(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {/* Party Size Info */}
              {partySize && parseInt(partySize) > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-blue-900">Party Size: {partySize} {parseInt(partySize) === 1 ? 'person' : 'people'}</h3>
                      <p className="text-sm text-blue-800 mt-1">
                        {(() => {
                          const party = parseInt(partySize);
                          const bestTable = availableTables
                            .sort((a, b) => (a.isShared ? a.availableSeats : a.seats) - (b.isShared ? b.availableSeats : b.seats))[0];

                          if (bestTable) {
                            return `Recommended: Table ${bestTable.number} (${bestTable.isShared ? bestTable.availableSeats : bestTable.seats} seats available)`;
                          } else {
                            const totalAvailableSeats = availableTables.reduce((sum, t) => sum + (t.isShared ? t.availableSeats : t.seats), 0);
                            if (totalAvailableSeats >= party) {
                              return 'Select one table with enough available seats';
                            } else {
                              return 'No available tables can accommodate this party size';
                            }
                          }
                        })()}
                      </p>
                    </div>
                    {selectedTables.length > 0 && (
                      <div className="text-right">
                        <p className="text-sm font-medium text-blue-900">Selected Capacity</p>
                        <p className="text-lg font-bold text-blue-700">
                          {selectedTables.reduce((sum, tableNum) => {
                            const table = tables.find(t => t.number === tableNum);
                            return sum + (table?.isShared ? table.availableSeats : table?.seats || 0);
                          }, 0)} seats
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {availableTables.length === 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                    <h3 className="font-medium text-orange-900">No Tables Available</h3>
                  </div>
                  <p className="text-sm text-orange-800">
                    No table has enough available seats. You can either:
                  </p>
                  <ul className="text-sm text-orange-800 mt-2 ml-4 list-disc space-y-1">
                    <li>Wait in the queue and we'll assign you a table when one becomes available</li>
                    <li>Convert your order to takeout and pay now</li>
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
                {tables.map(table => {
                  const party = parseInt(partySize) || 0;
                  const isSelected = selectedTables.includes(table.number);
                  const canSeat = tableCanSeat(table, party);
                  const tableAvailableSeats = table.isShared ? table.availableSeats : table.seats;
                  const bestTable = [...availableTables].sort((a, b) => (a.isShared ? a.availableSeats : a.seats) - (b.isShared ? b.availableSeats : b.seats))[0];
                  const isBestMatch = canSeat && bestTable?.id === table.id;
                  const theme = getTableTheme(table.status);
                  const rectangular = table.seats > 4;
                  const chairs = getChairLayout(table.seats, rectangular);
                  const displayedChairs = chairs.slice(0, 8);
                  const statusLabel = table.status === 'available'
                    ? 'Available'
                    : table.status === 'partially_occupied'
                    ? 'Partially Occupied'
                    : table.status === 'occupied'
                    ? 'Occupied'
                    : 'Available';

                  return (
                    <div
                      key={table.id}
                      className={`rounded-2xl border transition-all p-2.5 flex flex-col gap-2.5 relative overflow-hidden ${
                        isSelected
                          ? 'border-blue-400 ring-2 ring-blue-100 shadow-[0_18px_34px_rgba(59,130,246,0.18)]'
                          : isBestMatch
                          ? 'border-blue-300 ring-2 ring-blue-100 shadow-[0_14px_30px_rgba(59,130,246,0.12)]'
                          : 'border-slate-200 shadow-[0_10px_26px_rgba(15,23,42,0.08)]'
                      }`}
                      style={{
                        background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
                      }}
                    >
                      <div className="absolute top-2.5 right-2.5 z-20 p-1.5 rounded-full text-gray-600">
                        <MoreVertical className="w-4 h-4" />
                      </div>

                      {isBestMatch && (
                        <div className="absolute top-2 left-2 bg-blue-500 text-white text-[10px] px-2 py-1 rounded-full font-medium z-20">
                          Best Match
                        </div>
                      )}

                      <div className="relative z-10 min-h-[34px]">
                        <div>
                          <p className="text-[13px] font-semibold text-slate-800">Table {table.number}</p>
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                            <Users className="w-3 h-3" />
                            <span>{table.isShared ? `${table.availableSeats}/${table.seats} seats available` : `${table.seats} seats`}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (canSeat) {
                            if (isSelected) {
                              setSelectedTables(selectedTables.filter(t => t !== table.number));
                            } else {
                              setSelectedTables([table.number]);
                            }
                          }
                        }}
                        disabled={!canSeat}
                        className={`relative h-32 w-full rounded-[18px] focus:outline-none transition-transform ${
                          canSeat ? 'cursor-pointer hover:scale-[1.01]' : 'cursor-not-allowed opacity-80'
                        }`}
                      >
                        {displayedChairs.map((chair, index) =>
                          renderChairIcon(`modal-chair-${table.id}-${index}`, chair.side, chair.offset, theme.accent, rectangular)
                        )}

                        <div
                          className="absolute left-1/2 top-1/2 overflow-hidden"
                          style={{
                            width: rectangular ? 138 : 84,
                            height: rectangular ? 64 : 84,
                            transform: 'translate(-50%, -50%)',
                            borderRadius: rectangular ? 16 : 999,
                            border: `1.5px solid ${theme.frame}`,
                            background: theme.surface,
                            boxShadow: `0 10px 18px rgba(15, 23, 42, 0.11), 0 0 0 4px ${theme.glow}`,
                          }}
                        >
                          <div
                            className="absolute inset-x-4 top-2 h-px opacity-80"
                            style={{
                              background: 'linear-gradient(90deg, rgba(255,255,255,0.9) 0%, rgba(203,213,225,0.55) 50%, rgba(255,255,255,0.9) 100%)',
                            }}
                          />
                          <div
                            className="absolute inset-0 opacity-50"
                            style={{
                              backgroundImage: rectangular
                                ? 'linear-gradient(90deg, rgba(255,255,255,0.75) 0%, rgba(226,232,240,0.45) 48%, rgba(255,255,255,0.75) 100%)'
                                : 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95), rgba(226,232,240,0.18) 55%, rgba(255,255,255,0.72) 100%)',
                            }}
                          />
                          <div
                            className={`absolute inset-[4px] ${rectangular ? 'rounded-[12px]' : 'rounded-full'}`}
                            style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.7)' }}
                          />
                          <div className="relative z-10 flex h-full items-center justify-center">
                            <div
                              className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-[0_8px_18px_rgba(15,23,42,0.18)]"
                              style={{ backgroundColor: theme.accent }}
                            >
                              T{String(table.number).padStart(2, '0')}
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="absolute top-2 right-2 bg-primary rounded-full w-5.5 h-5.5 flex items-center justify-center shadow-md">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </button>

                      <div className="relative z-10">
                        <span
                          className="pointer-events-none absolute left-3 top-1/2 z-10 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                          style={{ backgroundColor: theme.accent }}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2 text-gray-400">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                          </svg>
                        </span>
                        <div className={`w-full px-7 pr-8 py-1.5 rounded-xl text-[13px] font-medium border ${
                          table.status === 'available' ? 'border-green-200 bg-green-50/70 text-green-700' :
                          table.status === 'partially_occupied' ? 'border-yellow-200 bg-yellow-50/80 text-yellow-700' :
                          table.status === 'occupied' ? 'border-orange-200 bg-orange-50/80 text-orange-700' :
                          'border-gray-200 bg-gray-50 text-gray-700'
                        }`}>
                          {statusLabel}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Status Legend</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                      #
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Available</p>
                      <p className="text-xs text-gray-500">Ready</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                      #
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Occupied</p>
                      <p className="text-xs text-gray-500">Has order</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                      #
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Partially Occupied</p>
                      <p className="text-xs text-gray-500">Shared seats open</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-border flex-shrink-0">
              {availableTables.length === 0 ? (
                <div className="space-y-3">
                  <button
                    onClick={handleAddToQueue}
                    className="w-full bg-orange-500 text-white py-3 rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
                  >
                    WAIT IN QUEUE FOR TABLE
                  </button>
                  <button
                    onClick={() => {
                      // Convert dine-in items to takeout
                      setCart(cart.map(item => ({ ...item, orderType: 'takeout' })));
                      setDiningOption('takeout');
                      setShowTableSelection(false);
                      setSelectedTableNumber(null);
                      setIsInQueue(false);
                      setQueuePosition(null);
                    }}
                    className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                  >
                    CONVERT TO TAKEOUT ORDER
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleTakeTable}
                  disabled={selectedTables.length === 0}
                  className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedTables.length === 0
                    ? 'SELECT TABLE(S)'
                    : selectedTables.length === 1
                    ? `SELECT TABLE #${selectedTables[0]}`
                    : `SELECT TABLES: ${selectedTables.map(t => `#${t}`).join(' + ')}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {showReceiptPreview && successOrderDetails && (() => {
        const getReceiptItemType = (item: CartItem & { itemType?: 'dine-in' | 'takeout' }) => item.itemType ?? item.orderType;
        const receiptDineInItems = successOrderDetails.items.filter((i: CartItem & { itemType?: 'dine-in' | 'takeout' }) => getReceiptItemType(i) === 'dine-in');
        const receiptTakeoutItems = successOrderDetails.items.filter((i: CartItem & { itemType?: 'dine-in' | 'takeout' }) => getReceiptItemType(i) === 'takeout');
        const receiptIsMixed = receiptDineInItems.length > 0 && receiptTakeoutItems.length > 0;

        const orderType = receiptIsMixed ? 'Mixed' : receiptDineInItems.length > 0 ? 'Dine-In' : 'Takeout';

        const discountTypeLabel = successOrderDetails.discountType === 'senior' ? 'Senior Citizen' :
          successOrderDetails.discountType === 'pwd' ? 'PWD' :
          successOrderDetails.discountType === 'promo' ? 'Promo' :
          successOrderDetails.discountType === 'custom' ? 'Custom' : successOrderDetails.discountType ?? '';

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-hidden shadow-2xl flex flex-col my-8">
              <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm text-gray-700" style={{ fontWeight: 600 }}>Receipt Preview</h2>
              </div>

              <ThermalReceipt
                ref={receiptRef}
                orderNumber={currentOrderNumber}
                customerName={successOrderDetails.customerName}
                orderType={orderType as 'Dine-In' | 'Takeout' | 'Mixed'}
                table={successOrderDetails.tableNumber ? `#${successOrderDetails.tableNumber}` : successOrderDetails.isQueued ? 'Queue' : undefined}
                items={successOrderDetails.items.map((item: CartItem & { itemType?: 'dine-in' | 'takeout' }) => ({
                  name: item.name,
                  quantity: item.quantity,
                  price: item.price,
                  itemType: getReceiptItemType(item),
                }))}
                subtotal={successOrderDetails.subtotal}
                serviceFee={successOrderDetails.serviceFee}
                tax={successOrderDetails.tax}
                discount={successOrderDetails.discount}
                discountType={discountTypeLabel}
                total={successOrderDetails.total}
                cashReceived={successOrderDetails.cashReceived}
                changeGiven={successOrderDetails.changeGiven}
                estimatedPrepMinutes={successOrderDetails.estimatedPrepMinutes}
                estimatedReadyAt={successOrderDetails.estimatedReadyAt}
                cashier={successOrderDetails.cashier || userName || 'Staff'}
                storeBrand={storeBrand}
              />

              {/* Actions */}
              <div className="px-5 py-4 border-t border-gray-100 space-y-2">
                <button
                  onClick={() => {
                    window.print();
                  }}
                  className="w-full py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                  style={{ fontWeight: 600 }}
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <button
                  onClick={() => {
                    setShowReceiptPreview(false);
                    setShowSuccess(true);
                  }}
                  className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      <DeleteConfirmDialog
        isOpen={Boolean(deletingCartItem)}
        title="Confirm Delete"
        description={`Are you sure you want to delete ${deletingCartItem?.name ?? 'this item'} from the order?`}
        onCancel={() => setDeletingCartItem(null)}
        onConfirm={() => {
          if (deletingCartItem) removeItem(deletingCartItem.index);
        }}
      />
      <DeleteConfirmDialog
        isOpen={Boolean(deletingIngredient)}
        title="Confirm Delete"
        description={`Are you sure you want to delete ${deletingIngredient?.name ?? 'this ingredient'} from this item?`}
        onCancel={() => setDeletingIngredient(null)}
        onConfirm={() => {
          if (deletingIngredient) deleteIngredient(deletingIngredient.index, deletingIngredient.name);
        }}
      />
    </div>
  );
}
