import { Sidebar } from '../../shared/components/Sidebar';
import { Page, type StoreBrand } from '../../shared/App';
import type { StaffType, StoreType } from '../../auth/types/auth';
import { Printer } from 'lucide-react';
import { ThermalReceipt } from '../../shared/components/ThermalReceipt';

interface ReceiptProps {
  onNavigate: (page: Page) => void;
  currentOrder: any;
  onLogout: () => void;
  storeBrand?: StoreBrand;
  userName?: string | null;
  storeType?: StoreType;
  staffType?: StaffType;
}

export function Receipt({ onNavigate, currentOrder, onLogout, storeBrand, userName, storeType, staffType }: ReceiptProps) {
  return (
    <div className="flex h-screen">
      <Sidebar currentPage="create-order" onNavigate={onNavigate} onLogout={onLogout} storeBrand={storeBrand} userName={userName} storeType={storeType} staffType={staffType} />

      <div className="flex-1 overflow-auto bg-background">
        <div className="p-8">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 mb-6 overflow-hidden">
              <ThermalReceipt
                orderNumber={currentOrder?.id || currentOrder?.orderNumber || 'N/A'}
                customerName={currentOrder?.customerName || currentOrder?.customer || 'N/A'}
                orderType={(currentOrder?.orderType || currentOrder?.type || 'Dine-In') as 'Dine-In' | 'Takeout' | 'Mixed'}
                table={currentOrder?.table}
                items={(currentOrder?.items || []).map((item: any) => ({
                  name: item.name,
                  quantity: item.quantity,
                  price: item.price,
                  itemType: item.itemType || item.orderType,
                }))}
                subtotal={currentOrder?.subtotal || 0}
                serviceFee={currentOrder?.serviceFee || 0}
                tax={currentOrder?.tax || 0}
                discount={currentOrder?.discount || 0}
                discountType={currentOrder?.discountType}
                total={currentOrder?.total || currentOrder?.amountNumber || 0}
                cashReceived={currentOrder?.cashReceived}
                changeGiven={currentOrder?.changeGiven}
                date={currentOrder?.date}
                time={currentOrder?.time}
                receiptId={currentOrder?.receiptId}
                paymentId={currentOrder?.paymentId}
                cashier={currentOrder?.cashier ?? userName ?? 'Staff'}
                storeBrand={storeBrand}
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => onNavigate('pos-dashboard')}
                className="flex-1 px-6 py-3 border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Back to Dashboard
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="w-5 h-5" />
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
