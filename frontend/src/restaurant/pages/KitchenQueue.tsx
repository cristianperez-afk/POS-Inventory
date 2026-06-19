import { useState } from 'react';
import { Sidebar } from '../../shared/components/Sidebar';
import { Page } from '../../shared/App';
import { Clock } from 'lucide-react';

interface KitchenQueueProps {
  onNavigate: (page: Page) => void;
}

export function KitchenQueue({ onNavigate }: KitchenQueueProps) {
  const [orders, setOrders] = useState([
    {
      id: 'ORD-001',
      customer: 'Juan Dela Cruz',
      type: 'Dine-In',
      table: 5,
      items: [
        { name: 'Chicken Adobo', quantity: 2, notes: 'Extra sauce' },
        { name: 'Spring Rolls', quantity: 1, notes: '' },
      ],
      status: 'Pending',
      time: '10:30 AM',
    },
    {
      id: 'ORD-002',
      customer: 'Maria Santos',
      type: 'Takeout',
      table: null,
      items: [
        { name: 'Pork Sinigang', quantity: 1, notes: 'Less vegetables' },
      ],
      status: 'Preparing',
      time: '10:45 AM',
    },
    {
      id: 'ORD-003',
      customer: 'Pedro Reyes',
      type: 'Dine-In',
      table: 3,
      items: [
        { name: 'Beef Caldereta', quantity: 2, notes: '' },
        { name: 'Halo-Halo', quantity: 2, notes: 'Extra ice cream' },
      ],
      status: 'Ready',
      time: '11:00 AM',
    },
  ]);

  const updateStatus = (orderId: string, newStatus: string) => {
    setOrders(orders.map(order =>
      order.id === orderId ? { ...order, status: newStatus } : order
    ));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-gray-100 text-gray-800';
      case 'Preparing': return 'bg-yellow-100 text-yellow-800';
      case 'Ready': return 'bg-green-100 text-green-800';
      case 'Served': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPage="kitchen-queue" onNavigate={onNavigate} onLogout={() => onNavigate('login')} />

      <div className="flex-1 overflow-auto bg-background">
        <div className="p-8">
          <h1 className="text-primary mb-2">Kitchen Queue</h1>
          <p className="text-muted-foreground mb-6">Manage and track kitchen orders</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.map(order => (
              <div key={order.id} className="bg-card rounded-lg shadow-sm border border-border p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-primary mb-1">{order.id}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {order.time}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                </div>

                <div className="mb-4">
                  <p className="mb-1"><strong>Customer:</strong> {order.customer}</p>
                  <p className="mb-1"><strong>Type:</strong> {order.type}</p>
                  {order.table && <p><strong>Table:</strong> {order.table}</p>}
                </div>

                <div className="border-t border-border pt-4 mb-4">
                  <p className="mb-2"><strong>Items:</strong></p>
                  <ul className="space-y-2">
                    {order.items.map((item, idx) => (
                      <li key={idx} className="text-sm">
                        <span>{item.quantity}x {item.name}</span>
                        {item.notes && (
                          <p className="text-muted-foreground ml-4">Note: {item.notes}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-2">
                  {order.status === 'Pending' && (
                    <button
                      onClick={() => updateStatus(order.id, 'Preparing')}
                      className="flex-1 bg-yellow-500 text-white py-2 rounded-lg hover:bg-yellow-600 transition-colors"
                    >
                      Start Preparing
                    </button>
                  )}
                  {order.status === 'Preparing' && (
                    <button
                      onClick={() => updateStatus(order.id, 'Ready')}
                      className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition-colors"
                    >
                      Mark Ready
                    </button>
                  )}
                  {order.status === 'Ready' && (
                    <button
                      onClick={() => updateStatus(order.id, 'Served')}
                      className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      Mark Served
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
