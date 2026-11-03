import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateStatusTransition,
  InvalidStatusTransitionError,
  UnauthorizedStatusTransitionError,
  ALLOWED_STATUS_TRANSITIONS,
} from '@/lib/orders/status-machine';
import { generateOrderNumber } from '@/lib/orders/order-number';
import {
  calculateOrderPricing,
  OrderPricingValidationError,
} from '@/lib/orders/pricing';
import { verifyActiveTableSession } from '@/lib/qr/session';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import * as sessionModule from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { OrderStatus, UserRole } from '@/types';

describe('Phase 4: Order Lifecycle & State Machine Transitions', () => {
  it('should enforce the documented progression PENDING -> ACCEPTED -> PREPARING -> READY -> SERVED', () => {
    // Valid forward transitions
    expect(() =>
      validateStatusTransition(OrderStatus.PENDING, OrderStatus.ACCEPTED, UserRole.MANAGER),
    ).not.toThrow();
    expect(() =>
      validateStatusTransition(OrderStatus.ACCEPTED, OrderStatus.PREPARING, UserRole.KITCHEN),
    ).not.toThrow();
    expect(() =>
      validateStatusTransition(OrderStatus.PREPARING, OrderStatus.READY, UserRole.KITCHEN),
    ).not.toThrow();
    expect(() =>
      validateStatusTransition(OrderStatus.READY, OrderStatus.SERVED, UserRole.WAITER),
    ).not.toThrow();
  });

  it('should reject illegal status leaps (e.g., PENDING directly to READY or SERVED)', () => {
    expect(() =>
      validateStatusTransition(OrderStatus.PENDING, OrderStatus.READY, UserRole.MANAGER),
    ).toThrow(InvalidStatusTransitionError);

    expect(() =>
      validateStatusTransition(OrderStatus.PENDING, OrderStatus.SERVED, UserRole.MANAGER),
    ).toThrow(InvalidStatusTransitionError);

    expect(() =>
      validateStatusTransition(OrderStatus.ACCEPTED, OrderStatus.SERVED, UserRole.MANAGER),
    ).toThrow(InvalidStatusTransitionError);
  });

  it('should treat SERVED and CANCELLED as terminal states with no transitions permitted', () => {
    expect(ALLOWED_STATUS_TRANSITIONS[OrderStatus.SERVED]).toHaveLength(0);
    expect(ALLOWED_STATUS_TRANSITIONS[OrderStatus.CANCELLED]).toHaveLength(0);

    expect(() =>
      validateStatusTransition(OrderStatus.SERVED, OrderStatus.CANCELLED, UserRole.OWNER),
    ).toThrow(InvalidStatusTransitionError);

    expect(() =>
      validateStatusTransition(OrderStatus.CANCELLED, OrderStatus.PENDING, UserRole.OWNER),
    ).toThrow(InvalidStatusTransitionError);
  });

  it('should enforce customer cancellation rules: allowed while PENDING, rejected once accepted or in prep', () => {
    // Customer can cancel while PENDING
    expect(() =>
      validateStatusTransition(OrderStatus.PENDING, OrderStatus.CANCELLED, 'CUSTOMER'),
    ).not.toThrow();

    // Customer CANNOT cancel once ACCEPTED or PREPARING
    expect(() =>
      validateStatusTransition(OrderStatus.ACCEPTED, OrderStatus.CANCELLED, 'CUSTOMER'),
    ).toThrow(UnauthorizedStatusTransitionError);

    expect(() =>
      validateStatusTransition(OrderStatus.PREPARING, OrderStatus.CANCELLED, 'CUSTOMER'),
    ).toThrow(UnauthorizedStatusTransitionError);
  });

  it('should enforce staff role authorization per status stage', () => {
    // Kitchen staff cannot cancel orders directly
    expect(() =>
      validateStatusTransition(OrderStatus.PREPARING, OrderStatus.CANCELLED, UserRole.KITCHEN),
    ).toThrow(UnauthorizedStatusTransitionError);

    // Waiter cannot mark order as READY (kitchen/manager responsibility)
    expect(() =>
      validateStatusTransition(OrderStatus.PREPARING, OrderStatus.READY, UserRole.WAITER),
    ).toThrow(UnauthorizedStatusTransitionError);

    // Manager can cancel order during preparation
    expect(() =>
      validateStatusTransition(OrderStatus.PREPARING, OrderStatus.CANCELLED, UserRole.MANAGER),
    ).not.toThrow();
  });
});

describe('Phase 4: Order Number Generation', () => {
  it('should generate human-readable customer-safe order references matching ORD-YYMMDD-XXXX', () => {
    const orderNum1 = generateOrderNumber();
    const orderNum2 = generateOrderNumber();

    expect(orderNum1).toMatch(/^ORD-\d{6}-[0-9A-F]{4}$/);
    expect(orderNum2).toMatch(/^ORD-\d{6}-[0-9A-F]{4}$/);
    expect(orderNum1).not.toBe(orderNum2);
  });
});

