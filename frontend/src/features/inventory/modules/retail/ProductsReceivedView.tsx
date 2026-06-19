import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Search, ChevronRight, ChevronDown, Folder, FolderOpen, AlertTriangle, Package, PackagePlus, ShoppingCart, PackageCheck, Layers, X, Eye, TrendingUp, TrendingDown, RefreshCw, CheckCircle, Users } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type {
  InventoryItem,
  PurchaseOrder,
  ProductReceived,
  Bundle,
  Transfer,
  Adjustment,
  Location,
  User,
} from '../../app/utils/generateSampleData';
import { categorySubcategories, CHART_COLORS } from '../../app/utils/constants';
import { autoSortItem } from '../../app/utils/autoSortingRules';
import {
  useReceiveRetailPurchaseOrderMutation,
  useRetailPurchaseOrderDetailQuery,
  useRetailPurchaseOrderRecordsQuery,
} from '../lib/retail';

export function ProductsReceivedView({
  currentUser
}: {
  currentUser: { email: string; role: string } | null;
}) {
  const approvedPOsQuery = useRetailPurchaseOrderRecordsQuery({ status: 'APPROVED' });
  const receivedPOsQuery = useRetailPurchaseOrderRecordsQuery({ status: 'RECEIVED' });
  const receivePurchaseOrderMutation = useReceiveRetailPurchaseOrderMutation();
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null);
  const selectedPODetailQuery = useRetailPurchaseOrderDetailQuery(selectedPOId ?? undefined, Boolean(selectedPOId));
  const approvedPOs = approvedPOsQuery.data ?? [];
  const receivedPOs = receivedPOsQuery.data ?? [];
  const loading = approvedPOsQuery.isLoading || receivedPOsQuery.isLoading;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any | null>(null);
  const [inspectionForm, setInspectionForm] = useState<{
    [itemId: string]: {
      receivedQty: number;
      acceptedQty: number;
      rejectedQty: number;
      condition: 'Excellent' | 'Good' | 'Fair' | 'Damaged';
      inspectionNotes: string;
    };
  }>({});
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    const fullPO = selectedPODetailQuery.data;
    if (!fullPO || selectedPO?.id === fullPO.id) return;

    const initialForm: typeof inspectionForm = {};
    (fullPO.items ?? []).forEach((item: any) => {
      initialForm[item.id] = {
        receivedQty: item.quantity,
        acceptedQty: item.quantity,
        rejectedQty: 0,
        condition: 'Good',
        inspectionNotes: '',
      };
    });
    setSelectedPO(fullPO);
    setInspectionForm(initialForm);
    setShowInspectionModal(true);
  }, [selectedPODetailQuery.data, selectedPO?.id]);

  const poTotalAccepted = (po: any) =>
    (po.items ?? []).reduce((sum: number, item: any) => sum + (item.receivedQty - item.rejectedQty), 0);

  const poTotalRejected = (po: any) =>
    (po.items ?? []).reduce((sum: number, item: any) => sum + item.rejectedQty, 0);

  const poStatus = (po: any) =>
    poTotalRejected(po) === 0 ? 'Fully Accepted' : 'Partially Accepted';

  const filteredReceipts = receivedPOs.filter(po => {
    if (filterStatus === 'all') return true;
    return poStatus(po) === filterStatus;
  });

  const stats = {
    total: receivedPOs.length,
    readyToReceive: approvedPOs.length,
    fullyAccepted: receivedPOs.filter(po => poTotalRejected(po) === 0).length,
    withRejections: receivedPOs.filter(po => poTotalRejected(po) > 0).length,
  };

  const handleStartReceiving = (po: any) => {
    setError(null);
    setSelectedPO(null);
    setSelectedPOId(po.id);
    setShowReceiveModal(false);
  };

  const handleInspectionChange = (itemId: string, field: string, value: any) => {
    setInspectionForm(prev => {
      const entry = { ...prev[itemId], [field]: value };
      if (field === 'receivedQty' || field === 'acceptedQty') {
        const rq = field === 'receivedQty' ? value : entry.receivedQty;
        const aq = field === 'acceptedQty' ? value : entry.acceptedQty;
        entry.rejectedQty = Math.max(0, rq - aq);
      }
      return { ...prev, [itemId]: entry };
    });
  };

  const handleCompleteInspection = async () => {
    if (!selectedPO || saving) return;
    try {
      setSaving(true);
      setError(null);
      const items = (selectedPO.items ?? []).map((item: any) => {
        const ins = inspectionForm[item.id] ?? { receivedQty: item.quantity, rejectedQty: 0 };
        return { id: item.id, receivedQty: ins.receivedQty, rejectedQty: ins.rejectedQty };
      });
      await receivePurchaseOrderMutation.mutateAsync({ id: selectedPO.id, items });
      setShowInspectionModal(false);
      setSelectedPO(null);
      setSelectedPOId(null);
      setInspectionForm({});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[30px] font-bold text-[#323B42]">Products Received</h2>
          <p className="text-[#323B42] text-[14px] mt-1">Inspect and log received inventory shipments</p>
        </div>
        <button
          onClick={() => setShowReceiveModal(true)}
          disabled={loading}
          className="bg-[#007A5E] text-white px-4 py-2 rounded-[8px] text-[14px] font-medium flex items-center gap-2 hover:bg-[#008967] transition-colors disabled:opacity-50"
        >
          <PackageCheck className="size-4" />
          Receive Purchase Order
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[#ffe2e2] border border-[#E7000B] rounded-[8px] text-[14px] text-[#E7000B]">
          {error}
        </div>
      )}

      {/* Select PO Modal */}
      {showReceiveModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[14px] p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[24px] font-bold text-[#323B42]">Select Purchase Order to Receive</h3>
              <button onClick={() => setShowReceiveModal(false)} className="p-2 hover:bg-[#F8FAFB] rounded">
                <X className="size-5 text-[#323B42]" />
              </button>
            </div>

            {approvedPOs.length === 0 ? (
              <p className="text-center py-8 text-[#323B42]">No approved purchase orders available</p>
            ) : (
              <div className="space-y-3">
                {approvedPOs.map(po => (
                  <div key={po.id} className="border border-[rgba(0,0,0,0.1)] rounded-[12px] p-4 hover:bg-[#F8FAFB] transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-[16px] font-semibold text-[#323B42]">{po.orderNumber}</h4>
                          <span className="px-2 py-1 rounded text-[11px] font-semibold bg-[#E0F2F2] text-[#007A5E]">
                            APPROVED
                          </span>
                        </div>
                        <p className="text-[13px] text-[#323B42]">Supplier: {po.supplier?.name ?? 'N/A'}</p>
                        <p className="text-[13px] text-[#323B42]">Date: {new Date(po.createdAt).toLocaleDateString()}</p>
                        <p className="text-[13px] text-[#323B42]">Items: {(po.items ?? []).length} | Total: ₱{(po.totalAmount ?? 0).toLocaleString()}</p>
                      </div>
                      <button
                        onClick={() => handleStartReceiving(po)}
                        className="px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[13px] font-medium hover:bg-[#008967] transition-colors"
                      >
                        Start Receiving
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inspection Modal */}
      {showInspectionModal && selectedPO && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-[14px] p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[24px] font-bold text-[#323B42]">Quality Inspection - {selectedPO.orderNumber}</h3>
                <p className="text-[14px] text-[#323B42] mt-1">Supplier: {selectedPO.supplier?.name ?? 'N/A'}</p>
              </div>
              <button onClick={() => { setShowInspectionModal(false); setSelectedPO(null); setSelectedPOId(null); }} className="p-2 hover:bg-[#F8FAFB] rounded">
                <X className="size-5 text-[#323B42]" />
              </button>
            </div>

            <div className="mb-6 bg-[#E0F5F1] border border-[#007A5E] rounded-[12px] p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="size-5 text-[#007A5E] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[14px] font-semibold text-[#007A5E] mb-1">Auto-Sorting Enabled</p>
                  <p className="text-[13px] text-[#323B42]">
                    Items will be automatically categorized based on their names and your inspection notes.
                    Review the auto-sort suggestions below and adjust the condition assessment as needed.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {(selectedPO.items ?? []).map((item: any) => {
                const inspection = inspectionForm[item.id] ?? {
                  receivedQty: item.quantity,
                  acceptedQty: item.quantity,
                  rejectedQty: 0,
                  condition: 'Good' as const,
                  inspectionNotes: '',
                };
                const autoSort = autoSortItem(item.name, inspection.inspectionNotes);

                return (
                  <div key={item.id} className="bg-[#F8FAFB] border border-[rgba(0,0,0,0.1)] rounded-[12px] p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h4 className="text-[16px] font-semibold text-[#323B42]">{item.name}</h4>
                        <p className="text-[13px] text-[#323B42]">Ordered: {item.quantity} units @ ₱{item.unitPrice ?? 0} each</p>

                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-[#6b7280]">Auto-Sort:</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            autoSort.confidence === 'high' ? 'bg-[#E0F5F1] text-[#008967]' :
                            autoSort.confidence === 'medium' ? 'bg-[#fef3c6] text-[#92400e]' :
                            'bg-[#e9ecef] text-[#6b7280]'
                          }`}>
                            {autoSort.category}
                          </span>
                          <span className="text-[11px] text-[#6b7280]">→</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#e9ecef] text-[#323B42]">
                            {autoSort.targetCustomer}
                          </span>
                          <span className="text-[11px] text-[#6b7280]">→</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#e9ecef] text-[#323B42]">
                            {autoSort.subcategory}
                          </span>
                          {autoSort.confidence === 'low' && (
                            <span className="text-[10px] text-[#E7000B]">(Low Confidence - May need review)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 mb-4">
                      <div>
                        <label className="block text-[12px] font-medium text-[#323B42] mb-2">Received Qty *</label>
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={inspection.receivedQty}
                          onChange={(e) => handleInspectionChange(item.id, 'receivedQty', parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#323B42] mb-2">Accepted Qty *</label>
                        <input
                          type="number"
                          min="0"
                          max={inspection.receivedQty}
                          value={inspection.acceptedQty}
                          onChange={(e) => handleInspectionChange(item.id, 'acceptedQty', parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#323B42] mb-2">Rejected Qty</label>
                        <input
                          type="number"
                          value={inspection.rejectedQty}
                          disabled
                          className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] bg-[#e9ecef] cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#323B42] mb-2">
                          Condition *
                          {autoSort.suggestedCondition && autoSort.suggestedCondition !== inspection.condition && (
                            <span className="ml-2 text-[10px] text-[#007A5E] font-normal">
                              (Suggested: {autoSort.suggestedCondition})
                            </span>
                          )}
                        </label>
                        <select
                          value={inspection.condition}
                          onChange={(e) => handleInspectionChange(item.id, 'condition', e.target.value)}
                          className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E]"
                        >
                          <option value="Excellent">Excellent</option>
                          <option value="Good">Good</option>
                          <option value="Fair">Fair</option>
                          <option value="Damaged">Damaged</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-[#323B42] mb-2">Inspection Notes</label>
                      <textarea
                        value={inspection.inspectionNotes}
                        onChange={(e) => handleInspectionChange(item.id, 'inspectionNotes', e.target.value)}
                        className="w-full px-3 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] focus:outline-none focus:border-[#007A5E] resize-none"
                        rows={2}
                        placeholder="Any issues, defects, or observations..."
                      />
                    </div>

                    {inspection.rejectedQty > 0 && (
                      <div className="mt-3 p-3 bg-[#fff4e6] border border-[#FFA500] rounded-[8px]">
                        <p className="text-[13px] text-[#d08700] font-medium">
                          {inspection.rejectedQty} unit(s) will be rejected
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowInspectionModal(false); setSelectedPO(null); setSelectedPOId(null); }}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-[rgba(0,0,0,0.1)] rounded-[8px] text-[14px] font-medium text-[#323B42] hover:bg-[#F8FAFB] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteInspection}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-[#007A5E] text-white rounded-[8px] text-[14px] font-medium hover:bg-[#008967] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Complete Inspection & Receive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4">
          <p className="text-[#323B42] text-[12px] mb-1">Total Receipts</p>
          <p className="text-[#323B42] text-[24px] font-bold">{loading ? '—' : stats.total}</p>
        </div>
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4">
          <p className="text-[#323B42] text-[12px] mb-1">Ready to Receive</p>
          <p className="text-[#FFA500] text-[24px] font-bold">{loading ? '—' : stats.readyToReceive}</p>
        </div>
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4">
          <p className="text-[#323B42] text-[12px] mb-1">Fully Accepted</p>
          <p className="text-[#008967] text-[24px] font-bold">{loading ? '—' : stats.fullyAccepted}</p>
        </div>
        <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-4">
          <p className="text-[#323B42] text-[12px] mb-1">With Rejections</p>
          <p className="text-[#007A5E] text-[24px] font-bold">{loading ? '—' : stats.withRejections}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] mb-4 p-4">
        <div className="flex items-center gap-2">
          <label className="text-[14px] text-[#323B42] font-medium">Status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border border-[rgba(0,0,0,0.1)] rounded-[6px] text-[14px] bg-white focus:outline-none focus:border-[#007A5E]"
          >
            <option value="all">All Receipts</option>
            <option value="Fully Accepted">Fully Accepted</option>
            <option value="Partially Accepted">Partially Accepted</option>
          </select>
        </div>
      </div>

      {/* Receipts List */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-12 text-center">
            <p className="text-[14px] text-[#6b7280]">Loading...</p>
          </div>
        ) : filteredReceipts.length === 0 ? (
          <div className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-12 text-center">
            <PackageCheck className="size-16 text-[#d1d5dc] mx-auto mb-4" />
            <p className="text-[16px] text-[#323B42] font-medium">No receipts found</p>
            <p className="text-[14px] text-[#6b7280] mt-1">Start receiving purchase orders to see them here</p>
          </div>
        ) : (
          filteredReceipts.map(po => {
            const totalAccepted = poTotalAccepted(po);
            const totalRejected = poTotalRejected(po);
            const status = poStatus(po);
            return (
              <div key={po.id} className="bg-white border border-[rgba(0,0,0,0.1)] rounded-[14px] p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-[18px] font-semibold text-[#323B42]">{po.orderNumber}</h3>
                      <span className={`px-3 py-1 rounded text-[12px] font-semibold ${
                        status === 'Fully Accepted' ? 'bg-[#E0F5F1] text-[#008967]' :
                        'bg-[#E0F2F2] text-[#007A5E]'
                      }`}>
                        {status}
                      </span>
                    </div>
                    <p className="text-[14px] text-[#323B42]">Supplier: <span className="font-medium">{po.supplier?.name ?? 'N/A'}</span></p>
                    <p className="text-[14px] text-[#323B42]">Date Received: {po.receivedAt ? new Date(po.receivedAt).toLocaleDateString() : 'N/A'}</p>
                    <p className="text-[14px] text-[#323B42]">Received By: {po.receivedBy?.name ?? 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <div className="bg-[#E0F5F1] rounded-[8px] px-4 py-2 mb-2">
                      <p className="text-[11px] text-[#323B42]">Accepted</p>
                      <p className="text-[20px] font-bold text-[#008967]">{totalAccepted}</p>
                    </div>
                    {totalRejected > 0 && (
                      <div className="bg-[#ffe2e2] rounded-[8px] px-4 py-2">
                        <p className="text-[11px] text-[#323B42]">Rejected</p>
                        <p className="text-[20px] font-bold text-[#E7000B]">{totalRejected}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-[rgba(0,0,0,0.1)] pt-4">
                  <p className="text-[14px] font-medium text-[#323B42] mb-3">Items Inspection Results:</p>
                  <div className="space-y-2">
                    {(po.items ?? []).map((item: any) => {
                      const accepted = item.receivedQty - item.rejectedQty;
                      return (
                        <div key={item.id} className="bg-[#F8FAFB] rounded-[8px] p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="text-[14px] font-medium text-[#323B42]">{item.name}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[13px] text-[#323B42]">
                                <span className="font-semibold text-[#008967]">{accepted}</span> accepted
                                {item.rejectedQty > 0 && (
                                  <> • <span className="font-semibold text-[#E7000B]">{item.rejectedQty}</span> rejected</>
                                )}
                              </p>
                              <p className="text-[12px] text-[#6b7280]">Ordered: {item.quantity} | Received: {item.receivedQty}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


// Item Bundling View
