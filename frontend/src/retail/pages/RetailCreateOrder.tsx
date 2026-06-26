import { useState, useEffect, useMemo, useRef } from 'react';
import { Sidebar } from '../../shared/components/Sidebar';
import { Page, type StoreBrand } from '../../shared/App';
import type { StaffType, StoreType } from '../../auth/types/auth';
import { Barcode, Minus, Plus, Search, X, AlertCircle, ShoppingBag, Trash2, Printer } from 'lucide-react';
import { useOrders } from '../context/RetailOrderContext';
import { ThermalReceipt } from './RetailThermalReceipt';
import { useStoreSettings } from '../../shared/context/StoreSettingsContext';
import { DeleteConfirmDialog } from '../../shared/components/DeleteConfirmDialog';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { getLocalDateKey } from '../../shared/utils/date';
import { useCompletePaymentMutation, usePosMenuQuery } from '../../features/pos/hooks/usePosMenuQuery';

interface RetailCreateOrderProps {
  currentUser: AuthenticatedUser | null;
  onNavigate: (page: Page) => void;
  onOrderCreated: (order: any) => void;
  onLogout: () => void;
  storeBrand?: StoreBrand;
  userName?: string | null;
  userRole?: string | null;
  storeType?: StoreType;
  staffType?: StaffType;
}

interface CartItem {
  id: number;
  variantId: number;
  code: string;
  name: string;
  category: string;
  size?: string;
  color?: string;
  price: number;
  wholesalePrice?: number;
  quantity: number;
  image: string;
  stockQuantity?: number;
}

interface RetailProduct {
  id: number;
  variantId: number;
  code: string;
  name: string;
  description?: string;
  category: string;
  categoryName?: string;
  size?: string;
  color?: string;
  price: number;
  wholesalePrice?: number;
  image: string;
  stockQuantity?: number;
}

interface RetailProductGroup extends RetailProduct {
  variants: RetailProduct[];
  totalStockQuantity?: number;
  minPrice: number;
  maxPrice: number;
  sizes: string[];
  colors: string[];
}

