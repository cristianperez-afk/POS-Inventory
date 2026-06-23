import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, ClipboardList, Eye, Play, ReceiptText, Search, X } from "lucide-react";
import {
  useRestaurantKitchenOrdersQuery,
  useUpdateRestaurantKitchenOrderStatusMutation,
} from "../lib/restaurant";

type KitchenStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled";

type KitchenOrderItem = {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
  addedIngredients?: string[];
  removedIngredients?: string[];
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
  itemCount: number;
  status: KitchenStatus;
  orderedAt: string;
  items: KitchenOrderItem[];
};

const STATUS_STYLES: Record<KitchenStatus, string> = {
  pending: "border-slate-300 bg-slate-50 text-slate-700",
  preparing: "border-amber-300 bg-amber-50 text-amber-700",
  ready: "border-emerald-300 bg-emerald-50 text-emerald-700",
  completed: "border-blue-300 bg-blue-50 text-blue-700",
  cancelled: "border-red-300 bg-red-50 text-red-700",
};

const STATUS_LABELS: Record<KitchenStatus, string> = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

const API_STATUS: Record<KitchenStatus, "PENDING" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED"> = {
  pending: "PENDING",
  preparing: "PREPARING",
  ready: "READY",
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

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

const cleanList = (items?: string[]) =>
  Array.from(new Set((items ?? []).map((item) => String(item ?? "").trim()).filter(Boolean)));

function DetailList({ label, values }: { label: string; values?: string[] }) {
  const cleanValues = cleanList(values);
  if (cleanValues.length === 0) return null;

  return (
    <div>
      <p className="text-[12px] font-semibold text-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {cleanValues.map((value) => (
          <span key={value} className="rounded border border-border bg-muted/40 px-2 py-1 text-[12px] text-muted-foreground">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function nextAction(status: KitchenStatus) {
  if (status === "pending") return { label: "Start Preparing", next: "preparing" as KitchenStatus, icon: Play };
  if (status === "preparing") return { label: "Mark Ready", next: "ready" as KitchenStatus, icon: CheckCircle2 };
  if (status === "ready") return { label: "Complete", next: "completed" as KitchenStatus, icon: ClipboardCheck };
  return null;
}

export function POSKitchenOrders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);
  const { data: orderRecords = [], isLoading } = useRestaurantKitchenOrdersQuery();
  const updateStatus = useUpdateRestaurantKitchenOrderStatusMutation();
  const orders = orderRecords as KitchenOrder[];

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return orders;

    return orders.filter((order) => {
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
  }, [orders, searchQuery]);

  const handleStatus = async (order: KitchenOrder, nextStatus: KitchenStatus) => {
    await updateStatus.mutateAsync({ id: order.id, status: API_STATUS[nextStatus] });
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-1">POS / Kitchen Orders</h1>
        <p className="text-muted-foreground">Record kitchen receipts and deduct ingredients from inventory via Recipe &amp; BOM.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Kitchen Receipt History</h2>
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search receipts..."
              className="w-full rounded-lg border border-input bg-input-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-10 px-3 py-3" />
              <th className="px-3 py-3 text-left text-xs font-medium text-foreground">Order #</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-foreground">Receipt #</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-foreground">Customer Name</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-foreground">Order Type</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-foreground">Table Number</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-foreground">Order Time</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-foreground">Total Items</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-foreground">Status</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredOrders.map((order) => {
              const action = nextAction(order.status);
              const ActionIcon = action?.icon;

              return (
                  <tr key={order.id} className="align-top">
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-sm font-semibold text-primary">{order.orderNumber}</td>
                    <td className="px-3 py-3 text-sm text-foreground">{order.receiptNo}</td>
                    <td className="px-3 py-3 text-sm text-foreground">{order.customerName || "Walk-in Customer"}</td>
                    <td className="px-3 py-3 text-sm text-foreground">{formatOrderType(order.orderType)}</td>
                    <td className="px-3 py-3 text-sm text-foreground">{order.tableNumber || "-"}</td>
                    <td className="px-3 py-3 text-sm text-muted-foreground">{formatDateTime(order.orderedAt)}</td>
                    <td className="px-3 py-3 text-center text-sm text-foreground">{order.itemCount}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${STATUS_STYLES[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(order)}
                          className="inline-flex items-center gap-1 rounded border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                        {action && ActionIcon && (
                          <button
                            type="button"
                            onClick={() => handleStatus(order, action.next)}
                            disabled={updateStatus.isPending}
                            className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                          >
                            <ActionIcon className="h-3.5 w-3.5" />
                            {action.label}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
              );
            })}
            {!isLoading && filteredOrders.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No kitchen orders found.
                </td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading kitchen orders...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-8 py-6">
              <div>
                <h2 className="text-3xl font-bold text-foreground">Kitchen Order Details</h2>
                <p className="mt-1 text-sm text-muted-foreground">{selectedOrder.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close kitchen order details"
              >
                <X className="h-6 w-6" />
              </button>
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
              </div>

              <div className="mt-8 border-t border-border pt-6">
                <div className="mb-4 flex items-center gap-2">
                  <ReceiptText className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-bold text-foreground">Ordered Items</h3>
                </div>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Menu Item Name</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-foreground">Quantity</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedOrder.items.map((item) => (
                        <tr key={item.id} className="align-top">
                          <td className="px-4 py-4 text-sm font-medium text-foreground">{item.name}</td>
                          <td className="px-4 py-4 text-center text-sm text-foreground">{item.quantity}</td>
                          <td className="px-4 py-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              <DetailList label="Added Ingredients" values={item.addedIngredients} />
                              <DetailList label="Removed Ingredients" values={item.removedIngredients} />
                              <DetailList label="Modifiers" values={item.modifiers} />
                              <DetailList label="Special Instructions / Notes" values={[...(item.specialInstructions ?? []), item.notes ?? ""]} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
