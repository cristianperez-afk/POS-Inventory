import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useOrders } from './OrderContext';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';

export interface Table {
  id: string;
  number: string;
  status: 'available' | 'occupied' | 'partially_occupied';
  orderId?: string;
  seats: number;
  occupiedSeats: number;
  availableSeats: number;
  isShared: boolean;
}

export interface TableNotification {
  id: string;
  message: string;
}

export interface QueueHistoryEntry {
  id: string;
  queueNumber: number;
  customerName: string;
  partySize: number;
  requiredSeats: number;
  queueTime: Date;
  assignedTables?: number[];
  timeAssigned?: Date;
  status: 'Waiting' | 'Assigned' | 'Cancelled' | 'Skipped';
  staffAction: string;
  orderId: string;
}

export interface TableHistoryEntry {
  id: string;
  tableNumber: number;
  customerName: string;
  orderId: string;
  partySize: number;
  timeOccupied: Date;
  timeReleased?: Date;
  paymentStatus: 'Paid' | 'Not Paid' | 'Void';
  totalAmount: number;
}

export interface AssignmentNotification {
  availableTable: Table;
  queuedCustomer: {
    id: string;
    name: string;
    partySize: number;
    queuePosition: number;
    orderId: string;
  };
}

interface TableContextType {
  tables: Table[];
  setTableStatus: (tableNumber: string, status: 'available') => Promise<void>;
  getAvailableTablesCount: () => number;
  notifications: TableNotification[];
  dismissNotification: (id: string) => void;
  addTable: (tableNumber: string, seats: number, isShared: boolean) => Promise<boolean>;
  deleteTable: (tableId: string) => Promise<boolean>;
  updateTable: (tableId: string, tableNumber: string, seats: number, isShared: boolean) => Promise<boolean>;
  setTableOccupancy: (tableId: string, occupiedSeats: number) => Promise<boolean>;
  queueHistory: QueueHistoryEntry[];
  tableHistory: TableHistoryEntry[];
  assignmentNotification: AssignmentNotification | null;
  dismissAssignmentNotification: () => void;
  assignToTable: (orderId: string, tableNumbers: number[]) => Promise<void>;
  skipQueueCustomer: (orderId: string) => void;
  getTableHistory: (tableNumber: number) => TableHistoryEntry[];
}

const TableContext = createContext<TableContextType | null>(null);

function mapApiTable(row: any): Table {
  const seats = Number(row.total_seats ?? row.capacity ?? 0);
  const occupiedSeats = Number(row.occupied_seats ?? 0);
  return {
    id: String(row.id),
    number: String(row.table_number ?? row.table_name ?? row.tableNumber),
    status: String(row.status ?? 'AVAILABLE').toLowerCase() as Table['status'],
    seats,
    occupiedSeats,
    availableSeats: Number(row.available_seats ?? Math.max(0, seats - occupiedSeats)),
    isShared: Boolean(row.is_shared),
  };
}

