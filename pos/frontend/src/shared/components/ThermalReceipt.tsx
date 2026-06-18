import { forwardRef } from 'react';
import type { StoreBrand } from '../App';
import { getLocalDateKey } from '../utils/date';
import { getStoreLogoForWhiteBackground } from '../utils/defaultStoreLogo';
import { calculateVatBreakdown, VAT_RATE } from '../utils/vat';

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  itemType?: 'dine-in' | 'takeout';
}

interface ThermalReceiptProps {
  orderNumber: string;
  customerName: string;
  orderType: 'Dine-In' | 'Takeout' | 'Mixed';
  table?: string | null;
  items: ReceiptItem[];
  subtotal: number;
  serviceFee: number;
  tax: number;
  discount: number;
  discountType?: string;
  total: number;
  cashReceived?: number;
  changeGiven?: number;
  date?: string;
  time?: string;
  receiptId?: string;
  paymentId?: string;
  cashier?: string;
  storeBrand?: StoreBrand;
}

export const ThermalReceipt = forwardRef<HTMLDivElement, ThermalReceiptProps>(
  (
    {
      orderNumber,
      customerName,
      orderType,
      table,
      items,
      subtotal,
      serviceFee,
      discount,
      discountType,
      total,
      cashReceived,
      changeGiven,
      date,
      time,
      receiptId,
      paymentId,
      cashier,
      storeBrand,
    },
    ref
  ) => {
    const currentDate = date || getLocalDateKey();
    const currentTime = time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const vatBreakdown = calculateVatBreakdown(total);
    const receiptLogo = getStoreLogoForWhiteBackground(storeBrand?.logo, 'RESTAURANT');

    // Separate items by type for mixed orders
    const dineInItems = items.filter(i => i.itemType === 'dine-in');
    const takeoutItems = items.filter(i => i.itemType === 'takeout');
    const isMixed = dineInItems.length > 0 && takeoutItems.length > 0;

    return (
      <div
        ref={ref}
        className="bg-white p-5 overflow-y-auto flex-1 min-h-0"
        style={{ fontFamily: "'Courier New', monospace" }}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded border border-dashed border-gray-200 bg-gray-50">
            {receiptLogo && (
              <img src={receiptLogo} alt={storeBrand?.name ?? 'Restaurant logo'} className="h-full w-full object-contain p-2" />
            )}
          </div>
          <p className="text-sm" style={{ fontWeight: 700, letterSpacing: '0.1em' }}>{storeBrand?.name || 'N&Ns RESTAURANT'}</p>
          {storeBrand?.business_description && <p className="mt-1 text-xs text-gray-500">{storeBrand.business_description}</p>}
          <p className="text-xs text-gray-500">{storeBrand?.address || '123 Restaurant Ave., Manila, PH'}</p>
          {(storeBrand?.contact_number || storeBrand?.email) && (
            <p className="text-xs text-gray-500">{[storeBrand.contact_number, storeBrand.email].filter(Boolean).join(' | ')}</p>
          )}
          {storeBrand?.operating_hours && <p className="text-xs text-gray-500">{storeBrand.operating_hours}</p>}
          <div className="border-t border-dashed border-gray-300 my-3" />
          <p className="text-xs text-gray-600" style={{ fontWeight: 700 }}>OFFICIAL RECEIPT</p>
        </div>

        {/* Receipt Info */}
        <div className="text-xs space-y-1 mb-3">
          {receiptId && (
            <div className="flex justify-between">
              <span className="text-gray-500">Receipt ID:</span>
              <span>{receiptId}</span>
            </div>
          )}
          {paymentId && (
            <div className="flex justify-between">
              <span className="text-gray-500">Payment ID:</span>
              <span>{paymentId}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Order #:</span>
            <span>{orderNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Date:</span>
            <span>{currentDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Time:</span>
            <span>{currentTime}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Customer:</span>
            <span>{customerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Type:</span>
            <span>{orderType}</span>
          </div>
          {cashier && (
            <div className="flex justify-between">
              <span className="text-gray-500">Staff:</span>
              <span>{cashier}</span>
            </div>
          )}
          {table && table !== '-' && table !== '—' && (
            <div className="flex justify-between">
              <span className="text-gray-500">Table:</span>
              <span>{table}</span>
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-gray-300 my-3" />

        {/* Items */}
        {isMixed ? (
          <>
            {dineInItems.length > 0 && (
              <>
                <p className="text-xs text-center text-gray-600 mb-1.5" style={{ fontWeight: 700 }}>— DINE-IN —</p>
                {dineInItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs mb-1">
                    <span>{item.quantity}x {item.name}</span>
                    <span>₱{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>Subtotal (Dine-In)</span>
                  <span>₱{dineInItems.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}</span>
                </div>
              </>
            )}
            {takeoutItems.length > 0 && (
              <>
                <p className="text-xs text-center text-gray-600 mb-1.5" style={{ fontWeight: 700 }}>— TAKEOUT —</p>
                {takeoutItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs mb-1">
                    <span>{item.quantity}x {item.name}</span>
                    <span>₱{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>Subtotal (Takeout)</span>
                  <span>₱{takeoutItems.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}</span>
                </div>
              </>
            )}
          </>
        ) : (
          items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs mb-1">
              <span>{item.quantity}x {item.name}</span>
              <span>₱{(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))
        )}

        <div className="border-t border-dashed border-gray-300 my-3" />

        {/* Totals */}
        <div className="text-xs space-y-1">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>₱{subtotal.toFixed(2)}</span>
          </div>
          {serviceFee > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Service Fee</span>
              <span>₱{serviceFee.toFixed(2)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between text-red-500">
              <span>Discount{discountType ? ` (${discountType})` : ''}</span>
              <span>− ₱{discount.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="border-t border-double border-gray-400 my-3" />

        <div className="text-xs space-y-1">
          <div className="flex justify-between" style={{ fontWeight: 700 }}>
            <span>TOTAL</span>
            <span>₱{total.toFixed(2)}</span>
          </div>
          {cashReceived !== undefined && cashReceived > 0 && (
            <>
              <div className="flex justify-between text-gray-600">
                <span>Cash Received</span>
                <span>₱{cashReceived.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Change</span>
                <span>₱{(changeGiven || 0).toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="border-t border-dashed border-gray-300 mt-3 pt-2 space-y-1 text-gray-600">
            <div className="flex justify-between">
              <span>VATable Sales</span>
              <span>₱{vatBreakdown.vatableSales.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT ({VAT_RATE * 100}%)</span>
              <span>₱{vatBreakdown.vatAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount Due</span>
              <span>₱{vatBreakdown.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-300 mt-4 pt-3 text-center">
          <p className="text-xs text-gray-400">{storeBrand?.receipt_thank_you_message || 'Thank you for dining with us!'}</p>
          <p className="text-xs text-gray-400">{storeBrand?.receipt_footer_message || 'Please come again.'}</p>
          <p className="text-xs text-gray-300 mt-1">{storeBrand?.name || 'N&Ns POS System'}</p>
        </div>
      </div>
    );
  }
);

ThermalReceipt.displayName = 'ThermalReceipt';

