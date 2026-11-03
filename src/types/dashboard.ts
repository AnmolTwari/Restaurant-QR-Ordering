import { TableStatus } from './index';

export type DashboardTab =
  | 'overview'
  | 'categories'
  | 'items'
  | 'tables'
  | 'orders'
  | 'payments';

export interface RestaurantSummary {
  id: string;
  name: string;
  slug: string;
  currency: string;
  role: string;
  address?: string;
  phone?: string;
}

export interface Category {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number; // in minor currency units (e.g., paise, cents)
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  category: {
    id: string;
    name: string;
  };
}

export interface RestaurantTableData {
  id: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  operationalState?: 'AVAILABLE' | 'OCCUPIED' | 'NEEDS_ATTENTION';
  attentionReason?: string | null;
  isFullyServed?: boolean;
  hasActiveSession?: boolean;
  activeSessionId?: string | null;
  activeOrdersCount?: number;
  hasActiveQr: boolean;
  qrTokenInfo: { id: string; createdAt: string } | null;
  activeSessionsCount: number;
  totalOrdersCount: number;
  createdAt: string;
}

export interface NotificationState {
  type: 'success' | 'error';
  message: string;
}
