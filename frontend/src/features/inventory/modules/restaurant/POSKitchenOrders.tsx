import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, ClipboardList, Clock, Eye, Filter, Play, Printer, ReceiptText, Search, X } from "lucide-react";
import {
  useRestaurantKitchenOrdersQuery,
  useUpdateRestaurantKitchenOrderStatusMutation,
} from "../lib/restaurant";
import { formatManilaDateTime, parseDatabaseTimestamp } from "../../../../shared/utils/date";

type KitchenStatus = "pending" | "preparing" | "ready" | "served" | "completed" | "cancelled";
type StatusFilter = "all" | KitchenStatus;

type KitchenOrderItem = {
  id: string;
  name: string;
  quantity: number;
  price?: number;
  prepTimeMinutes?: number;
  ingredients?: string[];
  replacedIngredients?: string[];
  notes?: string;
  addedIngredients?: string[];
  removedIngredients?: string[];
  changedIngredients?: string[];
  modifiers?: string[];
  specialInstructions?: string[];
};

type KitchenOrder = {
  id: string;
  orderNumber: string;
  receiptNo: string;
  customerName: string;
  orderType: string;
  tableNumber?: string;
  paymentStatus?: string;
  totalAmount?: number;
  itemCount: number;
  status: KitchenStatus;
  orderedAt: string;
  createdAt?: string | null;
  updatedAt?: string;
  paymentAt?: string | null;
  preparingStartedAt?: string | null;
  readyAt?: string | null;
  servedAt?: string | null;
  serviceDuration?: number | string | null;
  estimatedPrepMinutes?: number;
  estimatedReadyAt?: string | null;
  completedAt?: string | null;
  tableStartedAt?: string | null;
  tableEndedAt?: string | null;
  runningTimeStart?: string | null;
  runningTimeEnd?: string | null;
  runningDuration?: number | null;
  isRunning?: boolean | null;
  items: KitchenOrderItem[];
};

const STATUS_STYLES: Record<KitchenStatus, string> = {
  pending: "border-slate-300 bg-slate-50 text-slate-700",
  preparing: "border-amber-300 bg-amber-50 text-amber-700",
  ready: "border-emerald-300 bg-emerald-50 text-emerald-700",
  served: "border-sky-300 bg-sky-50 text-sky-700",
  completed: "border-blue-300 bg-blue-50 text-blue-700",
  cancelled: "border-red-300 bg-red-50 text-red-700",
};

