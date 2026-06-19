import { forwardRef } from 'react';
import type { StoreBrand } from '../../shared/App';
import { getLocalDateKey } from '../../shared/utils/date';
import { getStoreLogoForWhiteBackground } from '../../shared/utils/defaultStoreLogo';
import { calculateVatBreakdown, VAT_RATE } from '../../shared/utils/vat';

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  size?: string;
  color?: string;
  category?: string;
  refunded?: boolean;
  refundedQuantity?: number;
}

interface ThermalReceiptProps {
  orderNumber: string;
  customerName: string;
  items: ReceiptItem[];
  subtotal: number;
  serviceFee?: number;
  tax: number;
  discount: number;
  discountType?: string;
  total: number;
  cashReceived?: number;
  changeGiven?: number;
  paymentMethod?: string;
  date?: string;
  time?: string;
  receiptId?: string;
  paymentId?: string;
  cashier?: string;
  paymentStatus?: string;
  refundTransactionId?: string;
  refundDate?: string;
  refundReason?: string;
  voidDate?: string;
  voidReason?: string;
  voidBy?: string;
  storeBrand?: StoreBrand;
}

export const ThermalReceipt = forwardRef<HTMLDivElement, ThermalReceiptProps>(
  (
    {
      orderNumber,
      customerName,
      items,
      subtotal,
      serviceFee = 0,
      discount,
      discountType,
      total,
      cashReceived,
      changeGiven,
      paymentMethod,
      date,
      time,
      receiptId,
      paymentId,
      cashier,
      paymentStatus,
      refundTransactionId,
      refundDate,
      refundReason,
      voidDate,
      voidReason,
      voidBy,
      storeBrand,
    },
    ref
  ) => {
    const currentDate = date || getLocalDateKey();
    const currentTime = time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const vatBreakdown = calculateVatBreakdown(total);
    const receiptLogo = getStoreLogoForWhiteBackground(storeBrand?.logo, 'RETAIL_STORE');

    return (
      <div
        ref={ref}
        className="bg-white p-6 overflow-y-auto flex-1 min-h-0"
        style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", maxWidth: '400px', margin: '0 auto' }}
      >
        {/* Logo */}
        <div className="text-center mb-3">
          <div className="w-20 h-20 mx-auto mb-3 flex items-center justify-center rounded border border-dashed border-gray-200 bg-gray-50">
            {receiptLogo && (
              <img src={receiptLogo} alt={storeBrand?.name || 'Retail Store Logo'} className="w-full h-full object-contain p-2" />
            )}
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-4">
          <p className="text-base font-bold tracking-wide mb-0.5">{storeBrand?.name || 'UKAY-UKAY STORE'}</p>
          {storeBrand?.business_description && <p className="mt-1 text-xs text-gray-500">{storeBrand.business_description}</p>}
          <p className="text-xs text-gray-500">{storeBrand?.address || '123 Thrift Ave., Manila, PH'}</p>
          {(storeBrand?.contact_number || storeBrand?.email) && (
            <p className="text-xs text-gray-500">{[storeBrand.contact_number, storeBrand.email].filter(Boolean).join(' | ')}</p>
          )}
          {storeBrand?.operating_hours && <p className="text-xs text-gray-500">{storeBrand.operating_hours}</p>}
          <div className="border-t border-dashed border-gray-300 my-3" />
          <p className="text-xs text-gray-700 font-semibold">
            {paymentStatus === 'Void' ? 'VOID RECEIPT' :
             paymentStatus === 'Refunded' || paymentStatus === 'Partially Refunded' ? 'REFUND RECEIPT' :
             'OFFICIAL RECEIPT'}
          </p>
        </div>

        {/* Receipt Info */}
        <div className="text-xs space-y-1 mb-4">
          {receiptId && (
            <div className="flex justify-between">
              <span className="text-gray-500">Receipt ID:</span>
              <span className="font-medium text-right">{receiptId}</span>
            </div>
          )}
          {paymentId && (
            <div className="flex justify-between">
              <span className="text-gray-500">Payment ID:</span>
              <span className="font-medium text-right">{paymentId}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Order #:</span>
            <span className="font-medium text-right">{orderNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Date:</span>
            <span className="font-medium text-right">{currentDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Time:</span>
            <span className="font-medium text-right">{currentTime}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Customer:</span>
            <span className="font-medium text-right">{customerName}</span>
          </div>
          {cashier && (
            <div className="flex justify-between">
              <span className="text-gray-500">Staff:</span>
              <span className="font-medium text-right">{cashier}</span>
            </div>
          )}
        </div>

        {(paymentStatus === 'Refunded' || paymentStatus === 'Partially Refunded') && (
          <>
            <div className="border-t border-dashed border-gray-300 my-3" />
            <div className="bg-red-50 border border-red-200 rounded p-2 text-xs mb-3">
              <p className="font-semibold text-red-800 mb-1">REFUND INFORMATION</p>
              {refundTransactionId && (
                <div className="flex justify-between">
                  <span className="text-red-700">Refund ID:</span>
                  <span className="font-medium text-right">{refundTransactionId}</span>
                </div>
              )}
              {refundDate && (
                <div className="flex justify-between">
                  <span className="text-red-700">Refund Date:</span>
                  <span className="font-medium text-right">{refundDate}</span>
                </div>
              )}
              {refundReason && (
                <div className="mt-1">
                  <span className="text-red-700">Reason:</span>
                  <p className="text-red-800 mt-0.5">{refundReason}</p>
                </div>
              )}
            </div>
          </>
        )}

        {paymentStatus === 'Void' && (
          <>
            <div className="border-t border-dashed border-gray-300 my-3" />
            <div className="bg-purple-50 border border-purple-200 rounded p-2 text-xs mb-3">
              <p className="font-semibold text-purple-800 mb-1">VOID INFORMATION</p>
              {voidDate && (
                <div className="flex justify-between">
                  <span className="text-purple-700">Void Date:</span>
                  <span className="font-medium text-right">{voidDate}</span>
                </div>
              )}
              {voidBy && (
                <div className="flex justify-between">
                  <span className="text-purple-700">Voided By:</span>
                  <span className="font-medium text-right">{voidBy}</span>
                </div>
              )}
              {voidReason && (
                <div className="mt-1">
                  <span className="text-purple-700">Reason:</span>
                  <p className="text-purple-800 mt-0.5">{voidReason}</p>
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-purple-300">
                <p className="text-purple-900 font-semibold text-center">TRANSACTION CANCELLED</p>
              </div>
            </div>
          </>
        )}

        <div className="border-t border-dashed border-gray-300 my-3" />

        {/* Items */}
        <div className="text-xs mb-3">
          {items.map((item, i) => (
            <div key={i} className="mb-1.5">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <span className={`font-medium ${item.refunded ? 'line-through text-red-600' : ''}`}>
                    {item.quantity}x {item.name}
                    {item.refunded && <span className="text-red-600 ml-1">[REFUNDED]</span>}
                  </span>
                  {(item.size || item.color) && (
                    <div className={`text-xs mt-0.5 ${item.refunded ? 'text-red-400' : 'text-gray-400'}`}>
                      {item.size && `Size: ${item.size}`}
                      {item.size && item.color && ' • '}
                      {item.color && item.color}
                    </div>
                  )}
                </div>
                <span className={`font-medium ml-3 text-right ${item.refunded ? 'line-through text-red-600' : ''}`}>
                  ₱{(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-gray-300 my-3" />

        {/* Totals */}
        <div className="text-xs space-y-1">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span className="text-right">₱{subtotal.toFixed(2)}</span>
          </div>
          {serviceFee > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Service Fee</span>
              <span className="text-right">₱{serviceFee.toFixed(2)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Discount {discountType && `(${discountType})`}</span>
              <span className="text-right">− ₱{discount.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="border-t-2 border-gray-400 my-3" />

        <div className="text-sm space-y-1 mb-3">
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span className="text-right">₱{total.toFixed(2)}</span>
          </div>
          {cashReceived !== undefined && cashReceived > 0 && (
            <>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Cash Received</span>
                <span className="text-right">₱{cashReceived.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Change</span>
                <span className="text-right">₱{(changeGiven || 0).toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="border-t border-dashed border-gray-300 mt-3 pt-2 space-y-1 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>VATable Sales</span>
              <span className="text-right">₱{vatBreakdown.vatableSales.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT ({VAT_RATE * 100}%)</span>
              <span className="text-right">₱{vatBreakdown.vatAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount Due</span>
              <span className="text-right">₱{vatBreakdown.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-300 mt-4 pt-3 text-center">
          <p className="text-xs text-gray-500 mb-0.5">{storeBrand?.receipt_thank_you_message || 'Thank you for shopping with us!'}</p>
          <p className="text-xs text-gray-500">{storeBrand?.receipt_footer_message || 'Please come again.'}</p>
          <p className="text-xs text-gray-400 mt-2">{storeBrand?.name || 'Ukay-Ukay POS System'}</p>
        </div>
      </div>
    );
  }
);

ThermalReceipt.displayName = 'ThermalReceipt';

