import { useState } from 'react';
import { Sidebar } from '../../shared/components/Sidebar';
import { Page, type StoreBrand } from '../../shared/App';
import type { StaffType, StoreType } from '../../auth/types/auth';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Printer, TrendingUp, TrendingDown, ShoppingCart, Calendar } from 'lucide-react';
import { useOrders } from '../context/RetailOrderContext';
import { DateFilterControl, type DateFilterMode } from '../../shared/components/DateFilterControl';
import { getLocalDateKey, parseLocalDateKey } from '../../shared/utils/date';
import { calculateVatBreakdown } from '../../shared/utils/vat';

// Custom Peso Icon Component using ₱ symbol
const PesoIcon = ({ className }: { className?: string }) => (
  <span
    className={className}
    style={{
      fontWeight: 700,
      fontSize: '1.25em',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      lineHeight: 1
    }}
  >
    ₱
  </span>
);

interface RetailReportsProps {
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  isAdmin?: boolean;
  storeBrand?: StoreBrand;
  userName?: string | null;
  storeType?: StoreType;
  staffType?: StaffType;
}

export function RetailReports({ onNavigate, onLogout, isAdmin = false, storeBrand, userName, storeType = 'RETAIL_STORE', staffType }: RetailReportsProps) {
  const { orders } = useOrders();
  const todayString = getLocalDateKey();
  const [selectedDate, setSelectedDate] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterMode>('today');
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);

  const getFilterRange = () => {
    const today = parseLocalDateKey(todayString);
    const start = new Date(today);
    const end = new Date(today);

    if (dateFilter === 'all') {
      return { start: '', end: '' };
    }

    if (dateFilter === 'today') {
      return { start: todayString, end: todayString };
    }

    if (dateFilter === 'date') {
      return { start: selectedDate || todayString, end: selectedDate || todayString };
    }

    if (dateFilter === 'week') {
      start.setDate(today.getDate() - 6);
    } else if (dateFilter === 'month') {
      start.setDate(1);
    } else if (dateFilter === 'year') {
      start.setMonth(0, 1);
    }

    return {
      start: getLocalDateKey(start),
      end: getLocalDateKey(end),
    };
  };

  const getReportDateLabel = () => {
    if (dateFilter === 'today') return 'Today';
    if (dateFilter === 'date') return selectedDate || 'Select Date';
    if (dateFilter === 'week') return 'This Week';
    if (dateFilter === 'month') return 'This Month';
    if (dateFilter === 'all') return 'All Time';
    return 'This Year';
  };

  // Helper function to filter orders by date range
  const getFilteredOrders = () => {
    const { start, end } = getFilterRange();

    return orders.filter(o => {
      // Exclude void, refunded, and unpaid transactions from sales reports
      if (o.paymentStatus === 'Void' || o.paymentStatus === 'Refunded' || o.paymentStatus === 'Not Paid') return false;

      if (start && o.date < start) return false;
      if (end && o.date > end) return false;
      return true;
    });
  };

  // Calculate metrics from filtered orders
  const filteredOrders = getFilteredOrders();
  const filteredRevenue = filteredOrders.reduce((sum, order) => sum + order.amountNumber, 0);

  // Calculate payment method breakdown
  const cashOrders = filteredOrders.filter(o => o.paymentMethod === 'Cash');
  const cardOrders = filteredOrders.filter(o => o.paymentMethod === 'Card');
  const gcashOrders = filteredOrders.filter(o => o.paymentMethod === 'GCash');
  const paymayaOrders = filteredOrders.filter(o => o.paymentMethod === 'PayMaya');

  const cashRevenue = cashOrders.reduce((sum, order) => sum + order.amountNumber, 0);
  const cardRevenue = cardOrders.reduce((sum, order) => sum + order.amountNumber, 0);
  const gcashRevenue = gcashOrders.reduce((sum, order) => sum + order.amountNumber, 0);
  const paymayaRevenue = paymayaOrders.reduce((sum, order) => sum + order.amountNumber, 0);

  const generateDailySalesData = () => {
    const salesByDate: Record<string, { sales: number; orders: number }> = {};
    filteredOrders.forEach((order) => {
      salesByDate[order.date] = salesByDate[order.date] ?? { sales: 0, orders: 0 };
      salesByDate[order.date].sales += order.amountNumber;
      salesByDate[order.date].orders += 1;
    });

    return Object.entries(salesByDate)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, data]) => ({
        id: `daily-${date}`,
        day: date,
        sales: data.sales,
        orders: data.orders,
      }));
  };

  const dailySalesData = generateDailySalesData();

  const paymentMethodData = [
    { id: 'payment-cash', name: 'Cash', value: cashOrders.length, revenue: cashRevenue },
    { id: 'payment-card', name: 'Card', value: cardOrders.length, revenue: cardRevenue },
    { id: 'payment-gcash', name: 'GCash', value: gcashOrders.length, revenue: gcashRevenue },
    { id: 'payment-paymaya', name: 'PayMaya', value: paymayaOrders.length, revenue: paymayaRevenue },
  ].filter(p => p.value > 0);

  const COLORS = ['#008967', '#3b82f6', '#f59e0b', '#ef4444'];

  // Product sales breakdown from filtered orders
  const productSales: Record<string, number> = {};
  filteredOrders.forEach(order => {
    order.items.forEach(item => {
      if (productSales[item.name]) {
        productSales[item.name] += item.quantity;
      } else {
        productSales[item.name] = item.quantity;
      }
    });
  });

  const topProducts = Object.entries(productSales)
    .map(([name, sales], index) => ({
      id: `product-${index}`,
      name,
      sales
    }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 10);
  const visibleProducts = showAllProducts ? topProducts : topProducts.slice(0, 5);

  // Generate revenue trend data based on selected date range
  const generateRevenueTrendData = () => {
    const revenueByDate: Record<string, { orders: number; revenue: number }> = {};
    filteredOrders.forEach((order) => {
      revenueByDate[order.date] = revenueByDate[order.date] ?? { orders: 0, revenue: 0 };
      revenueByDate[order.date].orders += 1;
      revenueByDate[order.date].revenue += order.amountNumber;
    });

    return Object.entries(revenueByDate)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, data]) => ({
        id: `date-${date}`,
        week: date,
        revenue: data.revenue,
      }));
  };

  const revenueTrendData = generateRevenueTrendData();

  // Discount distribution from filtered orders
  const discountData = filteredOrders.filter(o => o.discount && o.discount > 0);
  const seniorDiscounts = discountData.filter(o => o.discountType?.includes('Senior')).length;
  const pwdDiscounts = discountData.filter(o => o.discountType?.includes('PWD')).length;
  const otherDiscounts = discountData.length - seniorDiscounts - pwdDiscounts;

  const discountDistribution = [
    { id: 'discount-senior', name: 'Senior Citizen', value: seniorDiscounts },
    { id: 'discount-pwd', name: 'PWD', value: pwdDiscounts },
    { id: 'discount-other', name: 'Other', value: otherDiscounts },
  ].filter(d => d.value > 0);

  const totalDiscountGiven = filteredOrders.reduce((sum, order) => sum + (order.discount || 0), 0);
  const totalVatCollected = filteredOrders.reduce((sum, order) => sum + calculateVatBreakdown(order.amountNumber).vatAmount, 0);
  const averageOrderValue = filteredOrders.length > 0 ? filteredRevenue / filteredOrders.length : 0;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPage="retail-reports" onNavigate={onNavigate} onLogout={onLogout} isAdmin={isAdmin} storeType={storeType} staffType={staffType} storeBrand={storeBrand} userName={userName} />

      <div className="flex-1 overflow-auto bg-background">
        <div className="p-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-primary mb-2">Sales & Analytics Reports</h1>
              <p className="text-muted-foreground text-sm">Detailed insights and revenue analytics</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <DateFilterControl
                mode={dateFilter}
                selectedDate={selectedDate}
                onModeChange={setDateFilter}
                onDateChange={setSelectedDate}
                className="rounded-lg border border-border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg hover:bg-secondary/90 transition-colors text-sm"
              >
                <Printer className="w-4 h-4" />
                Print Report
              </button>
            </div>
          </div>

          {/* Sales Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-card rounded-lg shadow-sm border border-border p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">
                  Sales for {getReportDateLabel()}
                </p>
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <PesoIcon className="w-5 h-5 text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-primary mb-1">₱{filteredRevenue.toFixed(2)}</h2>
              <div className="flex items-center text-xs text-green-600">
                <TrendingUp className="w-3 h-3 mr-1" />
                <span>{filteredOrders.length} orders</span>
              </div>
            </div>

            <div className="bg-card rounded-lg shadow-sm border border-border p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Avg Order Value</p>
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <PesoIcon className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-primary mb-1">₱{averageOrderValue.toFixed(2)}</h2>
              <div className="flex items-center text-xs text-blue-600">
                <ShoppingCart className="w-3 h-3 mr-1" />
                <span>Per transaction</span>
              </div>
            </div>

            <div className="bg-card rounded-lg shadow-sm border border-border p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">VAT Collected</p>
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <PesoIcon className="w-5 h-5 text-orange-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-primary mb-1">₱{totalVatCollected.toFixed(2)}</h2>
              <div className="flex items-center text-xs text-orange-600">
                <Calendar className="w-3 h-3 mr-1" />
                <span>12% VAT</span>
              </div>
            </div>

            <div className="bg-card rounded-lg shadow-sm border border-border p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Discounts Given</p>
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-purple-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-primary mb-1">₱{totalDiscountGiven.toFixed(2)}</h2>
              <div className="flex items-center text-xs text-purple-600">
                <TrendingDown className="w-3 h-3 mr-1" />
                <span>{discountData.length} discounts</span>
              </div>
            </div>
          </div>

          {/* Revenue Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 bg-card rounded-lg shadow-sm border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-primary">Revenue Trend</h3>
                <span className="text-sm text-muted-foreground">{getReportDateLabel()}</span>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip formatter={(value) => `₱${Number(value).toFixed(2)}`} />
                  <Legend />
                  <Line key="revenue-line" type="monotone" dataKey="revenue" stroke="#008967" strokeWidth={2} name="Revenue (₱)" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card rounded-lg shadow-sm border border-border p-6">
              <h3 className="text-lg font-medium text-primary mb-4">Sales Summary</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">Gross Sales</span>
                  <span className="font-medium">₱{(filteredRevenue + totalDiscountGiven).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">Discounts Given</span>
                  <span className="font-medium text-red-600">- ₱{totalDiscountGiven.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">VAT Collected (12%)</span>
                  <span className="font-medium">₱{totalVatCollected.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">Total Orders</span>
                  <span className="font-medium">{filteredOrders.length}</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="font-medium">Net Revenue</span>
                  <span className="font-bold text-lg text-primary">₱{filteredRevenue.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sales Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-card rounded-lg shadow-sm border border-border p-6">
              <h3 className="text-lg font-medium text-primary mb-4">Daily Sales Overview</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailySalesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis yAxisId="left" orientation="left" stroke="#008967" />
                  <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" />
                  <Tooltip formatter={(value, name) => {
                    if (name === 'Sales (₱)') {
                      return `₱${Number(value).toFixed(2)}`;
                    }
                    return value;
                  }} />
                  <Legend />
                  <Bar key="sales-bar" yAxisId="left" dataKey="sales" fill="#008967" name="Sales (₱)" />
                  <Bar key="orders-bar" yAxisId="right" dataKey="orders" fill="#3b82f6" name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card rounded-lg shadow-sm border border-border p-6">
              <h3 className="text-lg font-medium text-primary mb-4">Payment Method Breakdown</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    key="payment-method-pie"
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent, value }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={entry.id} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {paymentMethodData.map(method => (
                  <div key={method.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{method.name} Revenue:</span>
                    <span className="font-medium">₱{method.revenue.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Discount Analysis */}
          {discountDistribution.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-card rounded-lg shadow-sm border border-border p-6">
                <h3 className="text-lg font-medium text-primary mb-4">Discount Distribution</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      key="discount-pie"
                      data={discountDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {discountDistribution.map((entry) => (
                        <Cell key={entry.id} fill={COLORS[discountDistribution.indexOf(entry) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-card rounded-lg shadow-sm border border-border p-6">
                <h3 className="text-lg font-medium text-primary mb-4">Refund Reports</h3>
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">No refunds processed</p>
                  <p className="text-xs text-muted-foreground mt-1">All transactions completed successfully</p>
                </div>
              </div>
            </div>
          )}

          {/* Product Sales Breakdown */}
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-medium text-primary">Product Sales Breakdown</h3>
              <button
                onClick={() => setShowAllProducts((current) => !current)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition hover:bg-muted"
              >
                {showAllProducts ? 'See less' : 'See more'}
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#0f172a]">
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                      Rank
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                      Product Name
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                      Units Sold
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                      Performance
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-border">
                  {visibleProducts.map((product, index) => (
                    <tr key={product.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
                          index === 0 ? 'bg-yellow-100 text-yellow-800' :
                          index === 1 ? 'bg-gray-100 text-gray-800' :
                          index === 2 ? 'bg-orange-100 text-orange-800' :
                          'bg-muted text-foreground'
                        } font-medium`}>
                          #{index + 1}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium">{product.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {product.sales} units
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2 max-w-xs">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{ width: `${(product.sales / topProducts[0].sales) * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {((product.sales / topProducts[0].sales) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed Transaction Reports */}
          <div className="bg-card rounded-lg shadow-sm border border-border p-6 mt-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-medium text-primary">Detailed Transaction Reports</h3>
              <button
                onClick={() => setShowAllTransactions((current) => !current)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition hover:bg-muted"
              >
                {showAllTransactions ? 'See less' : 'See more'}
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#0f172a]">
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                      Order ID
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                      Customer
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                      Payment
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                      Date
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                      Amount
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-border">
                  {(showAllTransactions ? filteredOrders : filteredOrders.slice(0, 5)).map((order) => (
                    <tr key={order.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {order.transactionNumber || order.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {order.customer || 'Walk-in Customer'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                          order.paymentMethod === 'Cash' ? 'bg-green-100 text-green-800' :
                          order.paymentMethod === 'Card' ? 'bg-blue-100 text-blue-800' :
                          order.paymentMethod === 'GCash' ? 'bg-purple-100 text-purple-800' :
                          order.paymentMethod === 'PayMaya' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {order.paymentMethod || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {order.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        ₱{order.amountNumber.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="inline-flex px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                          {order.paymentStatus}
                        </span>
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
  );
}



