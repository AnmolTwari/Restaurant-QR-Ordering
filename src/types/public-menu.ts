export interface PublicMenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
}

export interface PublicCategory {
  id: string;
  name: string;
  description: string | null;
  items: PublicMenuItem[];
}

export interface PublicBillingConfig {
  gstEnabled: boolean;
  taxInclusive: boolean;
  gstRate: number; // in basis points (500 = 5.00%)
  serviceChargeEnabled: boolean;
  serviceChargeRate: number;
  serviceChargeType: 'PERCENTAGE' | 'FIXED';
  packagingChargeEnabled: boolean;
  packagingChargeAmount: number;
}

export interface PublicMenuData {
  restaurant: {
    name: string;
    slug: string;
    description: string | null;
    address: string | null;
    phone: string | null;
    currency: string;
    billingConfig?: PublicBillingConfig;
  };
  table: {
    id: string;
    tableNumber: string;
    capacity: number;
  };
  categories: PublicCategory[];
  session: {
    id: string;
    expiresAt: string;
    sessionToken?: string;
  };
}
