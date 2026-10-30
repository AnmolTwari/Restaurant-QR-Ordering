import { OrderStatus, OrderItemStatus, PaymentStatus, PaymentMethod } from './index';

export { OrderItemStatus };

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number; // in minor units
  imageUrl: string | null;
  categoryName: string;
  quantity: number;
  notes?: string;
}

export interface CreateOrderItemInput {
  menuItemId: string;
  quantity: number;
  notes?: string;
}

export interface CreateOrderInput {
  restaurantSlug: string;
  idempotencyKey: string;
  notes?: string;
  items: CreateOrderItemInput[];
}

export interface OrderItemSnapshot {
  id: string;
  menuItemId: string | null;
  nameSnapshot: string;
  priceSnapshot: number; // in minor units
  quantity: number;
  totalPrice: number; // in minor units
  notes: string | null;
  status: OrderItemStatus;
  cancelReason?: string | null;
  cancelNote?: string | null;
  cancelledAt?: string | null;
  cancelledByUserId?: string | null;
}

export interface OrderStatusHistoryItem {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedByUserId: string | null;
  changedByName?: string | null;
  note: string | null;
  createdAt: string;
}

export interface PublicOrderTracking {
  id: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  tax: number;
  total: number;
  refundAmount?: number;
  refundedAtCounterAmount?: number;
  refundStatus?: string | null;
  refundCompletedAt?: string | null;
  refundCompletedByUserId?: string | null;
  notes: string | null;
  createdAt: string;
  table: {
    id: string;
    tableNumber: string;
  };
  restaurant: {
    id: string;
    name: string;
    slug: string;
    currency: string;
  };
  items: Array<{
    id: string;
    nameSnapshot: string;
    priceSnapshot: number;
    quantity: number;
    totalPrice: number;
    notes: string | null;
    status: OrderItemStatus;
    cancelReason?: string | null;
    cancelNote?: string | null;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    note: string | null;
    createdAt: string;
  }>;
}

export interface StaffOrderDetails {
  id: string;
  restaurantId: string;
  tableId: string;
  sessionId: string | null;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  tax: number;
  total: number;
  refundAmount?: number;
  refundedAtCounterAmount?: number;
  refundStatus?: string | null;
  refundCompletedAt?: string | null;
  refundCompletedByUserId?: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  table: {
    id: string;
    tableNumber: string;
    capacity: number;
  };
  items: OrderItemSnapshot[];
  statusHistory: OrderStatusHistoryItem[];
}