export function RetailCreateOrder({ currentUser, onNavigate, onOrderCreated, onLogout, storeBrand, userName, userRole, storeType = 'RETAIL_STORE', staffType }: RetailCreateOrderProps) {
  const { addOrder, orders, getCustomerHistory, getRecommendedProducts } = useOrders();
  const { settings, discounts } = useStoreSettings();
  const posMenuQuery = usePosMenuQuery(currentUser?.id);
  const completePaymentMutation = useCompletePaymentMutation();
  const enabledDiscounts = discounts.filter((discount) => discount.is_enabled);
  const transactionNumberRef = useRef(100001);
  const [currentTransactionNumber, setCurrentTransactionNumber] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [hasHistory, setHasHistory] = useState(false);
  const [recommendedProducts, setRecommendedProducts] = useState<RetailProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProductGroup, setSelectedProductGroup] = useState<RetailProductGroup | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCartItemIndexes, setSelectedCartItemIndexes] = useState<number[]>([]);
  const [deletingCartItem, setDeletingCartItem] = useState<{ index: number; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [useWholesalePricing, setUseWholesalePricing] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidPasscode, setVoidPasscode] = useState('');
  const [voidAuthorizationError, setVoidAuthorizationError] = useState('');
  const [isVoidSubmitting, setIsVoidSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashAmount, setCashAmount] = useState('');
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);
  const [changeAmount, setChangeAmount] = useState(0);
  const [discountType, setDiscountType] = useState<string>('none');
  const [customDiscountPercent, setCustomDiscountPercent] = useState<number>(0);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [validationError, setValidationError] = useState<string>('');
  const enabledPaymentMethods = settings.enabled_payment_methods.length > 0 ? settings.enabled_payment_methods : ['Cash'];
  const selectedPaymentAccount = settings.payment_method_accounts[paymentMethod];

  // Autocomplete for customer
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const customerInputRef = useRef<HTMLDivElement>(null);

  // Scan feedback
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const posProducts = useMemo<RetailProduct[]>(() => {
    return (posMenuQuery.data ?? []).map((product: any) => ({
      id: Number(product.id),
      variantId: Number(product.variant_id),
      code: product.barcode || product.sku || String(product.variant_id || product.id),
      name: product.name,
      description: product.description ?? '',
      category: product.category_name ?? 'Uncategorized',
      categoryName: product.category_name ?? null,
      size: product.size ?? undefined,
      color: product.color ?? undefined,
      price: Number(product.price ?? 0),
      wholesalePrice: Number(product.wholesale_price ?? product.wholesalePrice ?? product.cost_price ?? product.cost ?? product.price ?? 0),
      image: product.image_url || storeBrand?.logo || '',
      stockQuantity: Number(product.available_quantity ?? product.stock_quantity ?? 0),
    }));
  }, [posMenuQuery.data, storeBrand?.logo]);
  const dynamicProductCategories = useMemo(
    () => [
      { id: 'all', name: 'All' },
      ...Array.from(new Set(posProducts.map((product) => product.category))).map((category) => ({ id: category, name: category })),
    ],
    [posProducts],
  );

  useEffect(() => {
    const highestOrderNumber = orders.reduce((highest, order) => {
      const match = String(order.transactionNumber ?? order.id ?? '').match(/(\d+)$/);
      const numericOrder = match ? Number(match[1]) : 0;
      return Number.isFinite(numericOrder) ? Math.max(highest, numericOrder) : highest;
    }, 100000);

    transactionNumberRef.current = Math.max(transactionNumberRef.current, highestOrderNumber + 1);
  }, [orders]);

  useEffect(() => {
    const loadNextOrderNumber = async () => {
      if (!currentUser?.id) return;

      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/pos/next-order-number?user_id=${currentUser.id}`);
        const data = await response.json();
        const nextOrderNumber = Number(data?.order_number);

        if (response.ok && Number.isFinite(nextOrderNumber)) {
          transactionNumberRef.current = Math.max(transactionNumberRef.current, nextOrderNumber);
        }
      } catch {
        // Existing order history still seeds a reasonable local preview number.
      }
    };

    void loadNextOrderNumber();
  }, [currentUser?.id]);

  // Autocomplete logic
  useEffect(() => {
    if (!customerName.trim()) {
      setShowCustomerSuggestions(false);
      setCustomerSuggestions([]);
      return;
    }

    const uniqueCustomers = Array.from(new Set(
      orders.map(order => order.customer).filter((name): name is string => !!name)
    ));
    const filtered = uniqueCustomers.filter(name =>
      name.toLowerCase().includes(customerName.toLowerCase())
    );
    const exactMatch = filtered.some(name => name.toLowerCase() === customerName.toLowerCase());

    if (filtered.length > 0 && !exactMatch) {
      setCustomerSuggestions(filtered.slice(0, 5));
      setShowCustomerSuggestions(true);
    } else {
      setShowCustomerSuggestions(false);
      setCustomerSuggestions([]);
    }

    setSelectedSuggestionIndex(-1);
  }, [customerName, orders]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerInputRef.current && !customerInputRef.current.contains(event.target as Node)) {
        setShowCustomerSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setSelectedCartItemIndexes((indexes) => indexes.filter((index) => index < cart.length));
  }, [cart.length]);

  const handleSelectCustomer = (name: string) => {
    setCustomerName(name);
    setShowCustomerSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  const handleCustomerKeyDown = (e: React.KeyboardEvent) => {
    if (!showCustomerSuggestions || customerSuggestions.length === 0) return;

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

  // Customer history and recommendations
  useEffect(() => {
    if (!customerName.trim()) {
      setHasHistory(false);
      setRecommendedProducts([]);
      return;
    }

    const history = getCustomerHistory(customerName);

    if (history) {
      setHasHistory(true);
      const recommendedCategories = getRecommendedProducts(customerName);
      const recommended = posProducts.filter(p =>
        recommendedCategories.includes(p.category)
      ).slice(0, 4);
      setRecommendedProducts(recommended);
    } else {
      setHasHistory(false);
      setRecommendedProducts([]);
    }
  }, [customerName, orders, posProducts]);

  const addToCart = (product: RetailProduct) => {
    const salePrice = useWholesalePricing ? product.wholesalePrice ?? product.price : product.price;
    const currentQuantity = cart
      .filter((item) => item.variantId === product.variantId)
      .reduce((sum, item) => sum + item.quantity, 0);
    if (product.stockQuantity !== undefined && currentQuantity >= product.stockQuantity) {
      setScanFeedback({ type: 'error', message: `${product.name} is out of stock.` });
      return false;
    }

    const existingItemIndex = cart.findIndex(item =>
      item.id === product.id &&
      item.variantId === product.variantId &&
      item.size === product.size &&
      item.color === product.color &&
      item.price === salePrice
    );

    if (existingItemIndex !== -1) {
      setCart(cart.map((item, index) =>
        index === existingItemIndex
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      const newItem: CartItem = {
        id: product.id,
        variantId: product.variantId,
        code: product.code,
        name: product.name,
        category: product.category,
        size: product.size,
        color: product.color,
        price: salePrice,
        wholesalePrice: product.wholesalePrice,
        quantity: 1,
        image: product.image,
        stockQuantity: product.stockQuantity,
      };
      setCart([...cart, newItem]);
    }

    return true;
  };

  const addProductByCode = (code: string) => {
    const product = posProducts.find(p => p.code.toUpperCase() === code.trim().toUpperCase());

    if (!product) {
      setScanFeedback({ type: 'error', message: `No product found for ${code}.` });
      return false;
    }

    if (!addToCart(product)) return false;
    setScanFeedback({ type: 'success', message: `${product.name} added to cart!` });
    setTimeout(() => {
      setScanFeedback(null);
    }, 2000);
    return true;
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();

      if (addProductByCode(searchQuery)) {
        setSearchQuery('');
      }
    }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && barcodeQuery.trim()) {
      e.preventDefault();

      if (addProductByCode(barcodeQuery)) {
        setBarcodeQuery('');
      }
    }
  };

  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      setCart(cart.filter((_, i) => i !== index));
      setSelectedCartItemIndexes((indexes) => indexes.filter((itemIndex) => itemIndex !== index).map((itemIndex) => itemIndex > index ? itemIndex - 1 : itemIndex));
    } else if (cart[index]?.stockQuantity !== undefined && newQuantity > cart[index].stockQuantity) {
      setScanFeedback({ type: 'error', message: `Only ${Math.trunc(cart[index].stockQuantity)} ${cart[index].name} available.` });
    } else {
      setCart(cart.map((item, i) =>
        i === index ? { ...item, quantity: newQuantity } : item
      ));
    }
  };

  const removeItem = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
    setSelectedCartItemIndexes((indexes) => indexes.filter((itemIndex) => itemIndex !== index).map((itemIndex) => itemIndex > index ? itemIndex - 1 : itemIndex));
    setDeletingCartItem(null);
  };

  const selectedCartItemSet = useMemo(() => new Set(selectedCartItemIndexes), [selectedCartItemIndexes]);
  const selectedCartItemCount = selectedCartItemIndexes.length;
  const allCartItemsSelected = cart.length > 0 && selectedCartItemCount === cart.length;

  const toggleCartItemSelection = (index: number) => {
    setSelectedCartItemIndexes((indexes) =>
      indexes.includes(index)
        ? indexes.filter((itemIndex) => itemIndex !== index)
        : [...indexes, index].sort((a, b) => a - b),
    );
  };

  const toggleAllCartItems = () => {
    setSelectedCartItemIndexes(allCartItemsSelected ? [] : cart.map((_, index) => index));
  };

  const voidSelectedCartItems = async () => {
    if (selectedCartItemCount === 0) return;
    if (!currentUser?.id) {
      setVoidAuthorizationError('No retail staff session was found.');
      return;
    }
    if (voidPasscode.trim().length < 4) {
      setVoidAuthorizationError('Enter the retail POS manager Unique PIN.');
      return;
    }

    setIsVoidSubmitting(true);
    setVoidAuthorizationError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/retail/void-pin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          void_pin: voidPasscode,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? 'Invalid retail POS manager Unique PIN.');
      }

      const authorizedBy = data?.manager?.full_name ? ` by ${data.manager.full_name}` : '';
      setCart((items) => items.filter((_, index) => !selectedCartItemSet.has(index)));
      setSelectedCartItemIndexes([]);
      setShowVoidModal(false);
      setVoidPasscode('');
      setValidationError('');
      setScanFeedback({
        type: 'success',
        message: `Void authorized${authorizedBy}. ${selectedCartItemCount} item${selectedCartItemCount === 1 ? '' : 's'} removed from cart.`,
      });
    } catch (voidError) {
      setVoidAuthorizationError(voidError instanceof Error ? voidError.message : 'Unable to authorize void.');
    } finally {
      setIsVoidSubmitting(false);
    }
  };

  const openVoidModal = () => {
    setSelectedCartItemIndexes([]);
    setVoidPasscode('');
    setVoidAuthorizationError('');
    setShowVoidModal(true);
  };

  const filteredProducts = posProducts.filter(p => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.color?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const groupedProducts = useMemo<RetailProductGroup[]>(() => {
    const groups = new Map<string, RetailProduct[]>();

    filteredProducts.forEach((product) => {
      const groupKey = `${product.id}-${product.category}-${product.name}`;
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), product]);
    });

    return Array.from(groups.values()).map((variants) => {
      const primaryVariant = variants[0];
      const prices = variants.map((variant) => variant.price);
      const stockValues = variants
        .map((variant) => variant.stockQuantity)
        .filter((stock): stock is number => stock !== undefined);

      return {
        ...primaryVariant,
        variants,
        totalStockQuantity: stockValues.length > 0 ? stockValues.reduce((sum, stock) => sum + stock, 0) : undefined,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        sizes: Array.from(new Set(variants.map((variant) => variant.size).filter((size): size is string => !!size))),
        colors: Array.from(new Set(variants.map((variant) => variant.color).filter((color): color is string => !!color))),
      };
    });
  }, [filteredProducts]);

  const handleProductCardClick = (productGroup: RetailProductGroup) => {
    if (productGroup.variants.length === 1) {
      addToCart(productGroup.variants[0]);
      return;
    }

    setSelectedProductGroup(productGroup);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const serviceFee = settings.enable_service_charge ? subtotal * (settings.service_charge_rate / 100) : 0;
  const tax = 0;
  const selectedDiscount = enabledDiscounts.find((item) => String(item.id) === discountType);
  const selectedDiscountName = selectedDiscount?.discount_name ?? '';
  const selectedDiscountRate = selectedDiscount ? Number(selectedDiscount.discount_rate) : 0;

  // Calculate discount
  const discountRate = settings.enable_discount && selectedDiscount ? selectedDiscountRate / 100 : 0;
  const discount = subtotal * discountRate;
  const total = subtotal + serviceFee - discount;

  const validateOrder = (): boolean => {
    if (cart.length === 0) {
      setValidationError('Cart is empty.');
      return false;
    }
    setValidationError('');
    return true;
  };

  const handlePreviewOrder = () => {
    if (validateOrder()) {
      const transNum = String(transactionNumberRef.current).padStart(6, '0');
      setCurrentTransactionNumber(transNum);
      setShowPreview(true);
    }
  };

  const handleConfirmOrder = () => {
    setShowPreview(false);
    setTimeout(() => {
      setShowPayment(true);
    }, 100);
  };

  const handlePaymentSubmit = async () => {
    if (isPaymentSubmitting) return;

    let computedChange = 0;
    if (paymentMethod === 'Cash') {
      const cash = parseFloat(cashAmount);
      if (cash < total) {
        alert('Insufficient amount');
        return;
      }
      computedChange = cash - total;
      setChangeAmount(computedChange);
    } else {
      setChangeAmount(0);
    }

    setIsPaymentSubmitting(true);

    const rawTransactionNumber = currentTransactionNumber || String(transactionNumberRef.current).padStart(6, '0');
    const transactionNumber = String(rawTransactionNumber).match(/(\d+)$/)?.[1] ?? String(transactionNumberRef.current).padStart(6, '0');

    const order = {
      transactionNumber: `RET-${transactionNumber}`,
      customer: customerName.trim() || undefined,
      items: cart.map(item => ({
        id: item.id,
        variantId: item.variantId,
        code: item.code,
        name: item.name,
        category: item.category,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        price: item.price,
        image: item.image,
      })),
      subtotal,
      serviceFee,
      discount,
      discountType: selectedDiscount ? `${selectedDiscountName} (${selectedDiscountRate}%)` : undefined,
      tax,
      amountNumber: total,
      paymentMethod,
      paymentStatus: 'Paid' as const,
      date: getLocalDateKey(),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      cashReceived: paymentMethod === 'Cash' ? parseFloat(cashAmount) : total,
      changeGiven: paymentMethod === 'Cash' ? computedChange : 0,
      cashier: userName || 'Staff',
    };

    try {
      if (currentUser?.id) {
        const data: any = await completePaymentMutation.mutateAsync({
          user_id: currentUser.id,
          orderNumber: `RET-${transactionNumber}`,
          customerName: order.customer ?? null,
          orderType: 'RETAIL',
          subtotal,
          discount,
          discountType: order.discountType ?? null,
          serviceFee,
          tax,
          total,
          items: cart.map((item) => ({
            productId: item.id,
            variantId: item.variantId,
            name: item.name,
            categoryName: item.category,
            size: item.size ?? null,
            color: item.color ?? null,
            quantity: item.quantity,
            price: item.price,
          })),
          payment: {
            paymentNumber: `PAY-${transactionNumber}`,
            method: paymentMethod,
            amountPaid: paymentMethod === 'Cash' ? parseFloat(cashAmount) : total,
            changeAmount: paymentMethod === 'Cash' ? computedChange : 0,
          },
        });

        order.transactionNumber = data?.order_number ?? order.transactionNumber;
        const savedOrderNumber = Number(String(order.transactionNumber).match(/(\d+)$/)?.[1]);
        if (Number.isFinite(savedOrderNumber)) {
          transactionNumberRef.current = Math.max(transactionNumberRef.current, savedOrderNumber + 1);
        }
        setCurrentTransactionNumber(order.transactionNumber);
      }

      addOrder(order);
      const completedOrderNumber = Number(String(order.transactionNumber).match(/(\d+)$/)?.[1]);
      transactionNumberRef.current = Number.isFinite(completedOrderNumber) ? Math.max(transactionNumberRef.current, completedOrderNumber + 1) : transactionNumberRef.current + 1;
      setCompletedOrder(order);
      setShowPayment(false);

      // Show receipt modal
      setShowReceipt(true);
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  const handleContinueFromReceipt = () => {
    setShowReceipt(false);
    setShowSuccess(true);
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    setCompletedOrder(null);
    setChangeAmount(0);
    setCart([]);
    setSelectedCartItemIndexes([]);
    setCustomerName('');
    setDiscountType('none');
    setCustomDiscountPercent(0);
    setValidationError('');
    setCurrentTransactionNumber('');
    setCashAmount('');
    setPaymentMethod('Cash');
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentPage="retail-sales" onNavigate={onNavigate} onLogout={onLogout} storeType={storeType} staffType={staffType} storeBrand={storeBrand} userName={userName} userRole={userRole} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-gray-50 xl:flex-row">
      <div className="min-w-0 flex-1 overflow-auto bg-gray-50">
        <div className="p-5">
          <h2 className="mb-4 text-lg font-semibold">Product Menu</h2>

          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search Products"
                className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                autoComplete="off"
              />
            </div>
            {scanFeedback && (
              <div className={`mt-2 px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                scanFeedback.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {scanFeedback.type === 'success' ? (
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                )}
                <span>{scanFeedback.message}</span>
              </div>
            )}
          </div>

          {hasHistory && recommendedProducts.length > 0 && (
            <div className="mb-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg p-4 border-2 border-emerald-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-[#00a7a5] rounded-full animate-pulse"></div>
                <p className="text-sm font-medium text-emerald-900">
                  ⭐ Recommended for {customerName}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {recommendedProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="bg-white rounded-lg p-3 text-left hover:shadow-lg transition-all border border-emerald-200 hover:border-emerald-400"
                  >
                    <div className="w-20 h-20 rounded-full overflow-hidden mx-auto mb-2 bg-muted ring-2 ring-emerald-300">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <h3 className="text-xs text-center mb-1">{product.name}</h3>
                    {product.description && <p className="text-[10px] text-muted-foreground text-center line-clamp-2 mb-1">{product.description}</p>}
                    <p className="text-xs text-center text-primary">₱ {product.price.toFixed(2)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4 inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-white p-1">
            {dynamicProductCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-lg px-4 py-1.5 text-xs transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <div className="max-h-[calc(100vh-265px)] overflow-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e5e7eb]">
                  <tr className="text-left text-xs font-semibold text-foreground">
                    <th className="w-[18%] border-r border-border px-4 py-3">Product Number</th>
                    <th className="w-[34%] border-r border-border px-4 py-3">Product Name</th>
                    <th className="w-[18%] border-r border-border px-4 py-3">Wholesale Price</th>
                    <th className="w-[18%] border-r border-border px-4 py-3">Retail Price</th>
                    <th className="w-[12%] px-4 py-3">Stocks</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const inCart = cart.some((item) => item.variantId === product.variantId);
                    const isOutOfStock = product.stockQuantity !== undefined && product.stockQuantity <= 0;

                    return (
                      <tr
                        key={`${product.id}-${product.variantId}`}
                        onClick={() => {
                          if (!isOutOfStock) addToCart(product);
                        }}
                        className={`cursor-pointer border-t border-border text-sm transition-colors ${
                          inCart
                            ? 'bg-emerald-50 text-emerald-800'
                            : isOutOfStock
                              ? 'cursor-not-allowed bg-gray-50 text-muted-foreground opacity-70'
                              : 'hover:bg-emerald-50/70'
                        }`}
                      >
                        <td className="border-r border-border px-4 py-2.5 font-mono text-xs">{product.code}</td>
                        <td className="border-r border-border px-4 py-2.5 font-medium">
                          {product.name}
                          {(product.size || product.color) && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {product.size ? product.size : ''}{product.size && product.color ? ' / ' : ''}{product.color ? product.color : ''}
                            </span>
                          )}
                        </td>
                        <td className="border-r border-border px-4 py-2.5">{(product.wholesalePrice ?? product.price).toFixed(2)}</td>
                        <td className="border-r border-border px-4 py-2.5">{product.price.toFixed(2)}</td>
                        <td className="px-4 py-2.5">{product.stockQuantity !== undefined ? Math.trunc(product.stockQuantity) : 'N/A'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredProducts.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No inventory items found.</div>
              )}
            </div>
          </div>
          <p className="mt-4 px-4 text-xs text-muted-foreground">
            Showing {filteredProducts.length} of {posProducts.length} items
          </p>

          <div className="hidden grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {groupedProducts.map(product => (
              <button
                key={`${product.id}-${product.category}-${product.name}`}
                onClick={() => handleProductCardClick(product)}
                disabled={product.totalStockQuantity !== undefined && product.totalStockQuantity <= 0}
                className="bg-white rounded-lg p-2.5 hover:shadow-md transition-shadow text-left disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="aspect-square bg-muted rounded-lg mb-2 overflow-hidden relative">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                  <div
                    className="absolute bottom-1 right-1 max-w-[78%] truncate rounded border border-gray-200 bg-white/90 px-1 py-0.5 font-mono text-[9px] leading-none text-gray-500"
                    title={product.variants.length === 1 ? `SKU/Barcode: ${product.code}` : `${product.variants.length} variants available`}
                  >
                    {product.variants.length === 1 ? product.code : `${product.variants.length} variants`}
                  </div>
                </div>
                <h3 className="text-xs font-medium mb-0.5 line-clamp-1">{product.name}</h3>
                {product.description && <p className="text-[10px] text-muted-foreground line-clamp-2 mb-1">{product.description}</p>}
                <div className="flex gap-1 mb-1 flex-wrap">
                  {product.sizes.length > 0 && (
                    <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                      {product.sizes.length === 1 ? `Size: ${product.sizes[0]}` : `${product.sizes.length} sizes`}
                    </span>
                  )}
                  {product.colors.length > 0 && (
                    <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                      {product.colors.length === 1 ? product.colors[0] : `${product.colors.length} colors`}
                    </span>
                  )}
                </div>
                <p className="text-xs text-primary font-medium">
                  {product.minPrice === product.maxPrice
                    ? `₱ ${product.minPrice.toFixed(2)}`
                    : `₱ ${product.minPrice.toFixed(2)} - ₱ ${product.maxPrice.toFixed(2)}`}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right sidebar - Cart */}
      <div className="flex max-h-[48vh] w-full shrink-0 flex-col border-t border-border bg-white p-5 xl:max-h-none xl:w-[clamp(480px,34vw,620px)] xl:border-l xl:border-t-0">
        <div className="mb-6 flex items-center gap-3">
          <ShoppingBag className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-semibold">Shopping Cart</h3>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Scan Barcode Here:</label>
          <div className="relative">
            <input
              type="text"
              value={barcodeQuery}
              onChange={(e) => setBarcodeQuery(e.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              placeholder="Scan barcode or enter product code..."
              className="w-full rounded-lg border border-border bg-white py-2.5 pl-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoComplete="off"
            />
            <Barcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-semibold text-emerald-600">Transaction ID:</span>
            <span className="rounded bg-black px-4 py-1 font-mono text-sm text-emerald-500">
              {currentTransactionNumber || String(transactionNumberRef.current)}
            </span>
          </div>
          <button
            type="button"
            onClick={openVoidModal}
            className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-300 px-5 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Void
          </button>
        </div>

        <div className="mb-4 min-h-0 overflow-hidden rounded-lg border border-border xl:flex-1">
          <div className="max-h-[248px] overflow-auto xl:h-full xl:max-h-none">
            <table className="w-full min-w-[540px] border-collapse text-sm">
              <thead className="sticky top-0 bg-white shadow-[0_1px_0_#e5e7eb]">
                <tr className="text-left text-xs font-semibold text-foreground">
                  <th className="w-10 border-r border-border px-3 py-3 text-center">#</th>
                  <th className="w-20 border-r border-border px-3 py-3">Quantity</th>
                  <th className="border-r border-border px-3 py-3">Product Name</th>
                  <th className="w-20 border-r border-border px-3 py-3">Price</th>
                  <th className="w-20 px-3 py-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item, index) => {
                  const isSelected = selectedCartItemSet.has(index);

                  return (
                    <tr
                      key={`cart-table-${index}`}
                      onClick={() => toggleCartItemSelection(index)}
                      className={`cursor-pointer border-t border-border transition-colors ${
                        isSelected ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="border-r border-border px-3 py-3 text-center text-xs">{index + 1}</td>
                      <td className="border-r border-border px-3 py-3">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) => updateQuantity(index, Number(event.target.value))}
                          onClick={(event) => event.stopPropagation()}
                          className="h-9 w-12 rounded-md border border-border text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </td>
                      <td className="border-r border-border px-3 py-3 font-semibold">
                        {item.name}
                        {(item.size || item.color) && (
                          <p className="mt-1 text-xs font-normal text-muted-foreground">
                            {item.size ? item.size : ''}{item.size && item.color ? ' / ' : ''}{item.color ? item.color : ''}
                          </p>
                        )}
                      </td>
                      <td className="border-r border-border px-3 py-3 font-semibold">{item.price.toFixed(2)}</td>
                      <td className="px-3 py-3 font-semibold">{(item.price * item.quantity).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {cart.length === 0 && (
              <div className="py-8 text-center">
                <ShoppingBag className="mx-auto mb-2 h-10 w-10 text-muted-foreground opacity-50" />
                <p className="text-xs text-muted-foreground">Cart is empty</p>
              </div>
            )}
          </div>
        </div>

        <div className="hidden flex-1 overflow-auto mb-4">
          {cart.length === 0 ? (
            <div className="text-center py-8">
              <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-xs text-muted-foreground">Cart is empty</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item, index) => {
                const isSelected = selectedCartItemSet.has(index);

                return (
                <div
                  key={`cart-${index}`}
                  onClick={() => toggleCartItemSelection(index)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleCartItemSelection(index);
                    }
                  }}
                  className={`w-full rounded-lg border p-2 text-left transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border bg-gray-50 hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCartItemSelection(index)}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-3 h-4 w-4 rounded border-gray-300 accent-primary"
                      aria-label={`Select ${item.name}`}
                    />
                    <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.name}</p>
                      <p className="mb-0.5 max-w-full truncate font-mono text-[10px] leading-tight text-gray-500" title={`SKU/Barcode: ${item.code}`}>{item.code}</p>
                      <div className="flex gap-1 mb-1 flex-wrap">
                        {item.size && (
                          <span className="text-xs bg-white px-1 py-0.5 rounded border">{item.size}</span>
                        )}
                        {item.color && (
                          <span className="text-xs bg-white px-1 py-0.5 rounded border">{item.color}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">₱ {item.price.toFixed(2)} each</p>
                      <p className="text-xs text-primary font-medium">₱ {(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            updateQuantity(index, item.quantity - 1);
                          }}
                          className="w-5 h-5 rounded bg-white border hover:bg-gray-100 flex items-center justify-center"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs w-6 text-center">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            updateQuantity(index, item.quantity + 1);
                          }}
                          className="w-5 h-5 rounded bg-white border hover:bg-gray-100 flex items-center justify-center"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeletingCartItem({ index, name: item.name });
                        }}
                        className="w-5 h-5 rounded bg-white border border-red-200 hover:bg-red-50 flex items-center justify-center text-red-600"
                        title="Remove item"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>

        <div className="mt-auto">
        <label className="mb-4 flex items-center gap-2 border-b border-border pb-4 text-sm">
          <input
            type="checkbox"
            checked={useWholesalePricing}
            onChange={(event) => setUseWholesalePricing(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-primary"
          />
          <span>Check for Wholesale Pricing</span>
        </label>

        <div className="space-y-1.5 mb-4 text-xs">
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
          {settings.enable_discount && (
          <div className="border-t border-border pt-2 mt-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-muted-foreground">Discount:</span>
              <button
                onClick={() => setShowDiscountModal(true)}
                className="text-xs text-primary hover:underline"
              >
                {discount > 0 ? 'Edit' : 'Add Discount'}
              </button>
            </div>
            {discount > 0 ? (
              <div className="flex justify-between text-destructive text-xs">
                <span>
                  {selectedDiscountName} ({selectedDiscountRate}%)
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
        </div>

        {validationError && (
          <div className="mb-3 bg-destructive/10 border border-destructive/20 rounded-lg p-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-xs text-destructive">{validationError}</p>
          </div>
        )}

        <button
          onClick={handlePreviewOrder}
          className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Proceed to Checkout
        </button>
        </div>
      </div>
      </div>

      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-base font-semibold">Void Items</h2>
              <button
                type="button"
                onClick={() => {
                  setShowVoidModal(false);
                  setVoidAuthorizationError('');
                  setVoidPasscode('');
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close void items"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 pb-5">
              <p className="mb-3 text-xs text-muted-foreground">Select item(s) to void:</p>
              <div className="mb-5 space-y-3 text-sm">
                <label className="flex items-center gap-3 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={allCartItemsSelected}
                    onChange={toggleAllCartItems}
                    className="h-4 w-4 rounded border-gray-300 accent-primary"
                  />
                  Select All
                </label>
                {cart.map((item, index) => (
                  <label key={`void-${index}`} className="grid grid-cols-[20px_24px_1fr_auto] items-center gap-3 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedCartItemSet.has(index)}
                      onChange={() => toggleCartItemSelection(index)}
                      className="h-4 w-4 rounded border-gray-300 accent-primary"
                    />
                    <span>{index + 1}</span>
                    <span className="font-medium">{item.name}</span>
                    <span>{(item.price * item.quantity).toFixed(2)}</span>
                  </label>
                ))}
                {cart.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Cart is empty.
                  </p>
                )}
              </div>

              <label className="mb-2 block text-xs text-muted-foreground">Enter passcode to void selected item(s):</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={voidPasscode}
                onChange={(event) => setVoidPasscode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mb-4 h-12 w-full rounded-lg border border-border px-4 text-center text-xl tracking-[0.8em] focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Void passcode"
              />
              {voidAuthorizationError && (
                <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {voidAuthorizationError}
                </p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowVoidModal(false);
                    setVoidAuthorizationError('');
                    setVoidPasscode('');
                  }}
                  className="rounded-lg border border-border px-8 py-2 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={voidSelectedCartItems}
                  disabled={selectedCartItemCount === 0 || isVoidSubmitting}
                  className="rounded-lg bg-red-500 px-8 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isVoidSubmitting ? 'Authorizing...' : 'Void Selected'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Variant Picker Modal */}
      {selectedProductGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-border flex-shrink-0">
              <div>
                <h2 className="text-lg text-primary">{selectedProductGroup.name}</h2>
                <p className="text-xs text-muted-foreground">{selectedProductGroup.variants.length} variants available</p>
              </div>
              <button onClick={() => setSelectedProductGroup(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="space-y-2">
                {selectedProductGroup.variants.map((variant) => (
                  <button
                    key={`${variant.id}-${variant.variantId}`}
                    onClick={() => {
                      addToCart(variant);
                      setSelectedProductGroup(null);
                    }}
                    disabled={variant.stockQuantity !== undefined && variant.stockQuantity <= 0}
                    className="w-full border border-border rounded-lg p-3 text-left hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        <img src={variant.image} alt={variant.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{variant.name}</p>
                            <p className="font-mono text-[10px] text-gray-500 truncate">{variant.code}</p>
                          </div>
                          <p className="text-sm font-medium text-primary flex-shrink-0">PHP {variant.price.toFixed(2)}</p>
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {variant.size && <span className="text-xs bg-white px-1.5 py-0.5 rounded border">Size: {variant.size}</span>}
                          {variant.color && <span className="text-xs bg-white px-1.5 py-0.5 rounded border">{variant.color}</span>}
                          {variant.stockQuantity !== undefined && (
                            <span className="text-xs bg-white px-1.5 py-0.5 rounded border">{Math.trunc(variant.stockQuantity)} stock</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl my-8 max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-border flex-shrink-0">
              <h2 className="text-lg text-primary">Order Preview</h2>
              <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <div className="mb-4 space-y-1">
                <p className="text-sm"><strong>Transaction #:</strong> RET-{currentTransactionNumber}</p>
                <p className="text-sm"><strong>Customer:</strong> {customerName.trim() || 'Walk-in Customer'}</p>
              </div>

              <h3 className="text-sm font-medium mb-2">Items:</h3>
              <div className="space-y-2 mb-4">
                {cart.map((item, index) => (
                  <div key={`preview-${index}`} className="border border-border rounded-lg p-3 bg-gray-50">
                    <div className="flex justify-between mb-1">
                      <p className="text-sm font-medium">{item.name} x{item.quantity}</p>
                      <p className="text-sm font-medium">₱{(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                    <div className="flex gap-1">
                      {item.size && <span className="text-xs bg-white px-2 py-0.5 rounded">Size: {item.size}</span>}
                      {item.color && <span className="text-xs bg-white px-2 py-0.5 rounded">{item.color}</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₱{subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Discount:</span>
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
              <button onClick={() => setShowPreview(false)} className="flex-1 px-6 py-2.5 border border-border rounded-lg hover:bg-muted transition-colors text-sm font-medium">
                Back to Edit
              </button>
              <button onClick={handleConfirmOrder} className="flex-1 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all text-sm font-semibold">
                Proceed to Payment
              </button>
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
              <button onClick={() => setShowPayment(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div className="mb-4">
                <p className="text-sm mb-2"><strong>Order Number:</strong> RET-{currentTransactionNumber}</p>
                <p className="text-sm mb-2"><strong>Customer:</strong> {customerName.trim() || 'Walk-in Customer'}</p>
                <div className="bg-muted rounded-lg p-3 mb-3">
                  <h4 className="text-xs font-medium mb-2">Ordered Items:</h4>
                  <div className="space-y-1">
                    {cart.map((item, idx) => (
                      <div key={idx} className="flex justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate">
                          {item.quantity}x {item.name}
                          {(item.size || item.color) && (
                            <span className="text-muted-foreground"> {item.size ? `| ${item.size}` : ''}{item.color ? ` · ${item.color}` : ''}</span>
                          )}
                        </span>
                        <span className="shrink-0">₱{(item.price * item.quantity).toFixed(2)}</span>
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
                  {enabledPaymentMethods.map(method => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`px-4 py-2 rounded-lg border transition-colors text-sm ${
                        paymentMethod === method
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'Cash' && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Cash Received</label>
                    <input
                      type="number"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full px-4 py-3 border border-border rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                    />
                  </div>

                  {cashAmount && parseFloat(cashAmount) >= total && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-muted-foreground mb-1">Change</p>
                      <p className="text-2xl text-green-600 font-medium">₱ {(parseFloat(cashAmount) - total).toFixed(2)}</p>
                    </div>
                  )}
                </>
              )}

              {paymentMethod !== 'Cash' && selectedPaymentAccount && (
                <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                  {selectedPaymentAccount.qr_image && <img src={selectedPaymentAccount.qr_image} alt={`${paymentMethod} QR code`} className="mb-3 h-40 w-40 rounded-lg border border-border bg-white object-contain p-2" />}
                  {selectedPaymentAccount.account_name && <p><span className="font-medium">Account Name:</span> {selectedPaymentAccount.account_name}</p>}
                  {selectedPaymentAccount.account_number && <p><span className="font-medium">Account Details:</span> {selectedPaymentAccount.account_number}</p>}
                  {selectedPaymentAccount.instructions && <p className="mt-2 text-muted-foreground">{selectedPaymentAccount.instructions}</p>}
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
                  {isPaymentSubmitting ? 'Processing...' : 'Complete Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && completedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="overflow-y-auto flex-1">
              <ThermalReceipt
                orderNumber={completedOrder.transactionNumber || completedOrder.id || 'N/A'}
                customerName={completedOrder.customer || 'Walk-in Customer'}
                items={completedOrder.items || []}
                subtotal={completedOrder.subtotal || 0}
                serviceFee={completedOrder.serviceFee || 0}
                tax={completedOrder.tax || 0}
                discount={completedOrder.discount || 0}
                discountType={completedOrder.discountType}
                total={completedOrder.amountNumber || 0}
                cashReceived={completedOrder.cashReceived}
                changeGiven={completedOrder.changeGiven}
                paymentMethod={completedOrder.paymentMethod}
                date={completedOrder.date}
                time={completedOrder.time}
                receiptId={completedOrder.receiptId}
                paymentId={completedOrder.paymentId}
                cashier={completedOrder.cashier}
                storeBrand={storeBrand}
              />
            </div>
            <div className="p-4 border-t border-border flex gap-3 bg-white">
              <button
                onClick={handleContinueFromReceipt}
                className="flex-1 px-4 py-2.5 border border-border rounded-lg hover:bg-muted transition-colors text-sm"
              >
                Continue
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && completedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl text-primary mb-2">Payment Successful!</h2>
              <p className="text-sm text-muted-foreground mb-6">Transaction has been completed successfully.</p>

              <button
                onClick={handleSuccessClose}
                className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
              >
                New Transaction
              </button>
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
              <button onClick={() => setShowDiscountModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <div className="space-y-3">
                <label className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted">
                  <input
                    type="radio"
                    name="discount"
                    value="none"
                    checked={discountType === 'none'}
                    onChange={() => setDiscountType('none')}
                    className="accent-primary"
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
                      onChange={() => setDiscountType(String(discountSetting.id))}
                      className="accent-primary"
                    />
                    <span className="text-sm">{discountSetting.discount_name} - {Number(discountSetting.discount_rate).toFixed(2)}%</span>
                  </label>
                ))}

                {false && discountType === 'custom' && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium mb-2">Discount Percentage</label>
                    <input
                      type="number"
                      value={customDiscountPercent}
                      onChange={(e) => setCustomDiscountPercent(Math.max(0, Math.min(100, Number(e.target.value))))}
                      placeholder="0-100"
                      max="100"
                      min="0"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                )}
              </div>
              <button onClick={() => setShowDiscountModal(false)} className="w-full mt-4 bg-primary text-primary-foreground py-2.5 rounded-lg hover:bg-primary/90 transition-colors text-sm">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmDialog
        isOpen={Boolean(deletingCartItem)}
        title="Confirm Delete"
        description={`Are you sure you want to delete ${deletingCartItem?.name ?? 'this item'} from the order?`}
        onCancel={() => setDeletingCartItem(null)}
        onConfirm={() => {
          if (deletingCartItem) removeItem(deletingCartItem.index);
        }}
      />
    </div>
  );
}



