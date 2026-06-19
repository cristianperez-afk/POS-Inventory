import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useOrders } from './OrderContext';

export interface Table {
  id: number;
  number: number;
  status: 'available' | 'occupied' | 'reserved' | 'maintenance';
  orderId?: string;
  seats: number;
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
  setTableStatus: (tableNumber: number, status: 'available' | 'maintenance' | 'reserved') => void;
  getAvailableTablesCount: () => number;
  notifications: TableNotification[];
  dismissNotification: (id: string) => void;
  addTable: (tableNumber: number, seats: number) => boolean;
  deleteTable: (tableId: number) => boolean;
  updateTable: (tableId: number, tableNumber: number, seats: number) => boolean;
  queueHistory: QueueHistoryEntry[];
  tableHistory: TableHistoryEntry[];
  assignmentNotification: AssignmentNotification | null;
  dismissAssignmentNotification: () => void;
  assignToTable: (orderId: string, tableNumbers: number[]) => Promise<void>;
  skipQueueCustomer: (orderId: string) => void;
  getTableHistory: (tableNumber: number) => TableHistoryEntry[];
}

const TableContext = createContext<TableContextType | null>(null);
const TABLES_STORAGE_KEY = 'bukolabs-pos-restaurant-tables-v1';
const defaultSeatCounts = [2, 4, 4, 6, 2, 4, 4, 4, 2, 6, 4, 4, 2, 4, 6, 4, 2, 4, 4, 6];

function createDefaultTables(): Table[] {
  return Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    number: i + 1,
    status: 'available' as const,
    seats: defaultSeatCounts[i],
  }));
}

function loadStoredTables(): Table[] {
  if (typeof window === 'undefined') {
    return createDefaultTables();
  }

  try {
    const raw = window.localStorage.getItem(TABLES_STORAGE_KEY);
    if (!raw) return createDefaultTables();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return createDefaultTables();

    const tables = parsed
      .map((table: Partial<Table>, index: number): Table | null => {
        const number = Number(table.number);
        const seats = Number(table.seats);
        const id = Number(table.id);
        const status = table.status === 'maintenance' || table.status === 'reserved' || table.status === 'occupied' ? table.status : 'available';
        if (!Number.isFinite(number) || number < 1 || !Number.isFinite(seats) || seats < 1) return null;
        return {
          id: Number.isFinite(id) && id > 0 ? id : index + 1,
          number,
          seats,
          status,
          orderId: undefined,
        };
      })
      .filter((table): table is Table => Boolean(table));

    return tables.length > 0 ? tables : createDefaultTables();
  } catch {
    return createDefaultTables();
  }
}

function saveStoredTables(tables: Table[]) {
  if (typeof window === 'undefined') return;

  const manualTables = tables.map(({ id, number, status, seats }) => ({
    id,
    number,
    status: status === 'occupied' ? 'available' : status,
    seats,
  }));
  window.localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(manualTables));
}

export function TableProvider({ children }: { children: ReactNode }) {
  const { orders, queuedOrders, updateOrder, assignQueuedOrderToTable } = useOrders();
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

  const [tables, setTables] = useState<Table[]>(loadStoredTables);

  useEffect(() => {
    saveStoredTables(tables);
  }, [tables]);

  const orderUsesTable = (orderTable: string, tableNumber: number) => {
    const matches = orderTable.match(/Table\s+\d+/gi) ?? [];
    return matches.some((label) => Number(label.match(/\d+/)?.[0]) === tableNumber);
  };

  // Sync tables with orders
  useEffect(() => {
    setTables(prevTables => {
      const newTables = prevTables.map(table => {
        // Find active order for this table
        const order = orders.find(o =>
          orderUsesTable(o.table, table.number) &&
          o.orderStatus !== 'Completed'
        );

        // Preserve manually set maintenance and reserved status
        if ((table.status === 'maintenance' || table.status === 'reserved') && !order) {
          return table;
        }

        if (order) {
          return {
            ...table,
            status: 'occupied' as const,
            orderId: order.id,
            seats: table.seats, // Preserve seats count
          };
        } else {
          // If was occupied, make available; otherwise keep current status
          return table.status === 'occupied'
            ? { ...table, status: 'available' as const, orderId: undefined, seats: table.seats }
            : table;
        }
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
      return prev?.status === 'occupied' && t.status === 'available';
    });

    prevTablesRef.current = tables;

    if (newlyAvailable.length === 0) return;
    const currentQueued = queuedOrdersRef.current;
    if (currentQueued.length === 0) return;
    if (assignmentNotificationRef.current) return; // already showing one

    const firstInQueue = currentQueued[0];

    // Find the smallest fitting table among newly freed tables for the first queued customer
    const fittingTable = newlyAvailable
      .filter(t => t.seats >= (firstInQueue.partySize || 0))
      .sort((a, b) => a.seats - b.seats)[0];

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
        const compatible = currentQueued.find(o => (o.partySize || 0) <= table.seats);
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

  const setTableStatus = (tableNumber: number, status: 'available' | 'maintenance' | 'reserved') => {
    setTables(prevTables =>
      prevTables.map(t =>
        t.number === tableNumber ? { ...t, status } : t
      )
    );
  };

  const getAvailableTablesCount = () => {
    return tables.filter(t => t.status === 'available').length;
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const addTable = (tableNumber: number, seats: number): boolean => {
    // Check if table number already exists
    const numberExists = tables.some(t => t.number === tableNumber);
    if (numberExists) {
      return false;
    }

    // Find max ID to generate new ID
    const maxId = Math.max(...tables.map(t => t.id), 0);

    const newTable: Table = {
      id: maxId + 1,
      number: tableNumber,
      status: 'available',
      seats: seats,
    };

    setTables(prev => [...prev, newTable]);
    return true;
  };

  const deleteTable = (tableId: number): boolean => {
    // Check if table has active order
    const table = tables.find(t => t.id === tableId);
    if (table?.orderId) {
      return false; // Cannot delete table with active order
    }

    setTables(prev => prev.filter(t => t.id !== tableId));
    return true;
  };

  const updateTable = (tableId: number, tableNumber: number, seats: number): boolean => {
    // Check if new table number already exists (excluding current table)
    const numberExists = tables.some(t => t.id !== tableId && t.number === tableNumber);
    if (numberExists) {
      return false;
    }

    setTables(prevTables =>
      prevTables.map(t =>
        t.id === tableId
          ? { ...t, number: tableNumber, seats: seats }
          : t
      )
    );
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
    const availableTable = tables.find(t => t.status === 'available');
    if (availableTable) {
      const nextCompatible = queuedOrders
        .filter(o => o.id !== orderId)
        .find(o => (o.partySize || 0) <= availableTable.seats);

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
