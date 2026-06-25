import { useState, useEffect } from "react";
import { Plus, Search, Filter, Eye, Download, CheckCircle, Clock, XCircle, X, Save, Trash2, Edit, Building2, Users, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "../../app/hooks/useSession";
import { PurchaseOrderItemInput, PurchaseOrderItemInputValue } from "./PurchaseOrderItemInput";
import {
  useApproveRestaurantPurchaseOrderMutation,
  useCancelRestaurantPurchaseOrderMutation,
  useCreateRestaurantSupplierMutation,
  useRejectRestaurantPurchaseOrderMutation,
  useRestaurantGlobalProductsQuery,
  useRestaurantPurchaseOrdersQuery,
  useRestaurantSuppliersQuery,
  useRestaurantUsersQuery,
  useSaveRestaurantPurchaseOrderMutation,
} from "../lib/restaurant";
import {
  EXPECTED_DELIVERY_TIME_WINDOW_LABEL,
  formatExpectedDelivery,
  getExpectedDeliveryTimeWindowError,
  getDeliveryDelayLabel,
  isPurchaseOrderDelayed,
} from "../lib/purchaseOrderDelivery";
import { SuppliersManager } from "../shared/suppliers/SuppliersManager";

// Helper function to normalize product names (capitalize first letter of each word, trim)
const normalizeProductName = (name: string | undefined): string => {
  return (name || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const blankOrderItemInput = (): OrderItemInput => ({
  productId: undefined,
  inventoryId: undefined,
  sku: "",
  productName: "",
  category: "",
  subCategory: "",
  unit: "",
  quantity: "",
  unitPrice: "",
  isNewProduct: false,
  unitOverride: false,
});

type OrderItem = {
  productId?: string;
  inventoryId?: number;
  sku?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  category: string;
  subCategory: string;
  unit: string;
};

type Order = {
  id: string;
  backendId?: string;
  supplier: string;
  date: string;
  items: number;
  orderItems: OrderItem[];
  total: number;
  status: string;
  expectedDelivery: string;
  createdByUserId?: number;
  createdBy?: string;
  createdByRole?: string;
  createdAt?: string;
  rejectionNote?: string;
  rejectedBy?: string;
  rejectedAt?: string;
};

type OrderItemInput = PurchaseOrderItemInputValue;

type GlobalProduct = {
  id: string;
  backendId?: string;
  inventoryId?: number;
  name: string;
  sku?: string;
  category?: string;
  subCategory?: string;
  unit?: string;
};

type SupplierProduct = {
  supplierId: string;
  productId: string;
  price: number;
};

type Product = {
  name: string;
  price: number;
};

type Supplier = {
  id?: string;
  backendId?: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  products: Product[];
};

type GoodsItem = {
  id: string;
  poId: string;
  supplier: string;
  receivedDate: string;
  items: number;
  receivedItems?: Array<OrderItem & { condition: string }>;
  totalValue: number;
  receivedBy: string;
  status: string;
  notes: string;
};

type UserSummary = {
  id: number;
  name: string;
  email: string;
  role: string;
};

const getOrderCreator = (order: Order, users: UserSummary[]) => {
  if (order.createdByRole === "admin") return "Admin";

  const byId = typeof order.createdByUserId === "number"
    ? users.find((user) => user.id === order.createdByUserId)
    : undefined;
  if (byId) return byId.name;

  const byEmail = order.createdBy
    ? users.find((user) => (user.email || '').toLowerCase() === (order.createdBy || '').toLowerCase())
    : undefined;
  if (byEmail) return byEmail.name;

  return order.createdBy || "Legacy / Unknown user";
};

const getOrderCreatorRole = (order: Order) => order.createdByRole || "unknown";

export function PurchaseOrders() {
  const { currentUser: sessionUser } = useSession();
  const userRole = sessionUser?.role === "Admin" ? "admin" : "staff";
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSuppliersListModal, setShowSuppliersListModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<Order | null>(null);
  const [approvingOrder, setApprovingOrder] = useState<Order | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (sessionStorage.getItem('po-open-approval') === 'true') {
      sessionStorage.removeItem('po-open-approval');
      setShowApprovalModal(true);
    }
  }, []);

  const [newOrder, setNewOrder] = useState({
    supplier: "",
    expectedDelivery: "",
  });
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [currentItem, setCurrentItem] = useState<OrderItemInput>(blankOrderItemInput());

  const { data: globalProducts = [] } = useRestaurantGlobalProductsQuery();
  const { data: orders = [] } = useRestaurantPurchaseOrdersQuery<Order[]>();
  const { data: users = [] } = useRestaurantUsersQuery();

  const statuses = ["all", "pending", "approved", "received", "partial", "rejected", "cancelled"];

  const filteredOrders = orders.filter(order => {
    const matchesSearch = (order.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (order.supplier || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: { bg: "#FEF3C7", text: "#92400E", border: "#F59E0B" },
      approved: { bg: "#D1F2E8", text: "#007A5E", border: "#008967" },
      received: { bg: "#D1F2E8", text: "#007A5E", border: "#008967" },
      completed: { bg: "#D1F2E8", text: "#007A5E", border: "#008967" },
      partial: { bg: "#FED7AA", text: "#9A3412", border: "#F59E0B" },
      rejected: { bg: "#FEE2E2", text: "#991B1B", border: "#DC2626" },
      cancelled: { bg: "#FEE2E2", text: "#991B1B", border: "#DC2626" },
    };
    const icons = {
      pending: Clock,
      approved: CheckCircle,
      received: CheckCircle,
      completed: CheckCircle,
      partial: AlertCircle,
      rejected: XCircle,
      cancelled: XCircle,
    };
    const Icon = icons[status as keyof typeof icons];
    const style = styles[status as keyof typeof styles];

    if (!Icon || !style) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium border inline-flex items-center gap-1" style={{ backgroundColor: "#E5E7EB", color: "#374151", borderColor: "#9CA3AF" }}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
    }

    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium border inline-flex items-center gap-1" style={{ backgroundColor: style.bg, color: style.text, borderColor: style.border }}>
        <Icon className="w-5 h-5" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getDeliveryDelayBadge = (order: Order) => {
    if (!isPurchaseOrderDelayed(order.expectedDelivery, order.status, now)) return null;
    const delayLabel = getDeliveryDelayLabel(order.expectedDelivery, now);

    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium border inline-flex items-center gap-1" style={{ backgroundColor: "#FEE2E2", color: "#991B1B", borderColor: "#DC2626" }}>
        <AlertCircle className="w-5 h-5" />
        Delayed: {delayLabel}
      </span>
    );
  };

  const stats = [
    { label: "Total Orders", value: orders.length, color: "#009BA5", status: "all" },
    { label: "Pending", value: orders.filter(o => o.status === "pending").length, color: "#F59E0B", status: "pending" },
    { label: "Approved", value: orders.filter(o => o.status === "approved").length, color: "#007A5E", status: "approved" },
    { label: "Partial", value: orders.filter(o => o.status === "partial").length, color: "#F59E0B", status: "partial" },
    { label: "Rejected", value: orders.filter(o => o.status === "rejected").length, color: "#DC2626", status: "rejected" },
    { label: "Received", value: orders.filter(o => o.status === "received").length, color: "#007A5E", status: "received" },
  ];

  // Cards toggle the shared status filter that drives the orders table below;
  // clicking the active card (or Total Orders) clears it back to "all".
  const toggleStatusFilter = (status: string) => {
    setStatusFilter((current) => (current === status ? "all" : status));
  };

  const { data: suppliers = [] } = useRestaurantSuppliersQuery();
  const saveOrder = useSaveRestaurantPurchaseOrderMutation();
  const approveOrder = useApproveRestaurantPurchaseOrderMutation();
  const rejectOrder = useRejectRestaurantPurchaseOrderMutation();
  const cancelOrder = useCancelRestaurantPurchaseOrderMutation();
  const addSupplier = useCreateRestaurantSupplierMutation();

  // Get available products from selected supplier
  const availableProducts = newOrder.supplier
    ? suppliers.find(s => s.name === newOrder.supplier)?.products || []
    : [];

  const productDatabase = [...globalProducts];

  const handleCreateNewProduct = (payload: {
    name: string;
    sku?: string;
    category: string;
    subCategory: string;
    unit: string;
  }) => {
    const normalized = normalizeProductName(payload.name);

    const existingProduct = globalProducts.find(
      (product) => normalizeProductName(product.name) === normalized,
    );
    if (existingProduct) {
      return existingProduct;
    }

    const productId = `gp-${Date.now()}`;
    const newProduct: GlobalProduct = {
      id: productId,
      name: normalized,
      sku: payload.sku?.trim(),
      category: payload.category || "Other",
      subCategory: payload.subCategory,
      unit: payload.unit || "pcs",
    };

    return newProduct;
  };

  const handleAddItem = () => {
if (!currentItem.productName.trim() || !currentItem.quantity.trim() || !currentItem.unitPrice.trim() || !currentItem.unit.trim()) {
      return;
    }

    let productId = currentItem.productId;
    let inventoryId = currentItem.inventoryId;
    let category = currentItem.category;
    let subCategory = currentItem.subCategory;
    let unit = currentItem.unit;

    if (currentItem.isNewProduct || !productId) {
      const created = handleCreateNewProduct({
        name: currentItem.productName,
        sku: currentItem.sku,
        category: currentItem.category || "Other",
        subCategory: currentItem.subCategory,
        unit: currentItem.unit || "pcs",
      });
      productId = created.id;
      inventoryId = created.inventoryId;
      category = created.category || "Other";
      subCategory = created.subCategory || "General";
      unit = created.unit || "pcs";
    }

    const newItem: OrderItem = {
      productId,
      inventoryId,
      sku: currentItem.sku?.trim(),
      productName: normalizeProductName(currentItem.productName),
      quantity: parseInt(currentItem.quantity, 10),
      unitPrice: parseFloat(currentItem.unitPrice),
      category: category || "",
      subCategory: subCategory || "",
      unit: unit || "",
    };

    setOrderItems([...orderItems, newItem]);
    setCurrentItem(blankOrderItemInput());
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (orderItems.length === 0) {
      toast.error("Please add at least one item to the order");
      return;
    }
    const deliveryTimeError = getExpectedDeliveryTimeWindowError(newOrder.expectedDelivery);
    if (deliveryTimeError) {
      toast.error(deliveryTimeError);
      return;
    }

    try {
      const supplier = suppliers.find((item) => item.name === newOrder.supplier);
      const supplierId = supplier?.backendId ?? supplier?.id;
      if (!supplierId) throw new Error("Select a supplier saved in the database");

      await saveOrder.mutateAsync({
        supplierId,
        expectedDelivery: newOrder.expectedDelivery,
        items: orderItems,
        products: globalProducts,
      });
      setShowCreateModal(false);
      setNewOrder({ supplier: "", expectedDelivery: "" });
      setOrderItems([]);
      setCurrentItem(blankOrderItemInput());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create purchase order");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    // If supplier is being changed, clear the order items and current item
    if (name === "supplier" && value !== newOrder.supplier) {
      setOrderItems([]);
      setCurrentItem(blankOrderItemInput());
    }

    setNewOrder({
      ...newOrder,
      [name]: value,
    });
  };

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setShowViewModal(true);
  };

  const handleDownload = (order: Order) => {
    // Generate CSV content
    let csvContent = "Purchase Order Details\n\n";
    csvContent += `Order ID:,${order.id}\n`;
    csvContent += `Supplier:,${order.supplier}\n`;
    csvContent += `Created By:,${getOrderCreator(order, users)}\n`;
    csvContent += `Creator User ID:,${order.createdByUserId ?? "N/A"}\n`;
    csvContent += `Creator Role:,${getOrderCreatorRole(order)}\n`;
    csvContent += `Created At:,${order.createdAt || order.date}\n`;
    csvContent += `Order Date:,${order.date}\n`;
    csvContent += `Expected Delivery:,${formatExpectedDelivery(order.expectedDelivery)}\n`;
    csvContent += `Status:,${order.status}\n\n`;
    if (order.rejectionNote) {
      csvContent += `Rejection Note:,${order.rejectionNote}\n`;
      csvContent += `Rejected By:,${order.rejectedBy || "Admin"}\n`;
      csvContent += `Rejected At:,${order.rejectedAt || "N/A"}\n\n`;
    }
    csvContent += "Items:\n";
    csvContent += "Product Name,Quantity,Unit,Unit Price,Total\n";

    order.orderItems.forEach(item => {
      const itemTotal = item.quantity * item.unitPrice;
      csvContent += `${item.productName},${item.quantity},${item.unit},${item.unitPrice.toFixed(2)},${itemTotal.toFixed(2)}\n`;
    });

    csvContent += `\nTotal Order Value:,₱${order.total.toFixed(2)}\n`;

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${order.id}_PurchaseOrder.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApproveOrder = async (order: Order) => {
    try {
      await approveOrder.mutateAsync(order.backendId ?? order.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve purchase order");
    }
  };

  const handleRejectOrder = async () => {
    const orderToReject = rejectingOrder || approvingOrder;
    if (!orderToReject) return;

    const trimmedNote = rejectionNote.trim();
    if (!trimmedNote) {
      toast.error("Please enter a rejection note before rejecting this order.");
      return;
    }

    try {
      await rejectOrder.mutateAsync({
        id: orderToReject.backendId ?? orderToReject.id,
        reason: trimmedNote,
      });
      setShowRejectModal(false);
      setRejectingOrder(null);
      setApprovingOrder(null);
      setRejectionNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject purchase order");
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      await cancelOrder.mutateAsync(orderId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel purchase order");
    }
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrder(order);
    setNewOrder({
      supplier: order.supplier,
      expectedDelivery: order.expectedDelivery,
    });
    setOrderItems([...order.orderItems]);
    setShowEditModal(true);
  };

  const handleUpdateOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (orderItems.length === 0) {
      toast.error("Please add at least one item to the order");
      return;
    }

    if (!editingOrder) return;
    const deliveryTimeError = getExpectedDeliveryTimeWindowError(newOrder.expectedDelivery);
    if (deliveryTimeError) {
      toast.error(deliveryTimeError);
      return;
    }

    try {
      const supplier = suppliers.find((item) => item.name === newOrder.supplier);
      const supplierId = supplier?.backendId ?? supplier?.id;
      if (!supplierId) throw new Error("Select a supplier saved in the database");

      await saveOrder.mutateAsync({
        editingId: editingOrder.backendId ?? editingOrder.id,
        supplierId,
        expectedDelivery: newOrder.expectedDelivery,
        items: orderItems,
        products: globalProducts,
      });
      setShowEditModal(false);
      setEditingOrder(null);
      setNewOrder({ supplier: "", expectedDelivery: "" });
      setOrderItems([]);
      setCurrentItem(blankOrderItemInput());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update purchase order");
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Purchase Orders</h1>
          <p className="text-muted-foreground text-sm hidden">Manage and track all purchase orders</p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0">
          <button
            onClick={() => setShowSuppliersListModal(true)}
            className="px-6 py-3 bg-muted text-foreground rounded-2xl hover:bg-muted/80 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-sm transition-all duration-200 flex items-center gap-2 border border-border"
          >
            <Users className="w-5 h-5" />
            View Suppliers
          </button>
          {userRole === "admin" && (
            <button
              onClick={() => setShowApprovalModal(true)}
              className="px-6 py-3 bg-muted text-foreground rounded-2xl hover:bg-muted/80 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-sm transition-all duration-200 flex items-center gap-2 border border-border relative"
            >
              <Clock className="w-5 h-5" />
              Pending Approval
              {orders.filter(o => o.status === "pending").length > 0 && (
                <span className="absolute -top-2 -right-2 bg-primary text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                  {orders.filter(o => o.status === "pending").length}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-2xl hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-md transition-all duration-200 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create New Order
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => {
          const isActive = statusFilter === stat.status;
          return (
            <button
              type="button"
              key={index}
              onClick={() => toggleStatusFilter(stat.status)}
              aria-pressed={isActive}
              aria-label={`Filter by ${stat.label}`}
              className={`group text-left w-full bg-card rounded-2xl p-6 shadow-sm border cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/25 hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-lg active:shadow-primary/30 ${
                isActive ? "border-primary bg-primary/5 shadow-md shadow-primary/20" : "border-border"
              }`}
            >
              <p className="text-muted-foreground text-sm mb-1">{stat.label}</p>
              <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
            </button>
          );
        })}
      </div>

      {/* Search and Filter */}
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-border mb-8">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by order ID or supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-input-background border border-input rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-12 pr-8 py-3 bg-input-background border border-input rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer min-w-[200px]"
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All Status" : status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Order ID</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Supplier</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Created By</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Date</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Items</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Total</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Expected Delivery</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Status</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-medium text-primary">{order.id}</span>
                  </td>
                  <td className="px-6 py-4 text-foreground">{order.supplier}</td>
                  <td className="px-6 py-4">
                    <div className="min-w-[150px]">
                      <p className="text-sm font-medium text-foreground break-words">{getOrderCreator(order, users)}</p>
                      <p className="text-xs text-muted-foreground">ID: {order.createdByUserId ?? "N/A"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{getOrderCreatorRole(order)}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{order.date}</td>
                  <td className="px-6 py-4 text-foreground">{order.items}</td>
                  <td className="px-6 py-4 text-foreground font-medium">₱{order.total.toLocaleString()}</td>
                  <td className="px-6 py-4 text-muted-foreground">{formatExpectedDelivery(order.expectedDelivery)}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-start gap-2">
                      {getStatusBadge(order.status)}
                      {getDeliveryDelayBadge(order)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewDetails(order)}
                        className="p-2 hover:bg-blue-50 text-blue-600 rounded-xl transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditOrder(order)}
                        className={`p-2 rounded-xl transition-colors ${
                          order.status === "received" || order.status === "cancelled" || order.status === "rejected"
                            ? "text-muted-foreground cursor-not-allowed opacity-50"
                            : "hover:bg-orange-50 text-orange-600"
                        }`}
                        title={order.status === "received" || order.status === "cancelled" || order.status === "rejected" ? "Cannot edit received, cancelled, or rejected orders" : "Edit Order"}
                        disabled={order.status === "received" || order.status === "cancelled" || order.status === "rejected"}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(order)}
                        className="p-2 hover:bg-green-50 text-green-600 rounded-xl transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {order.status === "pending" && userRole !== "admin" && (
                        <button
                          onClick={() => handleCancelOrder(order.id)}
                          className="p-2 hover:bg-red-50 text-red-600 rounded-xl transition-colors"
                          title="Cancel Order"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Create New Order</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4 max-h-[70vh] overflow-y-auto">
              {userRole === "staff" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900 mb-1">Admin Approval Required</p>
                      <p className="text-xs text-amber-800">
                        Purchase orders you create will be submitted for admin approval before processing.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="supplier" className="block text-sm mb-2 text-foreground">
                  Supplier *
                </label>
                <select
                  id="supplier"
                  name="supplier"
                  value={newOrder.supplier}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                  required
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((sup) => (
                    <option key={sup.name} value={sup.name}>
                      {sup.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="expectedDelivery" className="block text-sm mb-2 text-foreground">
                  Expected Delivery Date and Time *
                </label>
                <input
                  id="expectedDelivery"
                  name="expectedDelivery"
                  type="datetime-local"
                  value={newOrder.expectedDelivery}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Delivery time must be between {EXPECTED_DELIVERY_TIME_WINDOW_LABEL}.
                </p>
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Add Items</h3>

                <PurchaseOrderItemInput
                  supplierName={newOrder.supplier}
                  productDatabase={productDatabase}
                  supplierProducts={availableProducts}
                  value={currentItem}
                  onChange={setCurrentItem}
                  onAddItem={handleAddItem}
                />
              </div>

              {orderItems.length > 0 && (
                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Order Items ({orderItems.length})</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {orderItems.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit} × ₱{item.unitPrice.toFixed(2)} = ₱{(item.quantity * item.unitPrice).toFixed(2)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="p-1 hover:bg-red-100 text-red-600 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-foreground">Total:</span>
                      <span className="text-lg font-bold text-primary">₱{calculateTotal().toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-border">
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  Save Order
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setOrderItems([]);
                    setCurrentItem(blankOrderItemInput());
                  }}
                  className="flex-1 px-4 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Order Details Modal */}
      {showViewModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowViewModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Purchase Order Details</h2>
                <p className="text-sm text-muted-foreground mt-1">{selectedOrder.id}</p>
              </div>
              <button
                onClick={() => setShowViewModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Order Information */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Supplier</p>
                    <p className="text-lg font-semibold text-foreground">{selectedOrder.supplier}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Order Date</p>
                    <p className="text-foreground">{selectedOrder.date}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Expected Delivery</p>
                    <p className="text-foreground">{formatExpectedDelivery(selectedOrder.expectedDelivery)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Created By</p>
                    <p className="font-medium text-foreground break-words">{getOrderCreator(selectedOrder, users)}</p>
                    <p className="text-xs text-muted-foreground">User ID: {selectedOrder.createdByUserId ?? "N/A"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{getOrderCreatorRole(selectedOrder)}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Status</p>
                    <div className="flex flex-col items-start gap-2">
                      {getStatusBadge(selectedOrder.status)}
                      {getDeliveryDelayBadge(selectedOrder)}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Items</p>
                    <p className="text-foreground">{selectedOrder.items} items</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Value</p>
                    <p className="text-2xl font-bold text-primary">₱{selectedOrder.total.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {selectedOrder.status === "rejected" && selectedOrder.rejectionNote && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-3">
                    <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-700" />
                    <div>
                      <p className="text-sm font-semibold text-red-900">Rejection Remarks</p>
                      <p className="mt-1 text-sm text-red-800">{selectedOrder.rejectionNote}</p>
                      <p className="mt-2 text-xs text-red-700">
                        Rejected by {selectedOrder.rejectedBy || "Admin"}
                        {selectedOrder.rejectedAt ? ` on ${new Date(selectedOrder.rejectedAt).toLocaleString()}` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Order Items Table */}
              <div className="border-t border-border pt-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Order Items</h3>
                <div className="bg-muted/30 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Product Name</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Quantity</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Unit</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Unit Price</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedOrder.orderItems.map((item, index) => (
                        <tr key={index} className="hover:bg-muted/20">
                          <td className="px-4 py-3 text-foreground">{item.productName}</td>
                          <td className="px-4 py-3 text-right text-foreground">{item.quantity}</td>
                          <td className="px-4 py-3 text-left text-foreground">{item.unit}</td>
                          <td className="px-4 py-3 text-right text-foreground">₱{item.unitPrice.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-medium text-foreground">
                            ₱{(item.quantity * item.unitPrice).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/50 border-t border-border">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-right font-semibold text-foreground">
                          Grand Total:
                        </td>
                        <td className="px-4 py-3 text-right text-xl font-bold text-primary">
                          ₱{selectedOrder.total.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-border">
                <button
                  onClick={() => handleDownload(selectedOrder)}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download Order
                </button>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Order Modal */}
      {showRejectModal && (rejectingOrder || approvingOrder) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowRejectModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">Reject Purchase Order</h2>
                <p className="text-sm text-muted-foreground mt-1">{(rejectingOrder || approvingOrder)!.id} - {(rejectingOrder || approvingOrder)!.supplier}</p>
                <p className="text-xs text-muted-foreground mt-1">Created by {getOrderCreator((rejectingOrder || approvingOrder)!, users)}</p>
              </div>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectingOrder(null);
                  setApprovingOrder(null);
                  setRejectionNote("");
                }}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl p-4 mb-4" style={{ border: "1px solid #FCA5A5", backgroundColor: "#FEE2E2" }}>
              <p className="text-sm" style={{ color: "#991B1B" }}>
                Add the reason why this PO is rejected. This note will be saved with the order for admin review and audit trail.
              </p>
            </div>

            <label htmlFor="rejectionNote" className="block text-sm font-semibold text-foreground mb-2">
              Rejection remarks *
            </label>
            <textarea
              id="rejectionNote"
              value={rejectionNote}
              onChange={(event) => setRejectionNote(event.target.value)}
              placeholder="Example: Supplier price mismatch, duplicate order, wrong quantity, missing approval document..."
              className="min-h-[130px] w-full rounded-xl border border-input bg-input-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />

            <div className="flex gap-3 pt-5">
              <button
                type="button"
                onClick={handleRejectOrder}
                className="flex-1 px-6 py-3 text-white rounded-xl transition-all duration-200 font-semibold"
                style={{ backgroundColor: "#DC2626" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#B91C1C")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#DC2626")}
              >
                Reject Order
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectingOrder(null);
                  setApprovingOrder(null);
                  setRejectionNote("");
                }}
                className="px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {showEditModal && editingOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">Edit Purchase Order</h2>
                <p className="text-sm text-muted-foreground mt-1">{editingOrder.id}</p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateOrder} className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label htmlFor="edit-supplier" className="block text-sm mb-2 text-foreground">
                  Supplier *
                </label>
                <select
                  id="edit-supplier"
                  name="supplier"
                  value={newOrder.supplier}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer"
                  required
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((sup) => (
                    <option key={sup.name} value={sup.name}>
                      {sup.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="edit-expectedDelivery" className="block text-sm mb-2 text-foreground">
                  Expected Delivery Date and Time *
                </label>
                <input
                  id="edit-expectedDelivery"
                  name="expectedDelivery"
                  type="datetime-local"
                  value={newOrder.expectedDelivery}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Delivery time must be between {EXPECTED_DELIVERY_TIME_WINDOW_LABEL}.
                </p>
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Add Items</h3>

                <PurchaseOrderItemInput
                  supplierName={newOrder.supplier}
                  productDatabase={productDatabase}
                  supplierProducts={availableProducts}
                  value={currentItem}
                  onChange={setCurrentItem}
                  onAddItem={handleAddItem}
                />
              </div>

              {orderItems.length > 0 && (
                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Order Items ({orderItems.length})</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {orderItems.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit} × ₱{item.unitPrice.toFixed(2)} = ₱{(item.quantity * item.unitPrice).toFixed(2)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="p-1 hover:bg-red-100 text-red-600 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-foreground">Total:</span>
                      <span className="text-lg font-bold text-primary">₱{calculateTotal().toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-border">
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  Update Order
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingOrder(null);
                    setOrderItems([]);
                    setCurrentItem(blankOrderItemInput());
                  }}
                  className="flex-1 px-4 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Suppliers directory + add form handled by the shared <SuppliersManager/> */}
      <SuppliersManager
        open={showSuppliersListModal}
        onClose={() => setShowSuppliersListModal(false)}
        suppliers={suppliers.map((s) => ({
          id: s.backendId ?? s.id,
          name: s.name,
          contactPerson: s.contact,
          email: s.email,
          phone: s.phone,
          address: s.address,
        }))}
        fields={[
          { key: 'name', label: 'Supplier Name', required: true, placeholder: 'e.g., Fresh Farms Co.' },
          { key: 'contactPerson', label: 'Contact Person', required: true, placeholder: 'e.g., John Doe' },
          { key: 'email', label: 'Email', required: true, placeholder: 'e.g., contact@supplier.com' },
          { key: 'phone', label: 'Phone', required: true, placeholder: 'e.g., +1 234 567 8900' },
          { key: 'address', label: 'Address', required: true, type: 'textarea', placeholder: 'e.g., 123 Farm Road, City' },
        ]}
        onCreate={async (payload) => {
          await addSupplier.mutateAsync({
            name: payload.name,
            contactPerson: payload.contactPerson,
            email: payload.email,
            phone: payload.phone,
            address: payload.address,
          });
          setNewOrder((prev) => ({ ...prev, supplier: payload.name }));
        }}
      />

      {/* Pending Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-border bg-gradient-to-r from-primary to-secondary">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">Pending Purchase Orders</h2>
                  <p className="text-white/80 text-sm mt-1">Review and approve or reject purchase orders from staff</p>
                </div>
                <button
                  onClick={() => {
                    setShowApprovalModal(false);
                    setApprovingOrder(null);
                  }}
                  className="text-white/80 hover:text-white transition-colors p-2"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {orders.filter(o => o.status === "pending").length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 text-success mx-auto mb-4 opacity-50" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">All Caught Up!</h3>
                  <p className="text-muted-foreground">No pending purchase orders require approval</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders
                    .filter(o => o.status === "pending")
                    .map((order) => (
                      <div
                        key={order.id}
                        className="bg-background rounded-2xl p-6 border-2 border-primary/20 hover:border-primary/40 transition-all"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-bold text-foreground">PO #{order.id}</h3>
                              {getStatusBadge(order.status)}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Supplier</p>
                                <p className="text-sm font-medium text-foreground">{order.supplier}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Created By</p>
                                <p className="text-sm font-medium text-foreground">{getOrderCreator(order, users)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Date</p>
                                <p className="text-sm font-medium text-foreground">{order.date}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Expected Delivery</p>
                                <p className="text-sm font-medium text-foreground">{formatExpectedDelivery(order.expectedDelivery)}</p>
                                {getDeliveryDelayBadge(order)}
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Total Items</p>
                                <p className="text-sm font-medium text-foreground">{order.items}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
                                <p className="text-sm font-bold text-foreground">₱{order.total.toFixed(2)}</p>
                              </div>
                            </div>

                            {/* Order Items Preview */}
                            <div className="mt-4 bg-muted/30 rounded-xl p-4">
                              <p className="text-xs font-semibold text-foreground mb-2">Order Items:</p>
                              <div className="space-y-1">
                                {order.orderItems.slice(0, 3).map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-sm">
                                    <span className="text-foreground">{item.productName}</span>
                                    <span className="text-muted-foreground">
                                      {item.quantity} {item.unit} × ₱{item.unitPrice.toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                                {order.orderItems.length > 3 && (
                                  <p className="text-xs text-muted-foreground italic">
                                    +{order.orderItems.length - 3} more items
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3 mt-4">
                          <button
                            onClick={() => void handleApproveOrder(order)}
                            className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 flex items-center justify-center gap-2"
                          >
                            <CheckCircle className="w-5 h-5" />
                            Approve Order
                          </button>
                          <button
                            onClick={() => {
                              setApprovingOrder(order);
                              setShowApprovalModal(false);
                              setShowRejectModal(true);
                            }}
                            className="flex-1 px-6 py-3 text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
                            style={{ backgroundColor: "#DC2626" }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#B91C1C")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#DC2626")}
                          >
                            <XCircle className="w-5 h-5" />
                            Reject Order
                          </button>
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowApprovalModal(false);
                              setShowViewModal(true);
                            }}
                            className="px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200 flex items-center gap-2"
                          >
                            <Eye className="w-5 h-5" />
                            View Details
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