const STATUS_LABELS: Record<KitchenStatus, string> = {
  pending: "New",
  preparing: "Preparing",
  ready: "Ready to Serve",
  served: "Served",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "New" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready to Serve" },
  { value: "served", label: "Served" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const API_STATUS: Record<KitchenStatus, "PENDING" | "PREPARING" | "READY" | "SERVED" | "COMPLETED" | "CANCELLED"> = {
  pending: "PENDING",
  preparing: "PREPARING",
  ready: "READY",
  served: "SERVED",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

const formatOrderType = (value: string) => {
  const normalized = value.replace(/_/g, "-").toLowerCase();
  if (normalized === "dine-in") return "Dine-In";
  if (normalized === "takeout") return "Takeout";
  if (normalized === "delivery") return "Delivery";
  if (normalized === "mixed") return "Mixed";
  return value || "-";
};

const formatDateTime = (value?: string | null) => {
  return formatManilaDateTime(value);
};

const formatCurrency = (value?: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value ?? 0));

const formatPaymentStatus = (value?: string) => {
  const normalized = String(value ?? "NOT_PAID").replace(/_/g, " ").toLowerCase();
  if (normalized === "not paid") return "Unpaid";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const secondsBetween = (start?: string | null, end?: string | null) => {
  if (!start) return 0;
  const startTime = parseDatabaseTimestamp(start).getTime();
  const endTime = end ? parseDatabaseTimestamp(end).getTime() : Date.now();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0;
  return Math.max(0, Math.floor((endTime - startTime) / 1000));
};

const cleanList = (items?: string[]) =>
  Array.from(new Set((items ?? []).map((item) => String(item ?? "").trim()).filter(Boolean)));

function DetailList({ label, values }: { label: string; values?: string[] }) {
  const cleanValues = cleanList(values);

  return (
    <div>
      <p className="text-[12px] font-semibold text-foreground">{label}</p>
      {cleanValues.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {cleanValues.map((value) => (
            <span key={value} className="rounded border border-border bg-muted/40 px-2 py-1 text-[12px] text-muted-foreground">
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[12px] text-muted-foreground">None</p>
      )}
    </div>
  );
}

function nextAction(status: KitchenStatus, orderType: string) {
  if (status === "pending") return { label: "Start Preparing", next: "preparing" as KitchenStatus, icon: Play };
  if (status === "preparing") return { label: "Mark Ready to Serve", next: "ready" as KitchenStatus, icon: CheckCircle2 };
  if (status === "ready") {
    return { label: "Mark Served", next: "served" as KitchenStatus, icon: ClipboardCheck };
  }
  return null;
}

function canCancel(status: KitchenStatus) {
  return status !== "served" && status !== "completed" && status !== "cancelled";
}

function hasModifications(item: KitchenOrderItem) {
  return cleanList(item.addedIngredients).length > 0 ||
    cleanList(item.removedIngredients).length > 0 ||
    cleanList(item.changedIngredients).length > 0 ||
    cleanList(item.replacedIngredients).length > 0 ||
    cleanList(item.modifiers).length > 0 ||
    cleanList(item.specialInstructions).length > 0 ||
    Boolean(item.notes?.trim());
}

function getSavedEstimatedPrepTime(order: KitchenOrder) {
  const minutes = Number(order.estimatedPrepMinutes ?? 0);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function formatPrepTime(minutes: number) {
  return `${minutes} min${minutes === 1 ? "" : "s"}`;
}

function formatServeTime(seconds: number) {
  const normalizedSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  return [hours, minutes, normalizedSeconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
}

function getSavedServiceSeconds(order: KitchenOrder) {
  const seconds = Number(order.serviceDuration ?? NaN);
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : null;
}

function getServeTimeStart(order: KitchenOrder, end?: string | null) {
  const endTime = end ? parseDatabaseTimestamp(end).getTime() : Date.now();
  const candidates = [order.orderedAt, order.runningTimeStart, order.preparingStartedAt, order.createdAt];
  return candidates.find((value) => {
    if (!value) return false;
    const startTime = parseDatabaseTimestamp(value).getTime();
    return Number.isFinite(startTime) && (!Number.isFinite(endTime) || startTime <= endTime);
  }) ?? order.orderedAt;
}

function getLifecycleEnd(order: KitchenOrder) {
  return order.status === "completed" || order.status === "cancelled"
    ? order.completedAt ?? order.tableEndedAt ?? order.updatedAt
    : undefined;
}

function getServeTimeEnd(order: KitchenOrder) {
  if (order.servedAt) return order.servedAt;
  if (order.status === "served") return order.completedAt ?? order.runningTimeEnd ?? order.updatedAt;
  if (order.status === "completed") return order.servedAt ?? order.completedAt ?? order.runningTimeEnd ?? order.updatedAt;
  return undefined;
}

function getRunningTime(order: KitchenOrder) {
  const end = getServeTimeEnd(order);
  const savedSeconds = getSavedServiceSeconds(order);
  if ((order.status === "served" || order.status === "completed") && savedSeconds !== null && savedSeconds > 0) {
    return formatServeTime(savedSeconds);
  }
  const start = getServeTimeStart(order, end);
  if (start) return formatServeTime(secondsBetween(start, end));
  return formatServeTime(savedSeconds ?? 0);
}

function getCustomerStayDuration(order: KitchenOrder) {
  const normalizedType = order.orderType.replace(/_/g, "-").toLowerCase();
  if (normalizedType === "takeout") return "-";
  const stayEnd = order.tableEndedAt ?? getLifecycleEnd(order);
  const savedSeconds = Number(order.runningDuration ?? NaN);
  if (stayEnd && Number.isFinite(savedSeconds) && savedSeconds > 0) {
    return formatServeTime(savedSeconds);
  }
  const endTime = stayEnd ? parseDatabaseTimestamp(stayEnd).getTime() : Date.now();
  const stayStartedAt = [order.tableStartedAt, order.orderedAt, order.runningTimeStart, order.createdAt].find((value) => {
    if (!value) return false;
    const startTime = parseDatabaseTimestamp(value).getTime();
    return Number.isFinite(startTime) && (!Number.isFinite(endTime) || startTime <= endTime);
  });
  if (!order.tableNumber || !stayStartedAt) return "No table selected";
  return formatServeTime(secondsBetween(stayStartedAt, stayEnd));
}

function KitchenTicketItems({ orderId, items }: { orderId: string; items: KitchenOrderItem[] }) {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const itemKey = `${orderId}-${item.id}`;
        const isExpanded = expandedItems[itemKey] ?? false;
        const modified = hasModifications(item);

        return (
          <div key={itemKey} className={`rounded-lg border ${modified ? "border-amber-200 bg-amber-50/40" : "border-border bg-card"}`}>
            <button
              type="button"
              onClick={() => setExpandedItems((current) => ({ ...current, [itemKey]: !isExpanded }))}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <span className="flex min-w-0 items-center gap-2">
                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
                {modified && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
              </span>
              <span className="shrink-0 text-sm font-medium text-muted-foreground">x{item.quantity}</span>
            </button>

            {isExpanded && (
              <div className="space-y-3 border-t border-border px-3 py-3">
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>Price: {formatCurrency(item.price)}</span>
                  <span>Estimated Prep Time: {formatPrepTime(Number(item.prepTimeMinutes ?? 0))}</span>
                </div>
                <DetailList label="Ingredients" values={item.ingredients} />
                {modified && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                      <AlertTriangle className="h-4 w-4" />
                      Ingredient Modification
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <DetailList label="Removed" values={item.removedIngredients} />
                      <DetailList label="Added" values={item.addedIngredients} />
                      <DetailList label="Changed Qty" values={item.changedIngredients} />
                      <DetailList label="Replaced" values={item.replacedIngredients} />
                      <DetailList label="Special Notes" values={[...(item.specialInstructions ?? []), item.notes ?? ""]} />
                    </div>
                  </div>
                )}
                {!modified && <p className="text-xs text-muted-foreground">No ingredient modifications for this item.</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function POSKitchenOrders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);

  // Cards toggle the shared status filter that drives the order lanes below;
  // clicking the active card (or Total Orders) clears it back to "all".
  const toggleStatusFilter = (filter: StatusFilter) => {
    setStatusFilter((current) => (current === filter ? "all" : filter));
  };

  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const { data: orderRecords = [], isLoading } = useRestaurantKitchenOrdersQuery();
  const updateStatus = useUpdateRestaurantKitchenOrderStatusMutation();
  const orders = orderRecords as KitchenOrder[];

  useEffect(() => {
    setSelectedOrder((current) => {
      if (!current) return current;
      return orders.find((order) => order.id === current.id) ?? current;
    });
  }, [orders]);

  const orderStats = useMemo(() => {
    const counts = orders.reduce<Record<KitchenStatus, number>>(
      (acc, order) => {
        acc[order.status] += 1;
        return acc;
      },
      { pending: 0, preparing: 0, ready: 0, served: 0, completed: 0, cancelled: 0 },
    );

    return [
      { label: "Total Orders", value: orders.length, filter: "all" as StatusFilter, icon: ReceiptText, color: "from-teal-500 to-cyan-500" },
      { label: "Pending", value: counts.pending, filter: "pending" as StatusFilter, icon: ClipboardList, color: "from-slate-500 to-slate-600" },
      { label: "Preparing", value: counts.preparing, filter: "preparing" as StatusFilter, icon: Play, color: "from-amber-500 to-orange-500" },
      { label: "Ready", value: counts.ready, filter: "ready" as StatusFilter, icon: CheckCircle2, color: "from-emerald-500 to-green-500" },
      { label: "Served", value: counts.served, filter: "served" as StatusFilter, icon: ClipboardCheck, color: "from-sky-500 to-cyan-500" },
      { label: "Completed", value: counts.completed, filter: "completed" as StatusFilter, icon: ClipboardCheck, color: "from-blue-500 to-sky-500" },
      { label: "Cancelled", value: counts.cancelled, filter: "cancelled" as StatusFilter, icon: X, color: "from-red-500 to-rose-500" },
    ];
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      if (!matchesStatus) return false;
      if (!query) return true;

      const haystack = [
        order.orderNumber,
        order.receiptNo,
        order.customerName,
        order.orderType,
        order.tableNumber,
        STATUS_LABELS[order.status],
        ...order.items.map((item) => item.name),
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [orders, searchQuery, statusFilter]);

  const handleStatus = async (order: KitchenOrder, nextStatus: KitchenStatus) => {
    await updateStatus.mutateAsync({ id: order.id, status: API_STATUS[nextStatus] });
  };

  const handlePrintTicket = (order: KitchenOrder) => {
    const lines = [
      `Order #${order.orderNumber}`,
      `Customer: ${order.customerName || "Walk-in Customer"}`,
      `Type: ${formatOrderType(order.orderType)}`,
      `Table: ${order.tableNumber || "No table selected"}`,
      `Status: ${STATUS_LABELS[order.status]}`,
      `Payment Status: ${formatPaymentStatus(order.paymentStatus)}`,
      `Time Ordered: ${formatDateTime(order.orderedAt)}`,
      `Estimated Prep: ${getSavedEstimatedPrepTime(order) === null ? "-" : formatPrepTime(getSavedEstimatedPrepTime(order) ?? 0)}`,
      order.estimatedReadyAt ? `Estimated Ready: ${formatDateTime(order.estimatedReadyAt)}` : "",
      "",
      "Products:",
      ...order.items.flatMap((item) => [
        `- ${item.name} x${item.quantity} (${formatCurrency(item.price)})`,
        ...cleanList(item.ingredients).map((value) => `  Ingredient: ${value}`),
        ...cleanList(item.removedIngredients).map((value) => `  Removed: ${value}`),
        ...cleanList(item.addedIngredients).map((value) => `  Added: ${value}`),
        ...cleanList(item.changedIngredients).map((value) => `  Changed Qty: ${value}`),
        ...cleanList(item.replacedIngredients).map((value) => `  Replaced: ${value}`),
        ...cleanList([...(item.specialInstructions ?? []), item.notes ?? ""]).map((value) => `  Note: ${value}`),
      ]),
    ];

    const ticketWindow = window.open("", "_blank", "width=420,height=640");
    if (!ticketWindow) return;
    ticketWindow.document.write(`<pre style="font: 14px/1.5 monospace; white-space: pre-wrap;">${lines.join("\n")}</pre>`);
    ticketWindow.document.close();
    ticketWindow.focus();
    ticketWindow.print();
  };

  const statusLanes: Array<{ status: KitchenStatus; title: string; helper: string }> = [
    { status: "pending", title: "New Orders", helper: "Received by kitchen" },
    { status: "preparing", title: "Preparing Orders", helper: "Currently cooking" },
    { status: "ready", title: "Ready to Serve Orders", helper: "Needs pickup/service" },
    { status: "served", title: "Served Orders", helper: "Waiting for customer session close" },
    { status: "completed", title: "Completed Orders", helper: "Customer session closed" },
    { status: "cancelled", title: "Cancelled Orders", helper: "Stopped or voided" },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-1">POS / Kitchen Orders</h1>
        <p className="text-muted-foreground">Record kitchen receipts and deduct ingredients from inventory via Recipe &amp; BOM.</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {orderStats.map((stat) => {
          const Icon = stat.icon;
          const isActive = statusFilter === stat.filter;

          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => toggleStatusFilter(stat.filter)}
              aria-pressed={isActive}
              aria-label={`Filter by ${stat.label}`}
              className={`group text-left w-full rounded-2xl border bg-card p-5 shadow-sm cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/25 hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-lg active:shadow-primary/30 ${
                isActive ? "border-primary bg-primary/5 shadow-md shadow-primary/20" : "border-border"
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.color} shadow-lg`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Live</span>
              </div>
              <p className="mb-1 text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Kitchen Receipt History</h2>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search receipts..."
                className="w-full rounded-lg border border-input bg-input-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="relative w-full sm:w-48">
              <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="w-full appearance-none rounded-lg border border-input bg-input-background py-2 pl-9 pr-8 text-sm outline-none focus:border-primary"
              >
                {STATUS_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted-foreground">
            Loading kitchen orders...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            No kitchen orders found.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-5">
            {statusLanes.map((lane) => {
              const laneOrders = filteredOrders.filter((order) => order.status === lane.status);
              return (
                <section key={lane.status} className="min-h-[280px] rounded-xl border border-border bg-muted/20 p-3">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{lane.title}</h3>
                      <p className="text-xs text-muted-foreground">{lane.helper}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[lane.status]}`}>{laneOrders.length}</span>
                  </div>

                  <div className="space-y-3">
                    {laneOrders.map((order) => {
                      const action = nextAction(order.status, order.orderType);
                      const ActionIcon = action?.icon;
                      const showCancelAction = canCancel(order.status);
                      const isExpanded = expandedOrders[order.id] ?? false;
                      const hasAnyModification = order.items.some(hasModifications);

                      return (
                        <article key={order.id} className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                          <button
                            type="button"
                            onClick={() => setExpandedOrders((current) => ({ ...current, [order.id]: !isExpanded }))}
                            className="flex w-full items-start justify-between gap-3 text-left"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                <h4 className="truncate text-base font-bold text-primary">Order #{order.orderNumber}</h4>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">Customer: {order.customerName || "Walk-in Customer"}</p>
                            </div>
                            {hasAnyModification && <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />}
                          </button>

                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                            <div className="flex items-center justify-between gap-2">
                              <span>{formatOrderType(order.orderType)}</span>
                              <span>{order.tableNumber || "No table selected"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{formatDateTime(order.orderedAt)}</span>
                            </div>
                            <div className="font-medium text-foreground">Estimated Prep: {getSavedEstimatedPrepTime(order) === null ? "-" : formatPrepTime(getSavedEstimatedPrepTime(order) ?? 0)}</div>
                            {order.estimatedReadyAt && (
                              <div className="font-medium text-primary">Ready Around: {formatDateTime(order.estimatedReadyAt)}</div>
                            )}
                            <div className="flex items-center justify-between gap-2">
                              <span>Serve Time: {getRunningTime(order)}</span>
                              <span>Stay: {getCustomerStayDuration(order)}</span>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-4 border-t border-border pt-4">
                              <KitchenTicketItems orderId={order.id} items={order.items} />
                            </div>
                          )}

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(order)}
                              className="inline-flex items-center gap-1 rounded border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintTicket(order)}
                              className="inline-flex items-center gap-1 rounded border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Print
                            </button>
                            {action && ActionIcon && (
                              <button
                                type="button"
                                onClick={() => handleStatus(order, action.next)}
                                disabled={updateStatus.isPending}
                                className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
                              >
                                <ActionIcon className="h-3.5 w-3.5" />
                                {action.label}
                              </button>
                            )}
                            {showCancelAction && (
                              <button
                                type="button"
                                onClick={() => handleStatus(order, "cancelled")}
                                disabled={updateStatus.isPending}
                                className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                Cancel
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                    {laneOrders.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                        No tickets
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-8 py-6">
              <div>
                <h2 className="text-3xl font-bold text-foreground">Kitchen Order Details</h2>
                <p className="mt-1 text-sm text-muted-foreground">{selectedOrder.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintTicket(selectedOrder)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  <Printer className="h-4 w-4" />
                  Print Ticket
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close kitchen order details"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="px-8 py-6">
              <div className="grid gap-x-20 gap-y-6 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Order Number</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{selectedOrder.orderNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-medium ${STATUS_STYLES[selectedOrder.status]}`}>
                    {STATUS_LABELS[selectedOrder.status]}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Receipt Number</p>
                  <p className="mt-1 text-lg text-foreground">{selectedOrder.receiptNo}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                  <p className="mt-1 text-lg text-foreground">{selectedOrder.itemCount} items</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Customer Name</p>
                  <p className="mt-1 text-lg text-foreground">{selectedOrder.customerName || "Walk-in Customer"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Order Type</p>
                  <p className="mt-1 text-lg text-foreground">{formatOrderType(selectedOrder.orderType)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Table Number</p>
                  <p className="mt-1 text-lg text-foreground">{selectedOrder.tableNumber || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Order Time</p>
                  <p className="mt-1 text-lg text-foreground">{formatDateTime(selectedOrder.orderedAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estimated Prep</p>
                  <p className="mt-1 text-lg text-foreground">{getSavedEstimatedPrepTime(selectedOrder) === null ? "-" : formatPrepTime(getSavedEstimatedPrepTime(selectedOrder) ?? 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estimated Ready Around</p>
                  <p className="mt-1 text-lg text-foreground">{selectedOrder.estimatedReadyAt ? formatDateTime(selectedOrder.estimatedReadyAt) : "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Serve Time</p>
                  <p className="mt-1 text-lg text-foreground">{getRunningTime(selectedOrder)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Served At</p>
                  <p className="mt-1 text-lg text-foreground">{selectedOrder.servedAt ? formatDateTime(selectedOrder.servedAt) : "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Stay Time</p>
                  <p className="mt-1 text-lg text-foreground">{getCustomerStayDuration(selectedOrder)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Payment Time</p>
                  <p className="mt-1 text-lg text-foreground">{selectedOrder.paymentAt ? formatDateTime(selectedOrder.paymentAt) : "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Preparing Start</p>
                  <p className="mt-1 text-lg text-foreground">{selectedOrder.preparingStartedAt ? formatDateTime(selectedOrder.preparingStartedAt) : "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ready to Serve Time</p>
                  <p className="mt-1 text-lg text-foreground">{selectedOrder.readyAt ? formatDateTime(selectedOrder.readyAt) : "-"}</p>
                </div>
              </div>

              <div className="mt-8 border-t border-border pt-6">
                <div className="mb-4 flex items-center gap-2">
                  <ReceiptText className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-bold text-foreground">Ordered Items</h3>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <KitchenTicketItems orderId={selectedOrder.id} items={selectedOrder.items} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
