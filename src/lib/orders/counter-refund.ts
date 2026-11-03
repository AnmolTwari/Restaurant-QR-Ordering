import { prisma } from '@/lib/prisma';
import { UserRole, OrderItemStatus, PaymentStatus } from '@/types';

export class CounterRefundError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'CounterRefundError';
  }
}

export interface CompleteCounterRefundParams {
  restaurantId: string;
  orderId: string;
  userId: string;
  userRole: UserRole;
  userFullName?: string | null;
}

/**
 * Marks an eligible pending counter refund as completed.
 * - Enforces role-based permissions (OWNER, MANAGER, CASHIER only).
 * - Verifies pending refund amount > 0 and refundStatus === 'PENDING_COUNTER_REFUND'.
 * - Uses optimistic concurrency checks to prevent duplicate execution.
 * - Preserves original payment history and captured amounts.
 * - Logs audit trails in OrderStatusHistory and PaymentEvent.
 */
export async function completeCounterRefund(params: CompleteCounterRefundParams) {
  // 1. Authorize: Only cashier, manager, and owner can confirm counter refunds
  const allowedRoles = [UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER];
  if (!allowedRoles.includes(params.userRole)) {
    throw new CounterRefundError(
      'FORBIDDEN',
      'Only cashiers and managers have permission to confirm counter refunds.',
      403,
    );
  }

  // 2. Locate order within tenant scope
  const order = await prisma.order.findFirst({
    where: {
      id: params.orderId,
      restaurantId: params.restaurantId,
    },
    include: {
      items: true,
      payments: {
        orderBy: { createdAt: 'desc' },
      },
      table: true,
      restaurant: true,
    },
  });

  if (!order) {
    throw new CounterRefundError('ORDER_NOT_FOUND', 'Order not found in this restaurant.', 404);
  }

  // 3. Validate pending refund state
  if (order.refundStatus !== 'PENDING_COUNTER_REFUND') {
    if (order.refundStatus === 'REFUNDED_AT_COUNTER') {
      throw new CounterRefundError(
        'ALREADY_REFUNDED',
        'Counter refund for this order has already been completed.',
        409,
      );
    }
    throw new CounterRefundError(
      'NO_PENDING_REFUND',
      'This order does not have a pending counter refund.',
      400,
    );
  }

  const pendingRefundAmount = order.refundAmount - order.refundedAtCounterAmount;
  if (pendingRefundAmount <= 0) {
    throw new CounterRefundError(
      'NO_PENDING_AMOUNT',
      'All eligible refunds for this order have already been returned at the counter.',
      400,
    );
  }

  const activeItems = order.items.filter((i) => i.status === OrderItemStatus.ACTIVE);
  const allItemsCancelled = activeItems.length === 0;

  // If all items cancelled, payment status transitions to REFUNDED, else PARTIALLY_REFUNDED
  const targetPaymentStatus = allItemsCancelled
    ? PaymentStatus.REFUNDED
    : PaymentStatus.PARTIALLY_REFUNDED;

  const matchingPayment = order.payments[0];

  // 4. Atomic transaction with optimistic concurrency
  const updatedOrder = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.order.updateMany({
      where: {
        id: order.id,
        refundStatus: 'PENDING_COUNTER_REFUND',
        refundAmount: order.refundAmount,
        refundedAtCounterAmount: order.refundedAtCounterAmount,
      },
      data: {
        refundedAtCounterAmount: order.refundAmount,
        refundStatus: 'REFUNDED_AT_COUNTER',
        refundCompletedAt: new Date(),
        refundCompletedByUserId: params.userId,
        paymentStatus: targetPaymentStatus,
      },
    });

    if (updateResult.count === 0) {
      throw new CounterRefundError(
        'CONCURRENT_REFUND_CONFLICT',
        'Counter refund status was modified concurrently. Please refresh the page.',
        409,
      );
    }

    const staffName = params.userFullName || 'Authorized Staff';

    // Update payment record if present
    if (matchingPayment) {
      await tx.payment.update({
        where: { id: matchingPayment.id },
        data: {
          status: targetPaymentStatus,
          refundStatus: 'REFUNDED_AT_COUNTER',
          refundAmount: order.refundAmount,
        },
      });

      await tx.paymentEvent.create({
        data: {
          paymentId: matchingPayment.id,
          provider: 'COUNTER',
          eventId: `ref_counter_${order.id}_${order.refundAmount}`,
          eventType: 'counter.refund_completed',
          payload: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            refundedAmount: pendingRefundAmount,
            totalRefundedAtCounter: order.refundAmount,
            staffUserId: params.userId,
            staffName,
            staffRole: params.userRole,
            completedAt: new Date().toISOString(),
          },
        },
      });
    }

    // Append audit log
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.orderStatus,
        toStatus: order.orderStatus,
        changedByUserId: params.userId,
        note: `Counter refund completed: ₹${(pendingRefundAmount / 100).toFixed(2)} returned to customer by ${staffName} (${params.userRole})`,
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        items: true,
        table: true,
        restaurant: true,
        refundCompletedByUser: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  });

  return {
    order: updatedOrder,
    refundedAmount: pendingRefundAmount,
    totalRefundedAtCounter: updatedOrder.refundedAtCounterAmount,
    refundStatus: 'REFUNDED_AT_COUNTER',
  };
}
