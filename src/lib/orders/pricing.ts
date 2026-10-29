import { prisma } from '@/lib/prisma';
import type { CreateOrderItemInput } from '@/types/orders';

export interface CalculatedOrderItem {
  menuItemId: string;
  nameSnapshot: string;
  priceSnapshot: number; // in minor units
  quantity: number;
  totalPrice: number; // in minor units
  notes: string | null;
}

export interface CalculatedOrderPricing {
  subtotal: number; // in minor units
  tax: number; // in minor units
  total: number; // in minor units
  items: CalculatedOrderItem[];
}

export class OrderPricingValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OrderPricingValidationError';
  }
}

/**
 * Validates requested order items against current database records for the specified restaurant,
 * enforces item availability and positive quantities, and calculates the exact server-side pricing.
 * Never trusts any client-provided price or total.
 */
export async function calculateOrderPricing(
  restaurantId: string,
  requestedItems: CreateOrderItemInput[],
): Promise<CalculatedOrderPricing> {
  if (!requestedItems || requestedItems.length === 0) {
    throw new OrderPricingValidationError(
      'EMPTY_ORDER',
      'The order must contain at least one menu item.',
    );
  }

  // Sanity check quantities
  for (const item of requestedItems) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 50) {
      throw new OrderPricingValidationError(
        'INVALID_QUANTITY',
        `Quantity for item ${item.menuItemId} must be an integer between 1 and 50.`,
      );
    }
  }

  const requestedIds = requestedItems.map((i) => i.menuItemId);

  // Fetch all matching menu items from DB belonging to this restaurant
  const dbItems = await prisma.menuItem.findMany({
    where: {
      id: { in: requestedIds },
      restaurantId,
    },
    include: {
      category: true,
    },
  });

  const dbItemsMap = new Map(dbItems.map((item) => [item.id, item]));

  // Verify that all requested items exist in this restaurant
  for (const reqItem of requestedItems) {
    const dbItem = dbItemsMap.get(reqItem.menuItemId);
    if (!dbItem) {
      throw new OrderPricingValidationError(
        'ITEM_NOT_FOUND_OR_CROSS_RESTAURANT',
        `Menu item "${reqItem.menuItemId}" was not found or does not belong to this restaurant.`,
      );
    }

    if (!dbItem.isAvailable) {
      throw new OrderPricingValidationError(
        'ITEM_UNAVAILABLE',
        `"${dbItem.name}" is currently sold out or unavailable.`,
      );
    }

    if (!dbItem.category.isActive) {
      throw new OrderPricingValidationError(
        'CATEGORY_INACTIVE',
        `Category for "${dbItem.name}" is inactive.`,
      );
    }
  }

  let subtotal = 0;
  const items: CalculatedOrderItem[] = [];

  for (const reqItem of requestedItems) {
    const dbItem = dbItemsMap.get(reqItem.menuItemId)!;
    const itemTotal = dbItem.price * reqItem.quantity;

    if (itemTotal < 0 || !Number.isSafeInteger(itemTotal)) {
      throw new OrderPricingValidationError(
        'INVALID_PRICE_CALCULATION',
        'Calculated price overflow or invalid amount.',
      );
    }

    subtotal += itemTotal;

    items.push({
      menuItemId: dbItem.id,
      nameSnapshot: dbItem.name,
      priceSnapshot: dbItem.price,
      quantity: reqItem.quantity,
      totalPrice: itemTotal,
      notes: reqItem.notes?.trim() || null,
    });
  }

  // Tax calculation (can be extended with restaurant tax rate, defaults to 0 if not configured)
  const tax = 0;
  const total = subtotal + tax;

  return {
    subtotal,
    tax,
    total,
    items,
  };
}
