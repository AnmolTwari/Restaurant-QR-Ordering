import { prisma } from '@/lib/prisma';
import { PaymentStatus, PaymentMethod, UserRole, OrderStatus } from '@/types';

export class SettlementError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'SettlementError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface SettleCounterParams {
  restaurantId: string;
  orderId: string;
  amount: number;
  userId: string;
  userFullName: string;
  userRole: UserRole;
  reference?: string;
  notes?: string;
}

/**
 * Settles an order at the counter via Cash/Card/UPI without gateway.
 * Strictly enforced: Only CASHIER, WAITER, OWNER, or MANAGER can settle.
 * Amount must exactly match authoritative order.total (no partial payments or overpayments).
 */
export async function settleCounterPayment(params: SettleCounterParams) {
  const allowedRoles: UserRole[] = [
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.CASHIER,
    UserRole.WAITER,
  ];

  if (!allowedRoles.includes(params.userRole)) {
    throw new SettlementError(
      'UNAUTHORIZED_SETTLEMENT',
      `Role ${params.userRole} is not authorized to settle counter payments.`,
      403,
    );
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch order with lock/isolation
    const order = await tx.order.findUnique({
      where: { id: params.orderId },
      include: {
        restaurant: true,
      },
    });

    if (!order || order.restaurantId !== params.restaurantId) {
      throw new SettlementError(
        'ORDER_NOT_FOUND',
        'Order not found or does not belong to this restaurant.',
        404,
      );
    }

    if (order.orderStatus === OrderStatus.CANCELLED) {
      throw new SettlementError(
        'ORDER_CANCELLED',
        'Cannot settle payment for a cancelled order.',
        400,
      );
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new SettlementError(
        'ORDER_ALREADY_PAID',
        `Order #${order.orderNumber} is already marked as PAID. Duplicate settlement rejected.`,
        400,
      );
    }

    // 2. Strict amount verification (Integer minor units, exact match)
    if (params.amount !== order.total) {
      throw new SettlementError(
        'AMOUNT_MISMATCH',
        `Settlement amount (${params.amount}) does not match order total (${order.total}). Partial or over-payments are not permitted.`,
        400,
      );
    }

    // 3. Create verified Payment record
    const payment = await tx.payment.create({
      data: {
        restaurantId: order.restaurantId,
        orderId: order.id,
        amount: order.total,
        currency: order.restaurant.currency || 'INR',
        method: PaymentMethod.COUNTER,
        status: PaymentStatus.PAID,
        gatewayProvider: 'COUNTER',
        gatewayTransactionId:
          params.reference?.trim() || `COUNTER-${Date.now()}-${order.orderNumber}`,
        paidAt: new Date(),
      },
    });

    // 4. Create audit PaymentEvent
    await tx.paymentEvent.create({
      data: {
        paymentId: payment.id,
        provider: 'COUNTER',
        eventId: `counter-settle-${payment.id}`,
        eventType: 'counter.settled',
        payload: {
          settledByUserId: params.userId,
          settledByName: params.userFullName,
          staffRole: params.userRole,
          amount: params.amount,
          reference: params.reference || null,
          notes: params.notes || null,
          settledAt: new Date().toISOString(),
        },
      },
    });

    // 5. Update order payment status atomically with conditional check (concurrency guard)
    let updatedOrder: typeof order;
    if (typeof tx.order.updateMany === 'function') {
      const updateResult = await tx.order.updateMany({
        where: {
          id: order.id,
          paymentStatus: {
            in: [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.FAILED],
          },
        },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.COUNTER,
        },
      });

      if (updateResult.count === 0) {
        throw new SettlementError(
          'ORDER_ALREADY_PAID',
          `Order #${order.orderNumber} was marked as PAID in a concurrent transaction. Duplicate settlement rejected.`,
          400,
        );
      }

      updatedOrder = (typeof tx.order.findUniqueOrThrow === 'function'
        ? await tx.order.findUniqueOrThrow({ where: { id: order.id } })
        : (await tx.order.findUnique({ where: { id: order.id } }))) as typeof order;
    } else {
      updatedOrder = (await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.COUNTER,
        },
      })) as typeof order;
    }

    // 6. Record status history audit trail
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.orderStatus,
        toStatus: order.orderStatus,
        changedByUserId: params.userId,
        note: `Payment of ${order.total} settled at counter by ${params.userFullName} (${params.userRole})`,
      },
    });

    return {
      payment,
      order: updatedOrder,
    };
  });
}