export function TableProvider({ children, currentUser }: { children: ReactNode; currentUser: AuthenticatedUser | null }) {
  const { orders, queuedOrders, updateOrder, assignQueuedOrderToTable, paymentCompletedSignal } = useOrders();
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string }>>([]);
  const [queueHistory, setQueueHistory] = useState<QueueHistoryEntry[]>([]);
  const [tableHistory, setTableHistory] = useState<TableHistoryEntry[]>([]);
  const [assignmentNotification, setAssignmentNotification] = useState<AssignmentNotification | null>(null);

  // Refs to avoid stale closures in transition detector
  const prevTablesRef = useRef<Table[]>([]);
  const queuedOrdersRef = useRef(queuedOrders);
  const assignmentNotificationRef = useRef(assignmentNotification);
  const knownQueuedOrderIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { queuedOrdersRef.current = queuedOrders; }, [queuedOrders]);
  useEffect(() => { assignmentNotificationRef.current = assignmentNotification; }, [assignmentNotification]);

  const [tables, setTables] = useState<Table[]>([]);

  const loadTables = async () => {
    if (!currentUser?.id || currentUser.store_type !== 'RESTAURANT') {
      setTables([]);
      return;
    }
    const response = await fetch(`${getApiBaseUrl()}/admin/pos/tables?user_id=${currentUser.id}`);
    const data = await response.json();
    setTables(Array.isArray(data) ? data.map(mapApiTable) : []);
  };

  useEffect(() => {
    void loadTables();
  }, [currentUser?.id, currentUser?.store_type, paymentCompletedSignal, orders.length]);

  const orderUsesTable = (orderTable: string, tableNumber: string) => {
    const matches = orderTable.match(/Table\s+\d+/gi) ?? [];
    return matches.some((label) => String(label.match(/\d+/)?.[0]) === String(tableNumber));
  };

  // Sync tables with orders
  useEffect(() => {
    setTables(prevTables => {
      const newTables = prevTables.map(table => {
        const order = orders.find(o =>
          orderUsesTable(o.table, table.number) &&
          o.orderStatus !== 'Completed'
        );

        if (order) {
          return {
            ...table,
            orderId: order.id,
          };
        }
        return { ...table, orderId: undefined };
      });

      // Record occupancy and release times as table status changes.
      newTables.forEach((newTable, idx) => {
        const oldTable = prevTables[idx];
        if (oldTable.status !== 'occupied' && newTable.status === 'occupied' && newTable.orderId) {
          const order = orders.find(o => o.id === newTable.orderId);
          if (order) {
            setTableHistory(prevHistory => {
              const alreadyOpen = prevHistory.some(entry =>
                entry.orderId === order.id &&
                entry.tableNumber === newTable.number &&
                !entry.timeReleased
              );
              if (alreadyOpen) return prevHistory;

              return [{
                id: `table-history-${order.id}-${newTable.number}-${Date.now()}`,
                tableNumber: newTable.number,
                customerName: order.customer,
                orderId: order.orderNumber || order.id,
                partySize: order.partySize || 0,
                timeOccupied: new Date(`${order.date} ${order.time}`),
                paymentStatus: order.paymentStatus,
                totalAmount: order.amountNumber,
              }, ...prevHistory];
            });
          }
        }

        if (oldTable.status === 'occupied' && newTable.status === 'available' && oldTable.orderId) {
          // Update table history entries for this table's last order
          setTableHistory(prevHistory =>
            prevHistory.map(entry =>
              (entry.orderId === oldTable.orderId || orders.some(order => order.id === oldTable.orderId && order.orderNumber === entry.orderId)) && entry.tableNumber === newTable.number && !entry.timeReleased
                ? { ...entry, timeReleased: new Date(), paymentStatus: 'Paid' }
                : entry
            )
          );
        }
      });

      return newTables;
    });
  }, [orders, queuedOrders, updateOrder]);

  // Record customers as soon as they enter the queue, not only after assignment.
  useEffect(() => {
    const newQueuedOrders = queuedOrders.filter(order => !knownQueuedOrderIdsRef.current.has(order.id));
    if (newQueuedOrders.length === 0) return;

    newQueuedOrders.forEach(order => knownQueuedOrderIdsRef.current.add(order.id));
    const newEntries: QueueHistoryEntry[] = newQueuedOrders.map(order => ({
      id: `queue-waiting-${order.id}-${Date.now()}`,
      queueNumber: order.queuePosition || 0,
      customerName: order.customerName,
      partySize: order.partySize || 0,
      requiredSeats: order.requiredSeats || order.partySize || 0,
      queueTime: order.timestamp,
      status: 'Waiting',
      staffAction: 'Joined queue',
      orderId: order.id,
    }));

    setQueueHistory(prev => [...newEntries, ...prev]);
  }, [queuedOrders]);

  // Detect occupied → available transitions and trigger queue assignment notification
  useEffect(() => {
    const prevTables = prevTablesRef.current;

    // Skip on initial mount (no previous state to compare)
    if (prevTables.length === 0) {
      prevTablesRef.current = tables;
      return;
    }

    const newlyAvailable = tables.filter(t => {
      const prev = prevTables.find(p => p.id === t.id);
      if (!prev) return false;
      const wasUnavailable = prev.status === 'occupied' && t.status !== 'occupied';
      const gainedSharedSeats = t.isShared && t.availableSeats > prev.availableSeats;
      const becameAvailable = t.status === 'available' && prev.status !== 'available';
      return wasUnavailable || gainedSharedSeats || becameAvailable;
    });

    prevTablesRef.current = tables;

    if (newlyAvailable.length === 0) return;
    const currentQueued = queuedOrdersRef.current;
    if (currentQueued.length === 0) return;
    if (assignmentNotificationRef.current) return; // already showing one

    const firstInQueue = currentQueued[0];
    const seatsForQueue = (table: Table) => table.isShared ? table.availableSeats : table.seats;
    const canSeat = (table: Table, partySize: number) =>
      table.isShared
        ? table.availableSeats >= partySize
        : table.status === 'available' && table.seats >= partySize;

    // Find the smallest fitting table among newly freed tables for the first queued customer
    const fittingTable = newlyAvailable
      .filter(t => canSeat(t, firstInQueue.partySize || 0))
      .sort((a, b) => seatsForQueue(a) - seatsForQueue(b))[0];

    if (fittingTable) {
      setAssignmentNotification({
        availableTable: fittingTable,
        queuedCustomer: {
          id: firstInQueue.id,
          name: firstInQueue.customerName,
          partySize: firstInQueue.partySize || 0,
          queuePosition: firstInQueue.queuePosition || 0,
          orderId: firstInQueue.id,
        },
      });
    } else {
      // First in queue doesn't fit any freed table — find any compatible pair
      for (const table of newlyAvailable) {
        const compatible = currentQueued.find(o => canSeat(table, o.partySize || 0));
        if (compatible) {
          setAssignmentNotification({
            availableTable: table,
            queuedCustomer: {
              id: compatible.id,
              name: compatible.customerName,
              partySize: compatible.partySize || 0,
              queuePosition: compatible.queuePosition || 0,
              orderId: compatible.id,
            },
          });
          break;
        }
      }
    }
  }, [tables]);

  const setTableStatus = async (tableNumber: string, status: 'available') => {
    const table = tables.find(t => t.number === tableNumber);
    if (!table || !currentUser?.id || status !== 'available') return;
    await updateTable(table.id, table.number, table.seats, table.isShared);
  };

  const getAvailableTablesCount = () => {
    return tables.filter(t => t.status === 'available' || t.status === 'partially_occupied').length;
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const addTable = async (tableNumber: string, seats: number, isShared: boolean): Promise<boolean> => {
    if (!currentUser?.id || tables.some(t => t.number === tableNumber)) return false;
    const response = await fetch(`${getApiBaseUrl()}/admin/pos/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id, table_number: tableNumber, total_seats: seats, is_shared: isShared }),
    });
    if (!response.ok) return false;
    await loadTables();
    return true;
  };

  const deleteTable = async (tableId: string): Promise<boolean> => {
    if (!currentUser?.id) return false;
    const response = await fetch(`${getApiBaseUrl()}/admin/pos/tables/${tableId}?user_id=${currentUser.id}`, { method: 'DELETE' });
    if (!response.ok) return false;
    await loadTables();
    return true;
  };

  const updateTable = async (tableId: string, tableNumber: string, seats: number, isShared: boolean): Promise<boolean> => {
    const numberExists = tables.some(t => t.id !== tableId && t.number === tableNumber);
    if (!currentUser?.id || numberExists) return false;
    const response = await fetch(`${getApiBaseUrl()}/admin/pos/tables/${tableId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id, table_number: tableNumber, total_seats: seats, is_shared: isShared }),
    });
    if (!response.ok) return false;
    await loadTables();
    return true;
  };

  const setTableOccupancy = async (tableId: string, occupiedSeats: number): Promise<boolean> => {
    if (!currentUser?.id) return false;
    const response = await fetch(`${getApiBaseUrl()}/admin/pos/tables/${tableId}/occupancy`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id, occupied_seats: occupiedSeats }),
    });
    if (!response.ok) return false;
    await loadTables();
    return true;
  };

  const dismissAssignmentNotification = () => {
    setAssignmentNotification(null);
  };

  const assignToTable = async (orderId: string, tableNumbers: number[]) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const tableLabels = tableNumbers.map(n => `Table ${n}`).join(' + ');
    const nextOrderStatus: typeof order.orderStatus = order.paymentStatus === 'Paid' ? 'Served' : 'Preparing';

    try {
      await assignQueuedOrderToTable(orderId, tableLabels, nextOrderStatus);
      updateOrder(orderId, { tableNumbers });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to assign table.';
      const notificationId = `notify-${Date.now()}`;
      setNotifications(prev => [...prev, { id: notificationId, message }]);
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
      }, 5000);
      return;
    }

    // Add to queue history
    const queueEntry: QueueHistoryEntry = {
      id: `queue-${Date.now()}`,
      queueNumber: order.queuePosition || 0,
      customerName: order.customer,
      partySize: order.partySize || 0,
      requiredSeats: order.partySize || 0,
      queueTime: new Date(order.date),
      assignedTables: tableNumbers,
      timeAssigned: new Date(),
      status: 'Assigned',
      staffAction: `Assigned to ${tableLabels}`,
      orderId: orderId,
    };
    setQueueHistory(prev => [queueEntry, ...prev]);

    // Add to table history
    tableNumbers.forEach(tableNum => {
      const historyEntry: TableHistoryEntry = {
        id: `table-history-${Date.now()}-${tableNum}`,
        tableNumber: tableNum,
        customerName: order.customer,
        orderId: orderId,
        partySize: order.partySize || 0,
        timeOccupied: new Date(),
        paymentStatus: order.paymentStatus as 'Paid' | 'Not Paid',
        totalAmount: order.amountNumber,
      };
      setTableHistory(prev => [historyEntry, ...prev]);
    });

    // Show confirmation notification
    const notificationId = `notify-${Date.now()}`;
    setNotifications(prev => [...prev, {
      id: notificationId,
      message: `${order.customer} has been assigned to ${tableLabels}.`
    }]);

    // Auto-remove notification
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    }, 5000);

    // Dismiss assignment modal
    dismissAssignmentNotification();
  };

  const skipQueueCustomer = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Add to queue history as skipped
    const queueEntry: QueueHistoryEntry = {
      id: `queue-${Date.now()}`,
      queueNumber: order.queuePosition || 0,
      customerName: order.customer,
      partySize: order.partySize || 0,
      requiredSeats: order.partySize || 0,
      queueTime: new Date(order.date),
      timeAssigned: new Date(),
      status: 'Skipped',
      staffAction: 'Skipped - table capacity mismatch',
      orderId: orderId,
    };
    setQueueHistory(prev => [queueEntry, ...prev]);

    // Dismiss current notification and check next
    dismissAssignmentNotification();

    // Try to find next compatible customer
    const availableTable = tables.find(t => t.status === 'available' || t.status === 'partially_occupied');
    if (availableTable) {
      const availableSeats = availableTable.isShared ? availableTable.availableSeats : availableTable.seats;
      const nextCompatible = queuedOrders
        .filter(o => o.id !== orderId)
        .find(o => (o.partySize || 0) <= availableSeats);

      if (nextCompatible) {
        setAssignmentNotification({
          availableTable,
          queuedCustomer: {
            id: nextCompatible.id,
            name: nextCompatible.customerName,
            partySize: nextCompatible.partySize || 0,
            queuePosition: nextCompatible.queuePosition || 0,
            orderId: nextCompatible.id,
          },
        });
      }
    }
  };

  const getTableHistory = (tableNumber: number): TableHistoryEntry[] => {
    const savedOrderHistory: TableHistoryEntry[] = orders
      .filter(order => orderUsesTable(order.table, tableNumber))
      .map(order => ({
        id: `order-history-${order.id}-${tableNumber}`,
        tableNumber,
        customerName: order.customer,
        orderId: order.orderNumber || order.id,
        partySize: order.partySize || 0,
        timeOccupied: new Date(`${order.date} ${order.time}`),
        timeReleased: order.orderStatus === 'Completed' ? new Date(`${order.date} ${order.time}`) : undefined,
        paymentStatus: order.paymentStatus,
        totalAmount: order.amountNumber,
      }));

    const combined = [...tableHistory.filter(h => h.tableNumber === tableNumber), ...savedOrderHistory];
    const unique = new Map<string, TableHistoryEntry>();
    combined.forEach((entry) => {
      unique.set(`${entry.tableNumber}-${entry.orderId}`, entry);
    });

    return Array.from(unique.values()).sort((a, b) => b.timeOccupied.getTime() - a.timeOccupied.getTime());
  };

  return (
    <TableContext.Provider value={{
      tables,
      setTableStatus,
      getAvailableTablesCount,
      notifications,
      dismissNotification,
      addTable,
      deleteTable,
      updateTable,
      setTableOccupancy,
      queueHistory,
      tableHistory,
      assignmentNotification,
      dismissAssignmentNotification,
      assignToTable,
      skipQueueCustomer,
      getTableHistory,
    }}>
      {children}
    </TableContext.Provider>
  );
}

export function useTables() {
  const ctx = useContext(TableContext);
  if (!ctx) throw new Error('useTables must be used within TableProvider');
  return ctx;
}
