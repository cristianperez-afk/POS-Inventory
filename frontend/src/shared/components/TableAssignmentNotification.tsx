import { X, Users, Clock } from 'lucide-react';
import { AssignmentNotification } from '../context/TableContext';

interface TableAssignmentNotificationProps {
  notification: AssignmentNotification;
  onAssign: () => void;
  onCheckNext: () => void;
  onCancel: () => void;
}

export function TableAssignmentNotification({
  notification,
  onAssign,
  onCheckNext,
  onCancel,
}: TableAssignmentNotificationProps) {
  const { availableTable, queuedCustomer } = notification;
  const canFit = queuedCustomer.partySize <= availableTable.seats;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl animate-in">
        <div className="flex justify-between items-center p-5 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Table Available</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Available Table Info */}
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-green-900">Table {availableTable.number} is now available</h3>
              <div className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                {availableTable.seats} seats
              </div>
            </div>
          </div>

          {/* Queued Customer Info */}
          <div className={`border-2 rounded-lg p-4 ${
            canFit ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'
          }`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-primary text-white px-2 py-0.5 rounded text-xs font-medium">
                    Queue #{queuedCustomer.queuePosition}
                  </span>
                  <h3 className="font-semibold text-gray-900">{queuedCustomer.name}</h3>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 mt-2">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{queuedCustomer.partySize} {queuedCustomer.partySize === 1 ? 'person' : 'people'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>Waiting...</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Capacity Check */}
            {canFit ? (
              <div className="bg-green-100 border border-green-300 rounded-lg p-3 mt-3">
                <p className="text-sm text-green-800 font-medium">
                  ✓ Perfect match! This customer can occupy Table {availableTable.number}.
                </p>
              </div>
            ) : (
              <div className="bg-orange-100 border border-orange-300 rounded-lg p-3 mt-3">
                <p className="text-sm text-orange-800 font-medium">
                  ⚠ Queue #{queuedCustomer.queuePosition} needs {queuedCustomer.partySize} seats, but Table {availableTable.number} only has {availableTable.seats} seats available.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-5 border-t border-border bg-gray-50 space-y-2">
          {canFit ? (
            <>
              <button
                onClick={onAssign}
                className="w-full bg-primary text-white py-3 rounded-lg hover:bg-primary/90 transition-colors font-semibold flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Assign to Table {availableTable.number}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onCheckNext}
                  className="py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
                >
                  Check Next
                </button>
                <button
                  onClick={onCancel}
                  className="py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={onCheckNext}
                className="w-full bg-primary text-white py-3 rounded-lg hover:bg-primary/90 transition-colors font-semibold"
              >
                Check Next Customer
              </button>
              <button
                onClick={onCancel}
                className="w-full py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
