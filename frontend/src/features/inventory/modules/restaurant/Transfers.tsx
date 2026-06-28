import { useState } from "react";
import { ArrowLeftRight, Plus, Search, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Clock, X, FileText, Trash2, PhilippinePeso, BarChart3, Calendar, Eye, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateRestaurantStockMovementMutation,
  useCreateRestaurantTransferMutation,
  useRestaurantInventoryQuery,
  useRestaurantLocationsQuery,
  useRestaurantTransferActionMutation,
  useRestaurantTransfersQuery,
  useRestaurantWasteQuery,
} from "../lib/restaurant";
import { StockAdjustments } from "./StockAdjustments";
import { getLocalDateKey } from "../../../../shared/utils/date";
import { InlineDataLoading } from "../shared/InlineDataLoading";
import { useSession } from "../../app/hooks/useSession";

type TransferStatus = "pending" | "approved" | "in-transit" | "completed" | "rejected";
type AdjustmentType = "damage" | "shrinkage" | "waste" | "found" | "correction";
type WasteType = "spoilage" | "expiry" | "damage" | "spillage" | "contamination" | "overproduction";

type Transfer = {
  id: string;
  item: string;
  quantity: number;
  unit: string;
  from: string;
  to: string;
  requestedBy: string;
  requestedByEmail?: string;
  requestDate: string;
  status: TransferStatus;
  approvedBy?: string;
  completedDate?: string;
  notes: string;
};

type Adjustment = {
  id: string;
  item: string;
  quantity: number;
  unit: string;
  location: string;
  type: AdjustmentType;
  reason: string;
  adjustedBy: string;
  date: string;
  notes: string;
};

type WasteLog = {
  id: string;
  item: string;
  quantity: number;
  unit: string;
  location: string;
  wasteType: WasteType;
  unitCost: number;
  totalValue: number;
  date: string;
  loggedBy: string;
  source: "manual" | "recipe-auto";
  notes: string;
};

