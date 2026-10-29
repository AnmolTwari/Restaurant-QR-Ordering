import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import type { RestaurantSummary } from '@/types/dashboard';
import type { StaffOrderDetails } from '@/types/orders';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@/types';

export type KitchenInitialDataResult =
  | { authenticated: false }
  | { authenticated: true; hasRestaurants: false; restaurants: [] }
  | {
      authenticated: true;
      hasRestaurants: true;
      restaurants: RestaurantSummary[];
      activeRestaurant: RestaurantSummary;
      initialOrders: StaffOrderDetails[];
    };

/**
 * Server-side loader for Kitchen Display System (KDS).
 * Pre-fetches restaurant list and active pending/prep orders on the server.
 */
export async function getKitchenInitialData(): Promise<KitchenInitialDataResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { authenticated: false };
  }

  const memberships = await prisma.restaurantMembership.findMany({
    where: {
      userId: user.id,
      isActive: true,
      restaurant: { isActive: true },
    },
    include: {
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (memberships.length === 0) {
    return {
      authenticated: true,
      hasRestaurants: false,
      restaurants: [],
    };
  }

  const restaurants: RestaurantSummary[] = memberships.map((m) => ({
    id: m.restaurant.id,
    name: m.restaurant.name,
    slug: m.restaurant.slug,
    currency: m.restaurant.currency,
    role: m.role,
  }));

  const activeRestaurant = restaurants[0];

  const rawOrders = await prisma.order.findMany({
    where: {
      restaurantId: activeRestaurant.id,
      orderStatus: { in: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'] },
    },
    include: {
      table: {
        select: {
          id: true,
          tableNumber: true,
          capacity: true,
        },
      },
      items: {
        select: {
          id: true,
          menuItemId: true,
          nameSnapshot: true,
          priceSnapshot: true,
          quantity: true,
          totalPrice: true,
          notes: true,
        },
      },
      statusHistory: {
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          changedByUserId: true,
          note: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 60,
  });

  const initialOrders: StaffOrderDetails[] = rawOrders.map((o) => ({
    id: o.id,
    restaurantId: o.restaurantId,
    tableId: o.tableId,
    sessionId: o.sessionId,
    orderNumber: o.orderNumber,
    orderStatus: o.orderStatus as OrderStatus,
    paymentStatus: o.paymentStatus as PaymentStatus,
    paymentMethod: o.paymentMethod as PaymentMethod,
    subtotal: o.subtotal,
    tax: o.tax,
    total: o.total,
    notes: o.notes,
    idempotencyKey: o.idempotencyKey,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    table: o.table,
    items: o.items,
    statusHistory: o.statusHistory.map((s) => ({
      id: s.id,
      fromStatus: s.fromStatus ? (s.fromStatus as OrderStatus) : null,
      toStatus: s.toStatus as OrderStatus,
      changedByUserId: s.changedByUserId,
      note: s.note,
      createdAt: s.createdAt.toISOString(),
    })),
  }));

  return {
    authenticated: true,
    hasRestaurants: true,
    restaurants,
    activeRestaurant,
    initialOrders,
  };
}
