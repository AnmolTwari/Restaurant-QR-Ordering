import { prisma } from '@/lib/prisma';
import type { VerifiedTableSessionContext } from '@/lib/qr/session';
import { calculateOrderPricing } from '@/lib/orders/pricing';
import { generateOrderNumber } from '@/lib/orders/order-number';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@/types';

export interface CreateSessionOrderInput {
  restaurantSlug: string;
  idempotencyKey: string;
  notes?: string | null;
  items: Array<{
    menuItemId: string;
    quantity: number;
    notes?: string | null;
  }>;
}

export class OrderOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'OrderOperationError';
  }
}

/**
 * Lists all orders placed within the authenticated active dining session.
 * Enforces restaurant, table, and session boundary checks.
 */
export async function listSessionOrders(
  verifiedSession: VerifiedTableSessionContext,
  restaurantSlug?: string,
) {
  if (
    restaurantSlug &&
    verifiedSession.session.restaurant.slug.toLowerCase() !== restaurantSlug.toLowerCase()
  ) {
    throw new OrderOperationError(
      'CROSS_RESTAURANT_ACCESS_DENIED',
      'This table session belongs to a different restaurant.',
      403,
    );
  }

  const orders = await prisma.order.findMany({
    where: {
      restaurantId: verifiedSession.restaurantId,
      tableId: verifiedSession.tableId,
      sessionId: verifiedSession.session.id,
    },
    include: {
      restaurant: {
        select: { id: true, name: true, slug: true, currency: true },
      },
      table: {
        select: { id: true, tableNumber: true },
      },
      items: {
        select: {
          id: true,
          nameSnapshot: true,
          priceSnapshot: true,
          quantity: true,
          totalPrice: true,
          notes: true,
          status: true,
          cancelReason: true,
          cancelNote: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      statusHistory: {
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    refundAmount: order.refundAmount,
    refundedAtCounterAmount: order.refundedAtCounterAmount,
    refundStatus: order.refundStatus,
    refundCompletedAt: order.refundCompletedAt ? order.refundCompletedAt.toISOString() : null,
    notes: order.notes,
    createdAt: order.createdAt,
    restaurant: order.restaurant,
    table: order.table,
    items: order.items,
    statusHistory: order.statusHistory,
  }));
}

/**
 * Validates and creates a new order for the active dining session.
 * Handles idempotency deduplication and atomic transaction insertion.
 */
export async function createSessionOrder(
  verifiedSession: VerifiedTableSessionContext,
  input: CreateSessionOrderInput,
  resolvedRestaurant?: { id: string; slug: string; isActive?: boolean } | null,
) {
  const { session } = verifiedSession;
  const restaurant = resolvedRestaurant || session.restaurant;

  if (
    restaurant &&
    restaurant.slug.toLowerCase() !== input.restaurantSlug.toLowerCase()
  ) {
    throw new OrderOperationError(
      'CROSS_RESTAURANT_ACCESS_DENIED',
      'This table session belongs to a different restaurant.',
      403,
    );
  }

  // 1. Verify table status
  const table = await prisma.restaurantTable.findUnique({
    where: { id: verifiedSession.tableId },
  });

  if (!table || table.status === 'INACTIVE') {
    throw new OrderOperationError(
      'TABLE_INACTIVE',
      'This table has been marked inactive. Please inform staff.',
      400,
    );
  }

  // 2. Idempotency Check
  const existingOrder = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: {
      items: true,
      table: { select: { id: true, tableNumber: true } },
    },
  });

  if (existingOrder) {
    const isSameContext =
      existingOrder.restaurantId === restaurant.id &&
      existingOrder.tableId === table.id;

    const isSameNotes = (existingOrder.notes || '') === (input.notes || '');

    let isSameItems = existingOrder.items.length === input.items.length;
    if (isSameItems) {
      const existingSorted = [...existingOrder.items].sort((a, b) =>
        (a.menuItemId || '').localeCompare(b.menuItemId || ''),
      );
      const incomingSorted = [...input.items].sort((a, b) =>
        a.menuItemId.localeCompare(b.menuItemId),
      );
      for (let i = 0; i < existingSorted.length; i++) {
        const ex = existingSorted[i];
        const inc = incomingSorted[i];
        if (
          ex.menuItemId !== inc.menuItemId ||
          ex.quantity !== inc.quantity ||
          (ex.notes || '') !== (inc.notes || '')
        ) {
          isSameItems = false;
          break;
        }
      }
    }

    if (isSameContext && isSameNotes && isSameItems) {
      return {
        order: {
          id: existingOrder.id,
          orderNumber: existingOrder.orderNumber,
          orderStatus: existingOrder.orderStatus,
          paymentStatus: existingOrder.paymentStatus,
          subtotal: existingOrder.subtotal,
          tax: existingOrder.tax,
          total: existingOrder.total,
          notes: existingOrder.notes,
          createdAt: existingOrder.createdAt,
          table: existingOrder.table,
          items: existingOrder.items,
        },
        isDuplicate: true,
      };
    } else {
      throw new OrderOperationError(
        'IDEMPOTENCY_CONFLICT',
        'This idempotency key was previously used with a different request payload or context.',
        409,
      );
    }
  }

  // 3. Server-side price calculation
  const pricing = await calculateOrderPricing(
    restaurant.id,
    input.items.map((i) => ({
      menuItemId: i.menuItemId,
      quantity: i.quantity,
      notes: i.notes || undefined,
    })),
  );

  const orderNumber = generateOrderNumber();

  // 4. Atomic transaction
  const createdOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        sessionId: session.id,
        orderNumber,
        orderStatus: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: pricing.subtotal,
        tax: pricing.tax,
        total: pricing.total,
        notes: input.notes?.trim() || null,
        idempotencyKey: input.idempotencyKey,
      },
    });

    await tx.orderItem.createMany({
      data: pricing.items.map((item) => ({
        orderId: order.id,
        menuItemId: item.menuItemId,
        nameSnapshot: item.nameSnapshot,
        priceSnapshot: item.priceSnapshot,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        notes: item.notes,
      })),
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: null,
        toStatus: OrderStatus.PENDING,
        note: 'Order submitted by customer at table',
      },
    });

    return order;
  });

  const items = await prisma.orderItem.findMany({
    where: { orderId: createdOrder.id },
  });

  return {
    order: {
      id: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      orderStatus: createdOrder.orderStatus,
      paymentStatus: createdOrder.paymentStatus,
      subtotal: createdOrder.subtotal,
      tax: createdOrder.tax,
      total: createdOrder.total,
      notes: createdOrder.notes,
      createdAt: createdOrder.createdAt,
      table: {
        id: table.id,
        tableNumber: table.tableNumber,
      },
      items,
    },
    isDuplicate: false,
  };
}