export function Transfers() {
  const { currentUser } = useSession();
  const isAdmin = currentUser?.role === "Admin";
  const currentUserEmail = (currentUser?.email ?? "").toLowerCase();
  const [activeTab, setActiveTab] = useState<"transfers" | "adjustments" | "waste">("transfers");
  const [wasteView, setWasteView] = useState<"logs" | "report">("logs");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalTransfer, setApprovalTransfer] = useState<Transfer | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedItem, setSelectedItem] = useState<Transfer | Adjustment | WasteLog | null>(null);
  const [dateRange, setDateRange] = useState({ start: "2026-05-01", end: "2026-05-31" });

  const { data: transfers = [], isLoading: transfersLoading } = useRestaurantTransfersQuery();

  const { data: wasteLogs = [], isLoading: wasteLoading } = useRestaurantWasteQuery();

  const [newTransfer, setNewTransfer] = useState({
    item: "",
    quantity: "",
    unit: "kg",
    from: "",
    to: "",
    notes: "",
  });

  const [newWaste, setNewWaste] = useState({
    item: "",
    quantity: "",
    unit: "kg",
    location: "",
    wasteType: "spoilage" as WasteType,
    unitCost: "",
    notes: "",
  });

  const { data: locations = [], isLoading: locationsLoading } = useRestaurantLocationsQuery();
  const { data: inventoryItems = [], isLoading: inventoryLoading } = useRestaurantInventoryQuery();
  const transferReferenceDataLoading = locationsLoading || inventoryLoading;
  const availableItems = inventoryItems.filter(item => item.backendId && item.stock > 0);
  const units = [
    "kg",
    "g",
    "L",
    "ml",
    "milliliter",
    "pcs",
    "liter",
    "bottle",
    "can",
    "pack",
    "box",
    "bag",
    "sack",
    "carton",
    "tray",
    "gallon",
  ];
  const saveTransfer = useCreateRestaurantTransferMutation();
  const moveTransfer = useRestaurantTransferActionMutation();
  const saveMovement = useCreateRestaurantStockMovementMutation();

  const filteredTransfers = transfers.filter(transfer => {
    const matchesSearch = (transfer.item || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (transfer.id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || transfer.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredWasteLogs = wasteLogs.filter(waste => {
    const matchesSearch = (waste.item || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (waste.id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = statusFilter === "all" || waste.wasteType === statusFilter;
    const inDateRange = waste.date >= dateRange.start && waste.date <= dateRange.end;
    return matchesSearch && matchesType && inDateRange;
  });

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveTransfer.mutateAsync({
        fromLocationId: newTransfer.from,
        toLocationId: newTransfer.to,
        notes: newTransfer.notes || undefined,
        items: [{ inventoryItemId: newTransfer.item, quantity: parseFloat(newTransfer.quantity) }],
      });
      setShowTransferModal(false);
      setNewTransfer({ item: "", quantity: "", unit: "kg", from: "", to: "", notes: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create transfer");
    }
  };

  const handleLogWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveMovement.mutateAsync({
        itemId: newWaste.item,
        locationId: newWaste.location,
        type: newWaste.wasteType === "expiry" ? "EXPIRY" : "SPOILAGE",
        quantity: parseFloat(newWaste.quantity),
        reason: newWaste.wasteType,
        referenceType: "RESTAURANT_WASTE",
        notes: newWaste.notes || undefined,
      });
      setShowWasteModal(false);
      setNewWaste({ item: "", quantity: "", unit: "kg", location: "", wasteType: "spoilage", unitCost: "", notes: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to log waste");
    }
  };

  const openApproval = (transfer: Transfer) => {
    setApprovalTransfer(transfer);
    setRejectReason("");
    setShowApprovalModal(true);
  };

  const closeApproval = () => {
    setShowApprovalModal(false);
    setApprovalTransfer(null);
    setRejectReason("");
  };

  const handleApproveTransfer = async (id: string) => {
    try {
      await moveTransfer.mutateAsync({ id, action: "dispatch" });
      toast.success("Transfer approved and dispatched");
      closeApproval();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve transfer");
    }
  };

  const handleRejectTransfer = async (id: string, reason: string, requireReason: boolean) => {
    const trimmed = reason.trim();
    if (requireReason && !trimmed) {
      toast.error("Please provide a reason for rejecting this request.");
      return;
    }
    try {
      await moveTransfer.mutateAsync({ id, action: "cancel", reason: trimmed });
      toast.success(requireReason ? "Transfer request rejected" : "Request withdrawn");
      closeApproval();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel transfer");
    }
  };

  const handleCompleteTransfer = async (id: string) => {
    try {
      await moveTransfer.mutateAsync({ id, action: "complete" });
      toast.success("Transfer marked as completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to complete transfer");
    }
  };

  const getStatusBadge = (status: TransferStatus) => {
    const styles = {
      pending: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
      approved: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
      "in-transit": { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
      completed: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
      rejected: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
    };
    const style = styles[status];

    if (!style) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium border bg-muted text-muted-foreground border-border">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
    }

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getAdjustmentBadge = (type: AdjustmentType) => {
    const styles = {
      damage: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200", icon: AlertCircle },
      shrinkage: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200", icon: TrendingDown },
      waste: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border", icon: X },
      found: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200", icon: TrendingUp },
      correction: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200", icon: FileText },
    };
    const style = styles[type];

    if (!style) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border bg-muted text-muted-foreground border-border">
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </span>
      );
    }

    const Icon = style.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
        <Icon className="w-3 h-3" />
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const getWasteTypeBadge = (type: WasteType) => {
    const styles = {
      spoilage: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
      expiry: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
      damage: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
      spillage: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
      contamination: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
      overproduction: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
    };
    const style = styles[type];
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const getSourceBadge = (source: "manual" | "recipe-auto") => {
    return source === "recipe-auto" ? (
      <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
        Auto (Recipe BOM)
      </span>
    ) : (
      <span className="px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground border border-border">
        Manual
      </span>
    );
  };

  const wasteByType = filteredWasteLogs.reduce((acc, log) => {
    acc[log.wasteType] = (acc[log.wasteType] || 0) + log.totalValue;
    return acc;
  }, {} as Record<WasteType, number>);

  const wasteByLocation = filteredWasteLogs.reduce((acc, log) => {
    acc[log.location] = (acc[log.location] || 0) + log.totalValue;
    return acc;
  }, {} as Record<string, number>);

  const wasteByItem = filteredWasteLogs.reduce((acc, log) => {
    acc[log.item] = (acc[log.item] || 0) + log.totalValue;
    return acc;
  }, {} as Record<string, number>);

  const totalWasteValue = filteredWasteLogs.reduce((sum, log) => sum + log.totalValue, 0);
  const totalWasteQuantity = filteredWasteLogs.length;

  // Cards jump to the Transfers tab and toggle its status filter; clicking the
  // active card clears the filter back to "all".
  const toggleTransferStatus = (status: string) => {
    setActiveTab("transfers");
    setStatusFilter((current) => (current === status ? "all" : status));
  };

  const transferStats = [
    { label: "Pending Approvals", value: transfers.filter(t => t.status === "pending").length, icon: Clock, color: "from-yellow-500 to-orange-500", filter: "pending" },
    { label: "In Transit", value: transfers.filter(t => t.status === "in-transit").length, icon: ArrowLeftRight, color: "from-purple-500 to-indigo-500", filter: "in-transit" },
    { label: "Completed Today", value: transfers.filter(t => t.status === "completed" && t.completedDate === getLocalDateKey()).length, icon: CheckCircle, color: "from-green-500 to-emerald-500", filter: "completed" },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">Transfers & Adjustments</h1>
          <p className="text-muted-foreground">Manage stock transfers, adjustments, and waste logging</p>
        </div>
        <div className="flex gap-2 mt-3 md:mt-0">
          {activeTab === "transfers" && (
            <button
              onClick={() => setShowTransferModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-md transition-all duration-200 flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              New Transfer
            </button>
          )}
          {activeTab === "waste" && wasteView === "logs" && (
            <button
              onClick={() => setShowWasteModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Log Waste
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {transferStats.map((stat, index) => {
          const Icon = stat.icon;
          const isActive = activeTab === "transfers" && statusFilter === stat.filter;
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggleTransferStatus(stat.filter)}
              aria-pressed={isActive}
              aria-label={`Filter transfers by ${stat.label}`}
              className={`group text-left w-full bg-card rounded-2xl p-6 shadow-sm border cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/25 hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 active:shadow-lg active:shadow-primary/30 ${
                isActive ? "border-primary bg-primary/5 shadow-md shadow-primary/20" : "border-border"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-muted-foreground text-sm mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-muted rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setActiveTab("transfers")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
            activeTab === "transfers"
              ? "bg-primary text-white shadow-md"
              : "text-muted-foreground hover:text-foreground hover:bg-background/70 hover:shadow-sm"
          }`}
        >
          <ArrowLeftRight className="w-4 h-4 inline-block mr-2" />
          Transfers
        </button>
        <button
          onClick={() => setActiveTab("adjustments")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
            activeTab === "adjustments"
              ? "bg-primary text-white shadow-md"
              : "text-muted-foreground hover:text-foreground hover:bg-background/70 hover:shadow-sm"
          }`}
        >
          <FileText className="w-4 h-4 inline-block mr-2" />
          Adjustments
        </button>
        <button
          onClick={() => setActiveTab("waste")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
            activeTab === "waste"
              ? "bg-primary text-white shadow-md"
              : "text-muted-foreground hover:text-foreground hover:bg-background/70 hover:shadow-sm"
          }`}
        >
          <Trash2 className="w-4 h-4 inline-block mr-2" />
          Waste & Write-Offs
        </button>
      </div>

      {/* Waste View Toggle */}
      {activeTab === "waste" && (
        <div className="flex items-center gap-2 bg-muted rounded-xl p-1 mb-6 w-fit">
          <button
            onClick={() => setWasteView("logs")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              wasteView === "logs"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Waste Logs
          </button>
          <button
            onClick={() => setWasteView("report")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              wasteView === "report"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Waste Report
          </button>
        </div>
      )}

      {/* Filters — the embedded Stock Adjustments panel brings its own search/filters */}
      {activeTab !== "adjustments" && (
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-border mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by item or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
            />
          </div>
          {activeTab === "waste" && wasteView === "logs" && (
            <>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </>
          )}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer text-sm"
          >
            {activeTab === "transfers" ? (
              <>
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="in-transit">In Transit</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </>
            ) : (
              <>
                <option value="all">All Types</option>
                <option value="spoilage">Spoilage</option>
                <option value="expiry">Expiry</option>
                <option value="damage">Damage</option>
                <option value="spillage">Spillage</option>
                <option value="contamination">Contamination</option>
                <option value="overproduction">Overproduction</option>
              </>
            )}
          </select>
        </div>
      </div>
      )}

      {/* Content */}
      {activeTab === "transfers" ? (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-foreground">Transfer ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-foreground">Item</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-foreground">From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-foreground">To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-foreground">Requested By</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Date</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfersLoading ? (
                  <tr><td colSpan={9}><InlineDataLoading label="Loading transfers…" /></td></tr>
                ) : filteredTransfers.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No transfers found.</td></tr>
                ) : filteredTransfers.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-primary text-sm">{transfer.id}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground text-sm">{transfer.item}</td>
                    <td className="px-4 py-3 text-center text-foreground text-sm">
                      {transfer.quantity} {transfer.unit}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">{transfer.from}</td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">{transfer.to}</td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">{transfer.requestedBy}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground text-sm">{transfer.requestDate}</td>
                    <td className="px-4 py-3 text-center">{getStatusBadge(transfer.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedItem(transfer);
                            setShowDetailsModal(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                        {transfer.status === "pending" && (
                          isAdmin ? (
                            <button
                              onClick={() => openApproval(transfer)}
                              className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:shadow-md hover:shadow-amber-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 active:translate-y-0 transition-all"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              Review
                            </button>
                          ) : currentUserEmail && (transfer.requestedByEmail ?? "").toLowerCase() === currentUserEmail ? (
                            <button
                              onClick={() => openApproval(transfer)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 transition-all dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                            >
                              <X className="w-3.5 h-3.5" />
                              Withdraw
                            </button>
                          ) : (
                            <span className="px-2 text-xs italic text-muted-foreground">Awaiting approval</span>
                          )
                        )}
                        {transfer.status === "in-transit" && isAdmin && (
                          <button
                            onClick={() => handleCompleteTransfer(transfer.id)}
                            disabled={moveTransfer.isPending}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 transition-all"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Complete
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
      ) : activeTab === "adjustments" ? (
        <StockAdjustments embedded />
      ) : wasteView === "logs" ? (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-foreground">Waste ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-foreground">Item</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-foreground">Location</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-foreground">Value</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Source</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Date</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {wasteLoading ? (
                  <tr><td colSpan={9}><InlineDataLoading label="Loading waste records…" /></td></tr>
                ) : filteredWasteLogs.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No waste records found.</td></tr>
                ) : filteredWasteLogs.map((waste) => (
                  <tr key={waste.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-primary text-sm">{waste.id}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground text-sm">{waste.item}</td>
                    <td className="px-4 py-3 text-center text-foreground text-sm">
                      {waste.quantity} {waste.unit}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">{waste.location}</td>
                    <td className="px-4 py-3 text-center">{getWasteTypeBadge(waste.wasteType)}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-600 text-sm">
                      ₱{waste.totalValue.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">{getSourceBadge(waste.source)}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground text-sm">{waste.date}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          setSelectedItem(waste);
                          setShowDetailsModal(true);
                        }}
                        className="text-primary hover:text-primary/80 text-xs"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Waste Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-rose-500 rounded-lg flex items-center justify-center">
                  <PhilippinePeso className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total Waste Value</p>
                  <p className="text-xl font-bold text-red-600">₱{totalWasteValue.toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-lg flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total Waste Entries</p>
                  <p className="text-xl font-bold text-foreground">{totalWasteQuantity}</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Date Range</p>
                  <p className="text-sm font-medium text-foreground">{dateRange.start} to {dateRange.end}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Waste by Type */}
          <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Waste by Type
            </h3>
            <div className="space-y-3">
              {Object.entries(wasteByType).map(([type, value]) => (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {getWasteTypeBadge(type as WasteType)}
                    </div>
                    <span className="text-sm font-bold text-red-600">₱{value.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-red-500 to-rose-500 h-2 rounded-full"
                      style={{ width: `${(value / totalWasteValue) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Waste by Location */}
          <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Waste by Location
            </h3>
            <div className="space-y-3">
              {Object.entries(wasteByLocation).map(([location, value]) => (
                <div key={location}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{location}</span>
                    <span className="text-sm font-bold text-red-600">₱{value.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-orange-500 to-yellow-500 h-2 rounded-full"
                      style={{ width: `${(value / totalWasteValue) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Waste by Item */}
          <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Waste by Item
            </h3>
            <div className="space-y-3">
              {Object.entries(wasteByItem).map(([item, value]) => (
                <div key={item}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{item}</span>
                    <span className="text-sm font-bold text-red-600">₱{value.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full"
                      style={{ width: `${(value / totalWasteValue) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">Create Transfer Request</h2>
              <button onClick={() => setShowTransferModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTransfer} className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Item</label>
                <select
                  value={newTransfer.item}
                  onChange={(e) => setNewTransfer({ ...newTransfer, item: e.target.value })}
                  className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  required
                  disabled={transferReferenceDataLoading || availableItems.length === 0}
                >
                  <option value="">{transferReferenceDataLoading ? "Loading inventory items…" : availableItems.length === 0 ? "No available inventory items" : "Select item"}</option>
                  {availableItems.map(item => <option key={item.id} value={item.backendId}>{item.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Quantity</label>
                  <input
                    type="number"
                    value={newTransfer.quantity}
                    onChange={(e) => setNewTransfer({ ...newTransfer, quantity: e.target.value })}
                    className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    required
                    min="0.01"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Unit</label>
                  <select
                    value={newTransfer.unit}
                    onChange={(e) => setNewTransfer({ ...newTransfer, unit: e.target.value })}
                    className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  >
                    {units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">From Location</label>
                <select
                  value={newTransfer.from}
                  onChange={(e) => setNewTransfer({ ...newTransfer, from: e.target.value })}
                  className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  required
                >
                  <option value="">Select location</option>
                  {locations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">To Location</label>
                <select
                  value={newTransfer.to}
                  onChange={(e) => setNewTransfer({ ...newTransfer, to: e.target.value })}
                  className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  required
                >
                  <option value="">Select location</option>
                  {locations.filter((loc: any) => loc.id !== newTransfer.from).map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
                <textarea
                  value={newTransfer.notes}
                  onChange={(e) => setNewTransfer({ ...newTransfer, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg transition-all text-sm"
                >
                  Create Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Waste Modal */}
      {showWasteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">Log Waste & Write-Off</h2>
              <button onClick={() => setShowWasteModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleLogWaste} className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Item</label>
                <select
                  value={newWaste.item}
                  onChange={(e) => setNewWaste({ ...newWaste, item: e.target.value })}
                  className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  required
                  disabled={transferReferenceDataLoading || availableItems.length === 0}
                >
                  <option value="">{transferReferenceDataLoading ? "Loading inventory items…" : availableItems.length === 0 ? "No available inventory items" : "Select item"}</option>
                  {availableItems.map(item => <option key={item.id} value={item.backendId}>{item.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Quantity</label>
                  <input
                    type="number"
                    value={newWaste.quantity}
                    onChange={(e) => setNewWaste({ ...newWaste, quantity: e.target.value })}
                    className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    required
                    min="0.01"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Unit</label>
                  <select
                    value={newWaste.unit}
                    onChange={(e) => setNewWaste({ ...newWaste, unit: e.target.value })}
                    className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  >
                    {units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Location</label>
                <select
                  value={newWaste.location}
                  onChange={(e) => setNewWaste({ ...newWaste, location: e.target.value })}
                  className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  required
                >
                  <option value="">Select location</option>
                  {locations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Waste Type</label>
                <select
                  value={newWaste.wasteType}
                  onChange={(e) => setNewWaste({ ...newWaste, wasteType: e.target.value as WasteType })}
                  className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  required
                >
                  <option value="spoilage">Spoilage</option>
                  <option value="expiry">Expiry</option>
                  <option value="damage">Damage</option>
                  <option value="spillage">Spillage</option>
                  <option value="contamination">Contamination</option>
                  <option value="overproduction">Overproduction</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Unit Cost (₱)</label>
                <input
                  type="number"
                  value={newWaste.unitCost}
                  onChange={(e) => setNewWaste({ ...newWaste, unitCost: e.target.value })}
                  className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
              {newWaste.quantity && newWaste.unitCost && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-700 mb-1">Total Waste Value</p>
                  <p className="text-lg font-bold text-red-600">
                    ₱{(parseFloat(newWaste.quantity) * parseFloat(newWaste.unitCost)).toFixed(2)}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
                <textarea
                  value={newWaste.notes}
                  onChange={(e) => setNewWaste({ ...newWaste, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-input-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  rows={2}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWasteModal(false)}
                  className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg transition-all text-sm"
                >
                  Log Waste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Approval Modal */}
      {showApprovalModal && approvalTransfer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md border border-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                  <ClipboardCheck className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-lg font-bold text-foreground">{isAdmin ? "Review Transfer Request" : "Withdraw Transfer Request"}</h2>
              </div>
              <button onClick={closeApproval} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
                <span className="text-xs text-muted-foreground">Transfer ID</span>
                <span className="text-sm font-semibold text-primary">{approvalTransfer.id}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Item</p>
                <p className="text-sm font-medium text-foreground">{approvalTransfer.item}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="text-sm font-medium text-foreground">{approvalTransfer.quantity} {approvalTransfer.unit}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  {getStatusBadge(approvalTransfer.status)}
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="truncate text-sm font-medium text-foreground">{approvalTransfer.from}</p>
                </div>
                <ArrowLeftRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 text-right">
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="truncate text-sm font-medium text-foreground">{approvalTransfer.to}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Requested By</p>
                  <p className="text-sm font-medium text-foreground">{approvalTransfer.requestedBy}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Request Date</p>
                  <p className="text-sm font-medium text-foreground">{approvalTransfer.requestDate}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm text-foreground">{approvalTransfer.notes || "No notes"}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  {isAdmin ? (
                    <>Reason for rejection <span className="font-normal text-muted-foreground">(required to reject)</span></>
                  ) : (
                    <>Reason for withdrawing <span className="font-normal text-muted-foreground">(optional)</span></>
                  )}
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Insufficient stock at source, duplicate request, wrong destination…"
                  rows={2}
                  className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/50"
                />
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  {isAdmin ? (
                    <>Approving dispatches the stock and moves this request to <span className="font-semibold">In Transit</span>. Rejecting cancels the request and records the reason on the transfer and audit trail.</>
                  ) : (
                    <>Withdrawing cancels your own pending request. You'll need to submit a new request if this was a mistake.</>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-2 p-4 border-t border-border sticky bottom-0 bg-card">
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleRejectTransfer(approvalTransfer.id, rejectReason, true)}
                    disabled={moveTransfer.isPending || rejectReason.trim().length === 0}
                    title={rejectReason.trim().length === 0 ? "Enter a reason to reject" : undefined}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed transition-all dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproveTransfer(approvalTransfer.id)}
                    disabled={moveTransfer.isPending}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:shadow-lg hover:shadow-green-600/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {moveTransfer.isPending ? "Processing…" : "Approve & Dispatch"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={closeApproval}
                    disabled={moveTransfer.isPending}
                    className="flex-1 px-4 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  >
                    Keep Request
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectTransfer(approvalTransfer.id, rejectReason, false)}
                    disabled={moveTransfer.isPending}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed transition-all dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                  >
                    <X className="w-4 h-4" />
                    {moveTransfer.isPending ? "Processing…" : "Withdraw Request"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md border border-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
              <h2 className="text-lg font-bold text-foreground">
                {'status' in selectedItem ? 'Transfer' : 'wasteType' in selectedItem ? 'Waste Log' : 'Adjustment'} Details
              </h2>
              <button onClick={() => setShowDetailsModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {'status' in selectedItem ? (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Transfer ID</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Item</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.item}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Quantity</p>
                      <p className="text-sm font-medium text-foreground">{selectedItem.quantity} {selectedItem.unit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      {getStatusBadge(selectedItem.status)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">From</p>
                      <p className="text-sm font-medium text-foreground">{selectedItem.from}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">To</p>
                      <p className="text-sm font-medium text-foreground">{selectedItem.to}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Requested By</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.requestedBy}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Request Date</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.requestDate}</p>
                  </div>
                  {selectedItem.approvedBy && (
                    <div>
                      <p className="text-xs text-muted-foreground">Approved By</p>
                      <p className="text-sm font-medium text-foreground">{selectedItem.approvedBy}</p>
                    </div>
                  )}
                  {selectedItem.completedDate && (
                    <div>
                      <p className="text-xs text-muted-foreground">Completed Date</p>
                      <p className="text-sm font-medium text-foreground">{selectedItem.completedDate}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm text-foreground">{selectedItem.notes || "No notes"}</p>
                  </div>
                </>
              ) : 'wasteType' in selectedItem ? (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Waste Log ID</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Item</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.item}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Quantity</p>
                      <p className="text-sm font-medium text-foreground">{selectedItem.quantity} {selectedItem.unit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      {getWasteTypeBadge(selectedItem.wasteType)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.location}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Unit Cost</p>
                      <p className="text-sm font-medium text-foreground">₱{selectedItem.unitCost.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Value</p>
                      <p className="text-sm font-bold text-red-600">₱{selectedItem.totalValue.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Source</p>
                      {getSourceBadge(selectedItem.source)}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="text-sm font-medium text-foreground">{selectedItem.date}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Logged By</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.loggedBy}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm text-foreground">{selectedItem.notes || "No notes"}</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Adjustment ID</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Item</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.item}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Quantity</p>
                      <p className="text-sm font-medium text-foreground">{selectedItem.quantity} {selectedItem.unit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      {getAdjustmentBadge(selectedItem.type)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.location}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reason</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.reason}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Adjusted By</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.adjustedBy}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="text-sm font-medium text-foreground">{selectedItem.date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm text-foreground">{selectedItem.notes || "No notes"}</p>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-border sticky bottom-0 bg-card">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="w-full px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-all text-sm"
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
