export type { Location, Supplier, User } from './domain';

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  targetCustomer: 'Male' | 'Female' | 'Unisex';
  subcategory: string;
  size: string;
  condition: 'Excellent' | 'Good' | 'Fair' | 'Damaged';
  quantity: number;
  price: number;
  dateAdded: string;
  location: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplier: string;
  date: string;
  status: 'Pending' | 'Approved' | 'Received' | 'Rejected' | 'Cancelled';
  items: { name: string; quantity: number; price: number }[];
  totalAmount: number;
  paymentMethod?: 'Cash' | 'Bank Transfer' | 'Check' | 'Credit Terms';
  paymentTerms?: string;
  createdBy?: string;
}

export interface Transfer {
  id: string;
  transferNumber: string;
  fromLocation: string;
  toLocation: string;
  date: string;
  status: 'Pending' | 'In Transit' | 'Completed' | 'Cancelled';
  items: { itemId: string; name: string; quantity: number }[];
  createdBy: string;
  notes?: string;
}

export interface Adjustment {
  id: string;
  adjustmentNumber: string;
  date: string;
  type: 'Add' | 'Remove' | 'Damage' | 'Lost' | 'Found' | 'Recount';
  reason: string;
  items: { itemId: string; name: string; quantityChange: number; location: string }[];
  createdBy: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}

export interface Sale {
  id: string;
  transactionNumber: string;
  date: string;
  time: string;
  cashier: string;
  location: string;
  items: {
    itemId: string;
    name: string;
    category: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: 'Cash' | 'GCash' | 'Card' | 'Bank Transfer';
  amountPaid: number;
  change: number;
  customer?: string;
  status: 'Completed' | 'Refunded' | 'Partial Refund';
  refundReason?: string;
}

export interface ProductReceived {
  id: string;
  receiptNumber: string;
  poNumber: string;
  poId?: string;
  supplier: string;
  dateReceived: string;
  receivedDate?: string;
  items: {
    name: string;
    orderedQty: number;
    receivedQty: number;
    acceptedQty: number;
    rejectedQty: number;
    category: string;
    subcategory?: string;
    size?: string;
    condition: 'Excellent' | 'Good' | 'Fair' | 'Damaged';
    inspectionNotes?: string;
    price: number;
  }[];
  receivedBy: string;
  status: 'Pending Inspection' | 'Partially Accepted' | 'Fully Accepted' | 'Completed';
  totalOrdered: number;
  totalAccepted: number;
  totalRejected: number;
}

export interface Bundle {
  id: string;
  name: string;
  items: { itemId: string; quantity: number }[];
  price: number;
  discount: number;
  dateCreated: string;
  createdBy: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Active' | 'Inactive';
  approvedBy?: string;
  approvedDate?: string;
  rejectionReason?: string;
}
