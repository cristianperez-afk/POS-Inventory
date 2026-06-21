import {
  useReceiveRetailPurchaseOrderMutation,
  useRetailPurchaseOrderRecordsQuery,
} from '../lib/retail';
import { autoSortItem } from '../../app/utils/autoSortingRules';
import type {
  NormalizedLine,
  PendingReceipt,
  ReceiptRecord,
  ResolvedReceivingConfig,
} from '../shared/receiving/GoodsReceived';

// Maps the retail purchase-order data onto the shared Goods Received contract.
export function useRetailReceivingConfig(): ResolvedReceivingConfig {
  const approvedQuery = useRetailPurchaseOrderRecordsQuery({ status: 'APPROVED' });
  const partialQuery = useRetailPurchaseOrderRecordsQuery({ status: 'PARTIALLY_RECEIVED' });
  const receivedQuery = useRetailPurchaseOrderRecordsQuery({ status: 'RECEIVED' });
  const receiveMutation = useReceiveRetailPurchaseOrderMutation();

  const approved = approvedQuery.data ?? [];
  const partial = partialQuery.data ?? [];
  const received = receivedQuery.data ?? [];

  const pending: PendingReceipt[] = [...approved, ...partial].map((po) => ({
    id: po.id,
    orderNumber: po.orderNumber,
    supplier: po.supplier?.name ?? '',
    status: po.status,
    total: po.totalAmount ?? 0,
    items: (po.items ?? [])
      .map((item: any) => ({
        id: item.id,
        name: item.name,
        // Quantity still to be received on this line.
        orderedQty: item.quantity - item.receivedQty - item.rejectedQty,
        unitPrice: item.unitPrice ?? 0,
        meta: { inventoryItemId: item.inventoryItemId },
      }))
      .filter((line: NormalizedLine) => line.orderedQty > 0),
  }));

  const history: ReceiptRecord[] = received.map((po) => {
    const lines = (po.items ?? []).map((item: any) => ({
      name: item.name,
      orderedQty: item.quantity,
      acceptedQty: item.receivedQty,
      rejectedQty: item.rejectedQty,
    }));
    const totalAccepted = lines.reduce((s, l) => s + l.acceptedQty, 0);
    const totalRejected = lines.reduce((s, l) => s + l.rejectedQty, 0);
    return {
      id: po.id,
      orderNumber: po.orderNumber,
      supplier: po.supplier?.name ?? '',
      receivedDate: po.receivedAt ? new Date(po.receivedAt).toLocaleDateString() : '',
      receivedAt: po.receivedAt ?? undefined,
      receivedBy: po.receivedBy?.name ?? '',
      status: totalRejected > 0 ? 'Partially Accepted' : 'Fully Accepted',
      totalAccepted,
      totalRejected,
      lines,
    };
  });

  return {
    labels: {
      title: 'Products Received',
      subtitle: 'Inspect and log received inventory shipments',
    },
    loading: approvedQuery.isLoading || partialQuery.isLoading || receivedQuery.isLoading,

    pending,
    history,

    lineFields: [
      { key: 'condition', type: 'select', label: 'Condition', options: ['Excellent', 'Good', 'Fair', 'Damaged'] },
      { key: 'inspectionNotes', type: 'textarea', label: 'Inspection Notes' },
    ],
    initLineFields: () => ({ condition: 'Good', inspectionNotes: '' }),
    rejectedMode: 'input',

    // Retail auto-sorts incoming goods from the item name + inspection notes.
    renderLineExtras: (line, draft) => {
      const autoSort = autoSortItem(line.name, draft.fields.inspectionNotes ?? '');
      return (
        <div className="mt-1 mb-1 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-[#6b7280]">Auto-Sort:</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
              autoSort.confidence === 'high'
                ? 'bg-[#E0F5F1] text-[#008967]'
                : autoSort.confidence === 'medium'
                  ? 'bg-[#fef3c6] text-[#92400e]'
                  : 'bg-[#e9ecef] text-[#6b7280]'
            }`}
          >
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
            <span className="text-[10px] text-[#E7000B]">(Low confidence — may need review)</span>
          )}
        </div>
      );
    },

    buildReceiveItem: (line, draft) => ({
      id: line.id,
      receivedQty: draft.acceptedQty, // accepted units enter stock
      rejectedQty: draft.rejectedQty,
      condition: draft.fields.condition,
      notes: draft.fields.inspectionNotes?.trim() || undefined,
    }),

    receive: async (poId, items) => {
      await receiveMutation.mutateAsync({ id: poId, items });
    },

    historyStatusClass: (status) =>
      status === 'Fully Accepted' ? 'bg-[#E0F5F1] text-[#008967]' : 'bg-[#E0F2F2] text-[#007A5E]',
  };
}