describe('Phase 4: Server-Side Pricing Integrity & Inventory Validation', () => {
  const restaurantId = 'rest-uuid-1';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should calculate order totals exclusively on the server using integer minor units', async () => {
    const mockDbItems = [
      {
        id: 'item-1',
        restaurantId,
        name: 'Truffle Risotto',
        price: 45000, // ₹450.00
        isAvailable: true,
        category: { id: 'cat-1', isActive: true },
      },
      {
        id: 'item-2',
        restaurantId,
        name: 'Fresh Mint Lemonade',
        price: 12000, // ₹120.00
        isAvailable: true,
        category: { id: 'cat-2', isActive: true },
      },
    ];

    vi.spyOn(prisma.menuItem, 'findMany').mockResolvedValue(mockDbItems as any);

    const requestedItems = [
      { menuItemId: 'item-1', quantity: 2, notes: 'Extra parmesan' },
      { menuItemId: 'item-2', quantity: 3 },
    ];

    const result = await calculateOrderPricing(restaurantId, requestedItems);

    expect(result.subtotal).toBe(2 * 45000 + 3 * 12000); // 90000 + 36000 = 126000 (₹1260.00)
    expect(result.total).toBe(126000);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].nameSnapshot).toBe('Truffle Risotto');
    expect(result.items[0].totalPrice).toBe(90000);
    expect(result.items[0].notes).toBe('Extra parmesan');
  });

  it('should reject cross-restaurant menu item injection', async () => {
    // DB returns only items belonging to the target restaurant
    vi.spyOn(prisma.menuItem, 'findMany').mockResolvedValue([]);

    const requestedItems = [{ menuItemId: 'item-belonging-to-other-restaurant', quantity: 1 }];

    await expect(calculateOrderPricing(restaurantId, requestedItems)).rejects.toThrow(
      OrderPricingValidationError,
    );
  });

  it('should reject unavailable or sold out menu items', async () => {
    const mockDbItems = [
      {
        id: 'item-sold-out',
        restaurantId,
        name: 'Special Catch of the Day',
        price: 80000,
        isAvailable: false, // SOLD OUT!
        category: { id: 'cat-1', isActive: true },
      },
    ];

    vi.spyOn(prisma.menuItem, 'findMany').mockResolvedValue(mockDbItems as any);

    const requestedItems = [{ menuItemId: 'item-sold-out', quantity: 1 }];

    await expect(calculateOrderPricing(restaurantId, requestedItems)).rejects.toThrow(
      /sold out or unavailable/,
    );
  });

  it('should reject items from inactive categories', async () => {
    const mockDbItems = [
      {
        id: 'item-inactive-cat',
        restaurantId,
        name: 'Seasonal Drink',
        price: 20000,
        isAvailable: true,
        category: { id: 'cat-inactive', isActive: false }, // Category disabled!
      },
    ];

    vi.spyOn(prisma.menuItem, 'findMany').mockResolvedValue(mockDbItems as any);

    const requestedItems = [{ menuItemId: 'item-inactive-cat', quantity: 1 }];

    await expect(calculateOrderPricing(restaurantId, requestedItems)).rejects.toThrow(
      /Category for .* is inactive/,
    );
  });

  it('should reject invalid, zero, or negative quantities', async () => {
    await expect(
      calculateOrderPricing(restaurantId, [{ menuItemId: 'item-1', quantity: 0 }]),
    ).rejects.toThrow(OrderPricingValidationError);

    await expect(
      calculateOrderPricing(restaurantId, [{ menuItemId: 'item-1', quantity: -5 }]),
    ).rejects.toThrow(OrderPricingValidationError);

    await expect(
      calculateOrderPricing(restaurantId, [{ menuItemId: 'item-1', quantity: 100 }]),
    ).rejects.toThrow(OrderPricingValidationError);
  });
});

describe('Phase 4: Dining Session Verification for Orders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should verify active, unexpired dining sessions', async () => {
    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);

    vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue({
      id: 'session-uuid-1',
      restaurantId: 'rest-uuid-1',
      tableId: 'table-uuid-1',
      sessionTokenHash: 'mock-hash',
      expiresAt: futureDate,
      isActive: true,
      status: 'ACTIVE',
      closedAt: null,
      closedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const verified = await verifyActiveTableSession('raw-session-token');

    expect(verified).not.toBeNull();
    expect(verified?.restaurantId).toBe('rest-uuid-1');
    expect(verified?.tableId).toBe('table-uuid-1');
  });

  it('should reject expired dining sessions', async () => {
    const pastDate = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago

    vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue({
      id: 'session-uuid-expired',
      restaurantId: 'rest-uuid-1',
      tableId: 'table-uuid-1',
      sessionTokenHash: 'mock-hash',
      expiresAt: pastDate,
      isActive: true,
      status: 'ACTIVE',
      closedAt: null,
      closedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const verified = await verifyActiveTableSession('raw-session-token');
    expect(verified).toBeNull();
  });

  it('should reject deactivated dining sessions', async () => {
    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);

    vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue({
      id: 'session-uuid-inactive',
      restaurantId: 'rest-uuid-1',
      tableId: 'table-uuid-1',
      sessionTokenHash: 'mock-hash',
      expiresAt: futureDate,
      isActive: false, // DEACTIVATED
      status: 'CLOSED',
      closedAt: new Date(),
      closedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const verified = await verifyActiveTableSession('raw-session-token');
    expect(verified).toBeNull();
  });
});

describe('Phase 4: Tenant Isolation & KDS Access Protection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should disallow kitchen staff from accessing another restaurant orders', async () => {
    vi.spyOn(sessionModule, 'requireUser').mockResolvedValue({
      id: 'kitchen-user-1',
      email: 'chef@kitchen.com',
      fullName: 'Chef Marco',
      phone: null,
      isActive: true,
      createdAt: new Date(),
    });

    vi.spyOn(prisma.restaurantMembership, 'findFirst').mockResolvedValue(null);

    await expect(
      requireRestaurantAccess('another-restaurant-id', [
        UserRole.OWNER,
        UserRole.MANAGER,
        UserRole.KITCHEN,
      ]),
    ).rejects.toThrow(NotFoundError);
  });
});
