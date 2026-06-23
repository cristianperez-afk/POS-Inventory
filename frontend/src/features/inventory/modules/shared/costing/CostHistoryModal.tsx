import { X, History, PackageCheck } from 'lucide-react';
import { useItemCostHistoryQuery } from '../../lib/domainQueries';
import { formatPeso } from '../../../app/utils/format';

interface CostHistoryModalProps {
  itemId: string;
  itemName: string;
  onClose: () => void;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Read-only detailed cost history for one inventory item. Shared by the retail and
// restaurant inventory screens so the costing view stays consistent across modules.
export function CostHistoryModal({ itemId, itemName, onClose }: CostHistoryModalProps) {
  const { data, isLoading, isError, error } = useItemCostHistoryQuery(itemId);
  const unit = data?.unit ? ` ${data.unit}` : '';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-xl">
              <History className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Cost History</h2>
              <p className="text-sm text-slate-500">{itemName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
            aria-label="Close cost history"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Summary — Weighted Average Cost is the default inventory cost display */}
          {data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                <p className="text-xs text-emerald-700 font-medium">Weighted Avg. Cost</p>
                <p className="text-lg font-bold text-emerald-800">{formatPeso(data.weightedAverageCost)}</p>
                <p className="text-[11px] text-emerald-600 mt-0.5">Default cost display</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-xs text-slate-500 font-medium">Current Stock</p>
                <p className="text-lg font-bold text-slate-800">{data.currentStock}{unit}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-xs text-slate-500 font-medium">Total Received</p>
                <p className="text-lg font-bold text-slate-800">{data.totalQuantityReceived}{unit}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-xs text-slate-500 font-medium">Total Cost</p>
                <p className="text-lg font-bold text-slate-800">{formatPeso(data.totalCost)}</p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="py-12 text-center text-slate-500 text-sm">Loading cost history…</div>
          )}

          {isError && (
            <div className="py-12 text-center text-red-600 text-sm">
              {error instanceof Error ? error.message : 'Failed to load cost history.'}
            </div>
          )}

          {data && !isLoading && data.entries.length === 0 && (
            <div className="py-12 flex flex-col items-center gap-3 text-center">
              <PackageCheck className="w-10 h-10 text-slate-300" />
              <p className="text-slate-500 text-sm">
                No receiving history yet. Cost history is recorded when stock is received
                against a purchase order.
              </p>
            </div>
          )}

          {data && data.entries.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Date Received</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium text-right">Qty Received</th>
                    <th className="px-4 py-3 font-medium text-right">Unit Cost</th>
                    <th className="px-4 py-3 font-medium text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {formatDateTime(entry.dateReceived)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <p className="font-medium text-slate-700">{entry.supplierName ?? 'Unknown supplier'}</p>
                        <p className="text-xs text-slate-400">
                          {entry.orderNumber ?? entry.receiptNumber ?? '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium whitespace-nowrap">
                        {entry.quantityReceived}{unit}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                        {formatPeso(entry.unitCost)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-800 font-semibold whitespace-nowrap">
                        {formatPeso(entry.totalCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
