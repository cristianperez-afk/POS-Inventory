import { useState } from "react";
import { Search, CheckCircle, Package, Calendar, AlertCircle, ClipboardCheck, X, XCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { getStorageTemperatureOptions } from "../lib/inventoryLogic";
import {
  useRestaurantGoodsRecordsQuery,
  useReceiveRestaurantPurchaseOrderMutation,
  useRestaurantStorageTemperatureOptionsQuery,
  useUpsertRestaurantStorageTemperatureOptionsMutation,
} from "../lib/restaurant";

type QualityCheckCriteria = {
  appearance: "pass" | "fail" | "";
  quantity: "pass" | "fail" | "";
  temperature: "pass" | "fail" | "";
  expiration: "pass" | "fail" | "";
  packaging: "pass" | "fail" | "";
};

type InspectionCriterionKey = "appearance" | "quantity" | "temperature" | "expiration" | "packaging";

type QualityCriterionScore = {
  passed: number;
  total: number;
  remarks?: string;
};

type ReceivedItem = {
  backendItemId?: string;
  productId?: string;
  inventoryId?: number;
  sku?: string;
  productName: string;
  quantity: number;
  unit: string;
  category?: string;
  subCategory?: string;
  unitPrice: number;
  expiryDate?: string;
  storageTemperature?: string;
  acceptedQuantity?: number;
  rejectedQuantity?: number;
  qualityRemarks?: string;
  qualityStatus?: "accepted" | "partial" | "rejected";
  qualityScores?: Partial<Record<InspectionCriterionKey, QualityCriterionScore>>;
  condition: string;
};

type GoodsItem = {
  id: string;
  poId: string;
  supplier: string;
  receivedDate: string;
  items: number;
  receivedItems?: ReceivedItem[];
  totalValue: number;
  receivedBy: string;
  status: string;
  notes: string;
  qualityCheck?: {
    appearance: "pass" | "fail";
    quantity: "pass" | "fail";
    temperature: "pass" | "fail";
    expiration: "pass" | "fail";
    packaging: "pass" | "fail";
  };
};

const INSPECTION_CRITERIA: Array<{ key: InspectionCriterionKey; label: string; description: string }> = [
  { key: "appearance", label: "Appearance & Freshness", description: "Visible spoilage, damage, discoloration, freshness" },
  { key: "quantity", label: "Quantity Verification", description: "Count or weight received versus ordered" },
  { key: "temperature", label: "Temperature Control", description: "Cold chain or required holding temperature" },
  { key: "expiration", label: "Expiration Dates", description: "Usable shelf life and date labeling" },
  { key: "packaging", label: "Packaging Integrity", description: "Seals, tears, leaks, contamination risk" },
];

const NOT_RECEIVED_QC_TOTAL = 5;

const INSPECTION_SHORT_LABELS: Record<InspectionCriterionKey, string> = {
  appearance: "Appearance",
  quantity: "Quantity",
  temperature: "Temp",
  expiration: "Expiry",
  packaging: "Packaging",
};

const getAcceptedQuantity = (item: ReceivedItem) => item.acceptedQuantity ?? item.quantity;

const buildNotReceivedScores = () => {
  return INSPECTION_CRITERIA.reduce((scores, criterion) => ({
    ...scores,
    [criterion.key]: {
      passed: 0,
      total: NOT_RECEIVED_QC_TOTAL,
      remarks: "Item not received",
    },
  }), {} as Record<InspectionCriterionKey, QualityCriterionScore>);
};

const getItemQualityStatus = (item: ReceivedItem) => {
  const acceptedQuantity = getAcceptedQuantity(item);
  const rejectedQuantity = item.rejectedQuantity ?? Math.max(item.quantity - acceptedQuantity, 0);
  const status = item.qualityStatus || (acceptedQuantity <= 0 ? "rejected" : rejectedQuantity > 0 ? "partial" : "accepted");

  if (status === "accepted") {
    return {
      label: "Accepted",
      className: "bg-green-100 text-green-700 border-green-200",
    };
  }

  if (status === "partial") {
    return {
      label: "Partial",
      className: "bg-orange-100 text-orange-700 border-orange-200",
    };
  }

  return {
    label: "Rejected",
    className: "bg-red-100 text-red-700 border-red-200",
  };
};

const getQualityScoreTone = (score?: QualityCriterionScore) => {
  if (!score || score.total <= 0) return "bg-muted text-muted-foreground border-border";
  const ratio = score.passed / score.total;
  if (ratio >= 1) return "bg-green-50 text-green-700 border-green-200";
  if (ratio >= 0.8) return "bg-yellow-50 text-yellow-800 border-yellow-200";
  return "bg-red-50 text-red-700 border-red-200";
};

const getPayableItemTotal = (item: ReceivedItem) => getAcceptedQuantity(item) * item.unitPrice;

const getPayableTotal = (items: ReceivedItem[] = []) => {
  return items.reduce((sum, item) => sum + getPayableItemTotal(item), 0);
};

export function GoodsReceived() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [showQualityCheckModal, setShowQualityCheckModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GoodsItem | null>(null);
  const [viewItem, setViewItem] = useState<GoodsItem | null>(null);
  const [qualityCheckCriteria, setQualityCheckCriteria] = useState<QualityCheckCriteria>({
    appearance: "",
    quantity: "",
    temperature: "",
    expiration: "",
    packaging: "",
  });
  const [qualityNotes, setQualityNotes] = useState("");
  const [checkedItems, setCheckedItems] = useState<{ [key: number]: boolean }>({});
  const [expiryDates, setExpiryDates] = useState<{ [key: number]: string }>({});
  const [storageTemperatures, setStorageTemperatures] = useState<{ [key: number]: string }>({});
  const [acceptedQuantities, setAcceptedQuantities] = useState<{ [key: number]: string }>({});
  const [itemRemarks, setItemRemarks] = useState<{ [key: number]: string }>({});
  const [itemCriteriaScores, setItemCriteriaScores] = useState<{
    [itemIndex: number]: Partial<Record<InspectionCriterionKey, { passed: string; total: string; remarks: string }>>;
  }>({});
  const { data: storageTemperatureOptions = getStorageTemperatureOptions() } = useRestaurantStorageTemperatureOptionsQuery();
  const [newStorageTemperature, setNewStorageTemperature] = useState("");

  const { data: receivedGoods = [] } = useRestaurantGoodsRecordsQuery() as { data?: GoodsItem[] };
  const receiveOrder = useReceiveRestaurantPurchaseOrderMutation();
  const saveTemperatureOptions = useUpsertRestaurantStorageTemperatureOptionsMutation();

  const dateFilters = ["all", "today", "week", "month"];

  const openQualityCheck = (item: GoodsItem) => {
    setSelectedItem(item);
    setShowQualityCheckModal(true);
    setQualityCheckCriteria({
      appearance: "",
      quantity: "",
      temperature: "",
      expiration: "",
      packaging: "",
    });
    setQualityNotes("");
    setExpiryDates({});
    setStorageTemperatures({});
    setAcceptedQuantities({});
    setItemRemarks({});
    setItemCriteriaScores({});
    // Initialize all items as unchecked
    const initialCheckedState: { [key: number]: boolean } = {};
    const initialAcceptedQuantities: { [key: number]: string } = {};
    const initialExpiryDates: { [key: number]: string } = {};
    const initialStorageTemperatures: { [key: number]: string } = {};
    const initialRemarks: { [key: number]: string } = {};
    const initialCriteriaScores: {
      [itemIndex: number]: Partial<Record<InspectionCriterionKey, { passed: string; total: string; remarks: string }>>;
    } = {};
    if (item.receivedItems) {
      item.receivedItems.forEach((receivedItem, index) => {
        const acceptedQuantity = receivedItem.acceptedQuantity ?? receivedItem.quantity;
        initialCheckedState[index] = acceptedQuantity > 0;
        initialAcceptedQuantities[index] = String(acceptedQuantity);
        initialExpiryDates[index] = receivedItem.expiryDate || "";
        initialStorageTemperatures[index] = receivedItem.storageTemperature || "";
        initialRemarks[index] = receivedItem.qualityRemarks || "";
        initialCriteriaScores[index] = {};
        INSPECTION_CRITERIA.forEach((criterion) => {
          const savedScore = receivedItem.qualityScores?.[criterion.key];
          initialCriteriaScores[index][criterion.key] = {
            passed: String(savedScore?.passed ?? acceptedQuantity),
            total: String(savedScore?.total ?? receivedItem.quantity),
            remarks: savedScore?.remarks || "",
          };
        });
      });
    }
    setCheckedItems(initialCheckedState);
    setAcceptedQuantities(initialAcceptedQuantities);
    setExpiryDates(initialExpiryDates);
    setStorageTemperatures(initialStorageTemperatures);
    setItemRemarks(initialRemarks);
    setItemCriteriaScores(initialCriteriaScores);
  };

  const handleCriteriaChange = (criterion: keyof QualityCheckCriteria, value: "pass" | "fail") => {
    setQualityCheckCriteria({
      ...qualityCheckCriteria,
      [criterion]: value,
    });
  };

  const handleItemCheck = (index: number) => {
    const item = selectedItem?.receivedItems?.[index];
    const isChecked = !checkedItems[index];
    const nextCriteriaScores = { ...itemCriteriaScores };

    if (!isChecked) {
      nextCriteriaScores[index] = {};
      INSPECTION_CRITERIA.forEach((criterion) => {
        nextCriteriaScores[index][criterion.key] = {
          passed: "0",
          total: String(NOT_RECEIVED_QC_TOTAL),
          remarks: "Item not received",
        };
      });
    }

    setCheckedItems({
      ...checkedItems,
      [index]: isChecked,
    });
    setAcceptedQuantities({
      ...acceptedQuantities,
      [index]: isChecked ? String(item?.quantity || 0) : "0",
    });
    setItemCriteriaScores(nextCriteriaScores);
  };

  const handleExpiryDateChange = (index: number, value: string) => {
    setExpiryDates({
      ...expiryDates,
      [index]: value,
    });
  };

  const handleStorageTemperatureChange = (index: number, value: string) => {
    setStorageTemperatures({
      ...storageTemperatures,
      [index]: value,
    });
  };

  const handleAddStorageTemperature = async () => {
    const trimmed = newStorageTemperature.trim();
    if (!trimmed || storageTemperatureOptions.includes(trimmed)) return;
    const nextOptions = [...storageTemperatureOptions, trimmed];
    await saveTemperatureOptions.mutateAsync(nextOptions);
    setNewStorageTemperature("");
  };

  const handleAcceptedQuantityChange = (index: number, value: string) => {
    const item = selectedItem?.receivedItems?.[index];
    const maxQuantity = item?.quantity || 0;
    const nextQuantity = Math.min(Math.max(Number(value) || 0, 0), maxQuantity);
    setAcceptedQuantities({
      ...acceptedQuantities,
      [index]: value === "" ? "" : String(nextQuantity),
    });
    setCheckedItems({
      ...checkedItems,
      [index]: nextQuantity > 0,
    });
  };

  const handleItemRemarksChange = (index: number, value: string) => {
    setItemRemarks({
      ...itemRemarks,
      [index]: value,
    });
  };

  const handleCriterionScoreChange = (
    itemIndex: number,
    criterion: InspectionCriterionKey,
    field: "passed" | "total" | "remarks",
    value: string
  ) => {
    setItemCriteriaScores({
      ...itemCriteriaScores,
      [itemIndex]: {
        ...itemCriteriaScores[itemIndex],
        [criterion]: {
          passed: itemCriteriaScores[itemIndex]?.[criterion]?.passed || "",
          total: itemCriteriaScores[itemIndex]?.[criterion]?.total || "",
          remarks: itemCriteriaScores[itemIndex]?.[criterion]?.remarks || "",
          [field]: value,
        },
      },
    });
  };

  const handleQualityCheckSubmit = async (decision: "accept" | "reject") => {
    if (!selectedItem) return;

    const totalItems = selectedItem.receivedItems?.length || 0;
    const receivedItems = selectedItem.receivedItems || [];
    const checkedItemsCount = receivedItems.filter((item, index) => (Number(acceptedQuantities[index]) || 0) > 0).length;
    const totalAcceptedQuantity = receivedItems.reduce((sum, item, index) => {
      return sum + Math.min(Math.max(Number(acceptedQuantities[index]) || 0, 0), item.quantity);
    }, 0);
    const totalOrderedQuantity = receivedItems.reduce((sum, item) => sum + item.quantity, 0);

    if (decision === "accept" && totalItems > 0 && totalAcceptedQuantity === 0) {
      toast.error("Enter accepted quantity for at least one item");
      return;
    }

    const missingExpiryItem = selectedItem.receivedItems?.find((_, index) =>
      (Number(acceptedQuantities[index]) || 0) > 0 && !expiryDates[index]
    );

    if (decision === "accept" && missingExpiryItem) {
      toast.error(`Please set expiry date for ${missingExpiryItem.productName}`);
      return;
    }

    const missingStorageTemperatureItem = selectedItem.receivedItems?.find((_, index) =>
      (Number(acceptedQuantities[index]) || 0) > 0 && !storageTemperatures[index]?.trim()
    );

    if (decision === "accept" && missingStorageTemperatureItem) {
      toast.error(`Please set storage temperature for ${missingStorageTemperatureItem.productName}`);
      return;
    }

    const invalidScoreItem = receivedItems.find((item, itemIndex) =>
      INSPECTION_CRITERIA.some((criterion) => {
        const score = itemCriteriaScores[itemIndex]?.[criterion.key];
        const passed = Number(score?.passed);
        const total = Number(score?.total);
        return !score || !Number.isFinite(passed) || !Number.isFinite(total) || total <= 0 || passed < 0 || passed > total;
      })
    );

    if (invalidScoreItem) {
      toast.error(`Please complete valid inspection scores for ${invalidScoreItem.productName}`);
      return;
    }

    const allItemsReceived = totalAcceptedQuantity === totalOrderedQuantity;

    let newStatus = "";
    let newNotes = "";

    if (decision === "reject") {
      // Reject & Return - for any quality failures
      newStatus = "rejected";
      newNotes = `All goods rejected for return/refund. ${qualityNotes || "Items returned to supplier."}`;
    } else if (decision === "accept") {
      if (allItemsReceived) {
        // All items checked + all Pass → Verified
        newStatus = "verified";
        newNotes = `Quality check passed. Accepted ${totalAcceptedQuantity} of ${totalOrderedQuantity} units. ${qualityNotes || "All criteria met."}`;
      } else {
        // Missing items → Partial
        newStatus = "partial";
        newNotes = `Partial goods accepted: ${totalAcceptedQuantity} of ${totalOrderedQuantity} units accepted. Rejected/return/refund quantity: ${totalOrderedQuantity - totalAcceptedQuantity}. ${qualityNotes || ""}`;
      }
    }

    const receivedItemsWithExpiry: ReceivedItem[] | undefined = selectedItem.receivedItems?.map((item, index) => ({
      ...item,
      expiryDate: (Number(acceptedQuantities[index]) || 0) > 0 ? expiryDates[index] : item.expiryDate,
      storageTemperature: (Number(acceptedQuantities[index]) || 0) > 0 ? storageTemperatures[index] : item.storageTemperature,
      acceptedQuantity: decision === "reject" ? 0 : Math.min(Math.max(Number(acceptedQuantities[index]) || 0, 0), item.quantity),
      rejectedQuantity: decision === "reject" ? item.quantity : item.quantity - Math.min(Math.max(Number(acceptedQuantities[index]) || 0, 0), item.quantity),
      qualityRemarks: itemRemarks[index] || "",
      qualityScores: INSPECTION_CRITERIA.reduce((scores, criterion) => {
        const score = itemCriteriaScores[index]?.[criterion.key];
        return {
          ...scores,
          [criterion.key]: {
            passed: Number(score?.passed) || 0,
            total: Number(score?.total) || item.quantity,
            remarks: score?.remarks || "",
          },
        };
      }, {} as Record<InspectionCriterionKey, QualityCriterionScore>),
      qualityStatus: (decision === "reject"
        ? "rejected"
        : (Number(acceptedQuantities[index]) || 0) === 0
          ? "rejected"
          : (Number(acceptedQuantities[index]) || 0) < item.quantity
          ? "partial"
            : "accepted") as ReceivedItem["qualityStatus"],
    }));
    try {
      await receiveOrder.mutateAsync({
        id: selectedItem.poId,
        notes: newNotes,
        items: (receivedItemsWithExpiry ?? []).map((item) => {
          if (!item.backendItemId) throw new Error(`Purchase order line is missing for ${item.productName}`);
          return {
          id: item.backendItemId,
          receivedQty: item.acceptedQuantity ?? 0,
          rejectedQty: item.rejectedQuantity ?? 0,
          condition: item.qualityStatus,
          notes: JSON.stringify({
            remarks: item.qualityRemarks || undefined,
            qualityScores: item.qualityScores,
          }),
          expiryDate: item.acceptedQuantity && item.expiryDate
            ? new Date(`${item.expiryDate}T00:00:00`).toISOString()
            : undefined,
          storageTemperature: item.acceptedQuantity ? item.storageTemperature || undefined : undefined,
          };
        }),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to receive purchase order");
      return;
    }

    setShowQualityCheckModal(false);
    setSelectedItem(null);
    setQualityNotes("");
    toast.success(decision === "reject" ? "Goods rejected" : "Goods receipt saved");
  };

  const handleViewDetails = (item: GoodsItem) => {
    setViewItem(item);
    setShowViewModal(true);
  };

  const filteredGoods = receivedGoods.filter(item => {
    const matchesSearch = (item.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (item.poId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (item.supplier || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const canAcceptSelectedGoods = Boolean(
    selectedItem?.receivedItems?.some((item, index) => Math.min(Math.max(Number(acceptedQuantities[index]) || 0, 0), item.quantity) > 0) &&
    selectedItem.receivedItems.every((item, index) => {
      const acceptedQuantity = Math.min(Math.max(Number(acceptedQuantities[index]) || 0, 0), item.quantity);
      return acceptedQuantity <= 0 || (Boolean(expiryDates[index] || item.expiryDate) && Boolean((storageTemperatures[index] || item.storageTemperature || "").trim()));
    })
  );

  const getStatusBadge = (status: string) => {
    const styles = {
      verified: "bg-green-100 text-green-700 border-green-200",
      pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
      partial: "bg-orange-100 text-orange-700 border-orange-200",
      rejected: "bg-red-100 text-red-700 border-red-200",
    };
    const icons = {
      verified: CheckCircle,
      pending: AlertCircle,
      partial: Package,
      rejected: XCircle,
    };
    const Icon = icons[status as keyof typeof icons];
    const style = styles[status as keyof typeof styles];

    if (!Icon || !style) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium border inline-flex items-center gap-1 bg-gray-100 text-gray-700 border-gray-200">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
    }

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium border inline-flex items-center gap-1 ${style}`}>
        <Icon className="w-5 h-5" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const stats = [
    {
      label: "Total Received",
      value: receivedGoods.length,
      icon: Package,
      color: "from-blue-500 to-cyan-500",
    },
    {
      label: "Verified",
      value: receivedGoods.filter(g => g.status === "verified").length,
      icon: CheckCircle,
      color: "from-green-500 to-emerald-500",
    },
    {
      label: "Pending QC",
      value: receivedGoods.filter(g => g.status === "pending").length,
      icon: AlertCircle,
      color: "from-yellow-500 to-orange-500",
    },
    {
      label: "Rejected",
      value: receivedGoods.filter(g => g.status === "rejected").length,
      icon: XCircle,
      color: "from-red-500 to-rose-500",
    },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Goods Received</h1>
        <p className="text-muted-foreground">Track and verify incoming inventory shipments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-card rounded-2xl p-6 shadow-sm border border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-muted-foreground text-sm mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
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
              placeholder="Search by GR ID, PO ID, or supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-input-background border border-input rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="pl-12 pr-8 py-3 bg-input-background border border-input rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer min-w-[200px]"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>
      </div>

      {/* Goods Received Table */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">GR ID</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">PO Reference</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Supplier</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Received Date</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Items</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Payable Total</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Received By</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Status</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredGoods.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-medium text-primary">{item.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-foreground font-medium">{item.poId}</span>
                  </td>
                  <td className="px-6 py-4 text-foreground">{item.supplier}</td>
                  <td className="px-6 py-4 text-muted-foreground">{item.receivedDate}</td>
                  <td className="px-6 py-4 text-foreground">{item.items}</td>
                  <td className="px-6 py-4 text-foreground font-medium">₱{item.totalValue.toLocaleString()}</td>
                  <td className="px-6 py-4 text-muted-foreground">{item.receivedBy}</td>
                  <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {item.status === "pending" && (
                        <button
                          onClick={() => openQualityCheck(item)}
                          className="px-3 py-2 bg-blue-600 text-white text-xs rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
                        >
                          <ClipboardCheck className="w-4 h-4" />
                          Quality Check
                        </button>
                      )}
                      {item.status !== "pending" && (
                        <button
                          onClick={() => handleViewDetails(item)}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded-xl transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
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

      {/* Recent Activity Timeline */}
      <div className="mt-8 bg-card rounded-2xl p-6 shadow-sm border border-border">
        <h2 className="text-lg font-bold text-foreground mb-6">Receiving History</h2>
        <div className="space-y-6">
          {receivedGoods.slice(0, 3).map((item, index) => (
            <div key={index} className="flex gap-6">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  item.status === 'verified' ? 'bg-green-100 text-green-600' :
                  item.status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                  'bg-orange-100 text-orange-600'
                }`}>
                  <Package className="w-4 h-4" />
                </div>
                {index < 2 && <div className="w-0.5 h-full bg-border mt-2"></div>}
              </div>
              <div className="flex-1 pb-6">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-foreground">{item.id} - {item.supplier}</p>
                    <p className="text-sm text-muted-foreground">{item.items} items received</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{item.receivedDate}</span>
                </div>
                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-2xl">{item.notes}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quality Check Modal */}
      {showQualityCheckModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowQualityCheckModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
                  <ClipboardCheck className="w-7 h-7 text-blue-600" />
                  Quality Check
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedItem.id} - {selectedItem.supplier}
                </p>
              </div>
              <button
                onClick={() => setShowQualityCheckModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
                <h3 className="text-sm font-semibold">Item-level inspection scoring</h3>
                <p className="mt-1 text-sm">Score every received line item by criterion, for example 10/10 appearance or 9/10 packaging. Accepted quantity is the only quantity added to inventory; rejected quantity is kept for return/refund follow-up.</p>
              </div>

              {/* Items Checklist */}
              {selectedItem.receivedItems && selectedItem.receivedItems.length > 0 && (
                <div className="border-t border-border pt-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center justify-between">
                    <span>Received Items Verification</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {Object.values(checkedItems).filter(checked => checked).length} / {selectedItem.receivedItems.length} items checked
                    </span>
                  </h3>
                  <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                    <p className="text-sm text-muted-foreground mb-3">
                      Enter the accepted quantity per item. Rejected quantity is returned/refunded and will not be added to inventory.
                    </p>
                    {selectedItem.receivedItems.map((item, index) => (
                      <div
                        key={index}
                        className={`grid grid-cols-[auto_1fr] gap-3 p-3 rounded-lg border transition-all ${
                          checkedItems[index]
                            ? "bg-green-50 border-green-200"
                            : "bg-white border-border hover:bg-muted/20"
                        }`}
                      >
                        <input
                          type="checkbox"
                          id={`item-${index}`}
                          checked={checkedItems[index] || false}
                          onChange={() => handleItemCheck(index)}
                          className="w-5 h-5 rounded border-2 border-primary text-primary focus:ring-2 focus:ring-primary/50 cursor-pointer"
                        />
                        <label htmlFor={`item-${index}`} className="cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className={`font-medium ${checkedItems[index] ? "text-green-700" : "text-foreground"}`}>
                                {item.productName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Ordered/received: {item.quantity} {item.unit} x ₱{item.unitPrice.toFixed(2)} = ₱{(item.quantity * item.unitPrice).toFixed(2)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Accepted: {Number(acceptedQuantities[index]) || 0}/{item.quantity} {item.unit} | Rejected/return: {item.quantity - Math.min(Math.max(Number(acceptedQuantities[index]) || 0, 0), item.quantity)} {item.unit}
                              </p>
                              <p className="text-xs font-medium text-green-700">
                                Payable: ₱{(Math.min(Math.max(Number(acceptedQuantities[index]) || 0, 0), item.quantity) * item.unitPrice).toFixed(2)}
                              </p>
                            </div>
                            {checkedItems[index] && (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            )}
                          </div>
                        </label>
                        <div className="col-start-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <label htmlFor={`accepted-quantity-${index}`} className="mb-1 block text-xs font-medium text-foreground">
                              Accepted quantity
                            </label>
                            <input
                              id={`accepted-quantity-${index}`}
                              type="number"
                              min="0"
                              max={item.quantity}
                              step="0.01"
                              value={acceptedQuantities[index] ?? ""}
                              onChange={(event) => handleAcceptedQuantityChange(index, event.target.value)}
                              className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-foreground">
                              Rejected/return quantity
                            </label>
                            <input
                              type="text"
                              value={`${item.quantity - Math.min(Math.max(Number(acceptedQuantities[index]) || 0, 0), item.quantity)} ${item.unit}`}
                              readOnly
                              className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground outline-none"
                            />
                          </div>
                          <div className="md:col-span-2 rounded-lg border border-border bg-white p-3">
                            <p className="mb-3 text-xs font-semibold text-foreground">Inspection criteria score</p>
                            <div className="space-y-3">
                              {INSPECTION_CRITERIA.map((criterion) => (
                                <div key={criterion.key} className="grid grid-cols-1 gap-2 md:grid-cols-[1.2fr_90px_20px_90px_1.4fr] md:items-center">
                                  <div>
                                    <p className="text-xs font-medium text-foreground">{criterion.label}</p>
                                    <p className="text-[11px] text-muted-foreground">{criterion.description}</p>
                                  </div>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={itemCriteriaScores[index]?.[criterion.key]?.passed || ""}
                                    onChange={(event) => handleCriterionScoreChange(index, criterion.key, "passed", event.target.value)}
                                    className="rounded-lg border border-input bg-input-background px-2 py-2 text-sm outline-none focus:border-primary"
                                    aria-label={`${criterion.label} passed score`}
                                  />
                                  <span className="text-center text-sm text-muted-foreground">/</span>
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={itemCriteriaScores[index]?.[criterion.key]?.total || ""}
                                    onChange={(event) => handleCriterionScoreChange(index, criterion.key, "total", event.target.value)}
                                    className="rounded-lg border border-input bg-input-background px-2 py-2 text-sm outline-none focus:border-primary"
                                    aria-label={`${criterion.label} total score`}
                                  />
                                  <input
                                    type="text"
                                    value={itemCriteriaScores[index]?.[criterion.key]?.remarks || ""}
                                    onChange={(event) => handleCriterionScoreChange(index, criterion.key, "remarks", event.target.value)}
                                    placeholder="Criterion remarks"
                                    className="rounded-lg border border-input bg-input-background px-2 py-2 text-sm outline-none focus:border-primary"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label htmlFor={`expiry-${index}`} className="mb-1 block text-xs font-medium text-foreground">
                              Expiry date
                            </label>
                            <input
                              id={`expiry-${index}`}
                              type="date"
                              value={expiryDates[index] || item.expiryDate || ""}
                              onChange={(event) => handleExpiryDateChange(index, event.target.value)}
                              disabled={!checkedItems[index]}
                              className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <label htmlFor={`storage-temperature-${index}`} className="mb-1 block text-xs font-medium text-foreground">
                              Storage temperature
                            </label>
                            <select
                              id={`storage-temperature-${index}`}
                              value={storageTemperatures[index] || item.storageTemperature || ""}
                              onChange={(event) => handleStorageTemperatureChange(index, event.target.value)}
                              disabled={!checkedItems[index]}
                              className="w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                            >
                              <option value="">Select storage temperature</option>
                              {storageTemperatureOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                            <div className="mt-2 flex gap-2">
                              <input
                                type="text"
                                value={newStorageTemperature}
                                onChange={(event) => setNewStorageTemperature(event.target.value)}
                                placeholder="Add storage temperature"
                                className="min-w-0 flex-1 rounded-lg border border-input bg-input-background px-2 py-2 text-xs outline-none focus:border-primary"
                              />
                              <button
                                type="button"
                                onClick={handleAddStorageTemperature}
                                disabled={!newStorageTemperature.trim()}
                                className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                          <div className="md:col-span-2">
                            <label htmlFor={`item-remarks-${index}`} className="mb-1 block text-xs font-medium text-foreground">
                              Item remarks
                            </label>
                            <textarea
                              id={`item-remarks-${index}`}
                              value={itemRemarks[index] || ""}
                              onChange={(event) => handleItemRemarksChange(index, event.target.value)}
                              placeholder="Reason for rejected quantity, damages, missing items, refund notes..."
                              className="min-h-16 w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                          </div>
                          <p className="md:col-span-2 text-xs text-muted-foreground">Expiry and storage temperature are required only for accepted quantity.</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quality Notes */}
              <div>
                <label htmlFor="qualityNotes" className="block text-sm font-semibold text-foreground mb-2">
                  Quality Check Notes
                </label>
                <textarea
                  id="qualityNotes"
                  value={qualityNotes}
                  onChange={(e) => setQualityNotes(e.target.value)}
                  placeholder="Add any additional notes about the quality inspection..."
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all min-h-[100px] resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-border">
                <button
                  onClick={() => handleQualityCheckSubmit("accept")}
                  disabled={!canAcceptSelectedGoods}
                  className="flex-1 px-6 py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all duration-200 flex items-center justify-center gap-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-5 h-5" />
                  Complete QC & Add Accepted Stock
                </button>
                <button
                  onClick={() => handleQualityCheckSubmit("reject")}
                  className="flex-1 px-6 py-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all duration-200 flex items-center justify-center gap-2 font-semibold"
                >
                  <XCircle className="w-5 h-5" />
                  Reject & Return
                </button>
                <button
                  onClick={() => setShowQualityCheckModal(false)}
                  className="px-6 py-4 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {showViewModal && viewItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowViewModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-6xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Goods Received Details</h2>
                <p className="text-sm text-muted-foreground mt-1">{viewItem.id}</p>
              </div>
              <button
                onClick={() => setShowViewModal(false)}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Receipt Information */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">PO Reference</p>
                    <p className="text-lg font-semibold text-primary">{viewItem.poId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Supplier</p>
                    <p className="text-foreground font-medium">{viewItem.supplier}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Received Date</p>
                    <p className="text-foreground">{viewItem.receivedDate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Received By</p>
                    <p className="text-foreground">{viewItem.receivedBy}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Status</p>
                    {getStatusBadge(viewItem.status)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Items</p>
                    <p className="text-foreground">{viewItem.items} items</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Payable Total</p>
                    <p className="text-2xl font-bold text-primary">₱{viewItem.totalValue.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Received Items Table */}
              {viewItem.receivedItems && viewItem.receivedItems.length > 0 && (
                <div className="border-t border-border pt-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Received Items</h3>
                  <div className="overflow-x-auto rounded-xl border border-border bg-muted/30">
                    <table className="min-w-[1580px] w-full table-fixed">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="w-36 px-4 py-3 text-left text-sm font-medium text-foreground">Product Name</th>
                          <th className="w-24 px-4 py-3 text-right text-sm font-medium text-foreground">Ordered</th>
                          <th className="w-24 px-4 py-3 text-right text-sm font-medium text-foreground">Accepted</th>
                          <th className="w-24 px-4 py-3 text-right text-sm font-medium text-foreground">Rejected</th>
                          <th className="w-20 px-4 py-3 text-left text-sm font-medium text-foreground">Unit</th>
                          <th className="w-32 px-4 py-3 text-left text-sm font-medium text-foreground">Expiry</th>
                          <th className="w-44 px-4 py-3 text-left text-sm font-medium text-foreground">Storage Temp</th>
                          <th className="w-96 px-4 py-3 text-left text-sm font-medium text-foreground">QC Result</th>
                          <th className="w-48 px-4 py-3 text-left text-sm font-medium text-foreground">Remarks</th>
                          <th className="w-28 px-4 py-3 text-right text-sm font-medium text-foreground">Unit Price</th>
                          <th className="w-32 px-4 py-3 text-left text-sm font-medium text-foreground">Condition</th>
                          <th className="w-28 px-4 py-3 text-right text-sm font-medium text-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {viewItem.receivedItems.map((item, index) => {
                          const qualityStatus = getItemQualityStatus(item);

                          return (
                          <tr key={index} className="hover:bg-muted/20">
                            <td className="px-4 py-3 text-foreground whitespace-normal break-words">{item.productName}</td>
                            <td className="px-4 py-3 text-right text-foreground">{item.quantity}</td>
                            <td className="px-4 py-3 text-right text-foreground">{item.acceptedQuantity ?? item.quantity}</td>
                            <td className="px-4 py-3 text-right text-foreground">{item.rejectedQuantity ?? 0}</td>
                            <td className="px-4 py-3 text-left text-foreground">{item.unit}</td>
                            <td className="px-4 py-3 text-left text-foreground">{item.expiryDate || "Not set"}</td>
                            <td className="px-4 py-3 text-left text-foreground whitespace-normal break-words">{item.storageTemperature || "Not set"}</td>
                            <td className="px-4 py-3 text-left">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${qualityStatus.className}`}>
                                    {qualityStatus.label}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {getAcceptedQuantity(item)} / {item.quantity} accepted
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {INSPECTION_CRITERIA.map((criterion) => {
                                    const score = item.qualityScores?.[criterion.key];

                                    return (
                                      <div
                                        key={criterion.key}
                                        className={`rounded-lg border px-2 py-1 text-[11px] leading-tight ${getQualityScoreTone(score)}`}
                                        title={score?.remarks || criterion.label}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="truncate">{INSPECTION_SHORT_LABELS[criterion.key]}</span>
                                          <span className="font-semibold">{score ? `${score.passed}/${score.total}` : "N/A"}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-left text-foreground whitespace-normal break-words">{item.qualityRemarks || "N/A"}</td>
                            <td className="px-4 py-3 text-right text-foreground">₱{item.unitPrice.toFixed(2)}</td>
                            <td className="px-4 py-3 text-foreground">{item.condition}</td>
                            <td className="px-4 py-3 text-right font-medium text-foreground">
                              ₱{getPayableItemTotal(item).toFixed(2)}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-muted/50 border-t border-border">
                        <tr>
                          <td colSpan={11} className="px-4 py-3 text-right font-semibold text-foreground">
                            Payable Grand Total:
                          </td>
                          <td className="px-4 py-3 text-right text-xl font-bold text-primary">
                            ₱{viewItem?.totalValue.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Quality Check Results */}
              {false && viewItem?.qualityCheck && (
                <div className="border-t border-border pt-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Quality Check Results</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: "appearance", label: "Appearance & Freshness" },
                      { key: "quantity", label: "Quantity Verification" },
                      { key: "temperature", label: "Temperature Control" },
                      { key: "expiration", label: "Expiration Dates" },
                      { key: "packaging", label: "Packaging Integrity" },
                    ].map((criterion) => {
                      const result = viewItem?.qualityCheck?.[criterion.key as keyof NonNullable<typeof viewItem>["qualityCheck"]];
                      return (
                        <div key={criterion.key} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                          <span className="text-sm text-foreground font-medium">{criterion.label}</span>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            result === "pass"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}>
                            {result === "pass" ? "✓ Pass" : "✗ Fail"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="border-t border-border pt-6">
                <h3 className="text-sm font-semibold text-foreground mb-2">Notes</h3>
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-sm text-foreground">{viewItem.notes}</p>
                </div>
              </div>

              {/* Close Button */}
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
    </div>
  );
}
