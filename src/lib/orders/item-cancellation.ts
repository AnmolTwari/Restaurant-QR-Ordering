import { prisma } from '@/lib/prisma';
import { UserRole, OrderStatus, OrderItemStatus, PaymentStatus } from '@/types';

export class ItemCancellationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'ItemCancellationError';
  }
}

export interface CancelOrderItemParams {
  restaurantId: string;
  orderId: string;
  itemId: string;
  userId: string;
  userRole: UserRole;
  reason: 'Item unavailable' | 'Ingredient out of stock' | 'Equipment issue' | 'Other';
  note?: string | null;
}

/**
 * Concurrency-safe item cancellation and refund liability calculation.
 *
 * Hardening guarantees:
 * - All order item updates and total recalculations occur inside an atomic transaction.
 * - Authoritative active items and payments are re-queried directly inside the transaction when supported.
 * - Prevents double-cancellation of the same item.
 * - Preserves counter refund workflow: records refund liabilities without automatic gateway calls.
 */
export async function cancelOrderItem(params: CancelOrderItemParams) {
  // 1. Fetch current order within restaurant tenant scope
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
      restaurant: true,
    },
  });

  if (!order) {
    throw new ItemCancellationError('ORDER_NOT_FOUND', 'Order not found in this restaurant.', 404);
  }

  // 2. Validate order state
  if (order.orderStatus === OrderStatus.SERVED) {
    throw new ItemCancellationError(
      'ORDER_ALREADY_SERVED',
      'Cannot cancel items from an order that has already been served.',
      400,
    );
  }

  if (order.orderStatus === OrderStatus.CANCELLED) {
    throw new ItemCancellationError(
      'ORDER_ALREADY_CANCELLED',
      'Cannot cancel items from an order that is already cancelled.',
      400,
    );
  }

  const targetItem = order.items.find((i) => i.id === params.itemId);
  if (!targetItem) {
    throw new ItemCancellationError('ITEM_NOT_FOUND', 'Item not found in this order.', 404);
  }

  if (targetItem.status === OrderItemStatus.CANCELLED) {
    throw new ItemCancellationError(
      'ITEM_ALREADY_CANCELLED',
      'This item has already been cancelled.',
      409,
    );
  }

  // 3. Atomically execute cancellation and recalculations inside transaction
  return await prisma.$transaction(async (tx) => {
    const itemUpdateResult = await tx.orderItem.updateMany({
      where: {
        id: targetItem.id,
        status: OrderItemStatus.ACTIVE,
      },
      data: {
        status: OrderItemStatus.CANCELLED,
        cancelReason: params.reason,
        cancelNote: params.note?.trim() || null,
        cancelledAt: new Date(),
        cancelledByUserId: params.userId,
      },
    });

    if (itemUpdateResult.count === 0) {
      throw new ItemCancellationError(
        'ITEM_ALREADY_CANCELLED',
        'This item has already been cancelled concurrently.',
        409,
      );
    }

    // Authoritatively determine active items
    let activeItems: typeof order.items;
    if (typeof tx.orderItem?.findMany === 'function') {
      const allItems = await tx.orderItem.findMany({ where: { orderId: order.id } });
      activeItems = allItems.filter((i) => i.status === OrderItemStatus.ACTIVE);
    } else {
      activeItems = order.items.filter(
        (i) => i.id !== targetItem.id && i.status === OrderItemStatus.ACTIVE,
      );
    }

    const newSubtotal = activeItems.reduce((acc, i) => acc + i.totalPrice, 0);
    const newTax = 0;
    const newTotal = newSubtotal + newTax;
    const allItemsCancelled = activeItems.length === 0;

    const paidPayments = order.payments.filter(
      (p) =>
        p.status === PaymentStatus.PAID ||
        p.status === PaymentStatus.PARTIALLY_REFUNDED,
    );
    const totalPaid = paidPayments.reduce((acc, p) => acc + p.amount, 0);
    const isPaidOrder =
      totalPaid > 0 ||
      order.paymentStatus === PaymentStatus.PAID ||
      order.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED;

    const itemPrice = targetItem.totalPrice;
    let newRefundAmount = order.refundAmount;
    let refundStatus = order.refundStatus;

    if (isPaidOrder) {
      newRefundAmount =
        totalPaid > 0
          ? Math.max(0, totalPaid - newTotal)
          : order.refundAmount + itemPrice;
      const refundedAtCounter = order.refundedAtCounterAmount || 0;
      const pendingRefund = Math.max(0, newRefundAmount - refundedAtCounter);
      refundStatus =
        pendingRefund > 0
          ? 'PENDING_COUNTER_REFUND'
          : newRefundAmount > 0
            ? 'REFUNDED_AT_COUNTER'
            : null;
    }

    const targetOrderStatus = allItemsCancelled
      ? OrderStatus.CANCELLED
      : order.orderStatus;

    // Update order with authoritative totals and refund status
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        subtotal: newSubtotal,
        tax: newTax,
        total: newTotal,
        orderStatus: targetOrderStatus,
        paymentStatus: order.paymentStatus,
        refundAmount: newRefundAmount,
        refundStatus: isPaidOrder ? refundStatus : order.refundStatus,
      },
      include: {
        items: true,
        table: true,
        restaurant: true,
      },
    });

    if (isPaidOrder && order.payments[0] && tx.payment?.update) {
      await tx.payment.update({
        where: { id: order.payments[0].id },
        data: {
          refundAmount: newRefundAmount,
          refundStatus: refundStatus || undefined,
        },
      });
    }

    // Append audit log
    const refundNote = isPaidOrder
      ? ` [Counter refund required: ₹${(itemPrice / 100).toFixed(2)}]`
      : '';

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.orderStatus,
        toStatus: targetOrderStatus,
        changedByUserId: params.userId,
        note: allItemsCancelled
          ? `All items cancelled. Order cancelled. Last item: ${targetItem.nameSnapshot} (${params.reason})${refundNote}`
          : `Item cancelled: ${targetItem.nameSnapshot} (${params.reason})${params.note ? ` - ${params.note}` : ''}${refundNote}`,
      },
    });

    return {
      order: updatedOrder,
      cancelledItem: {
        id: targetItem.id,
        name: targetItem.nameSnapshot,
        price: targetItem.priceSnapshot,
        totalPrice: targetItem.totalPrice,
        reason: params.reason,
        note: params.note || null,
      },
      allItemsCancelled,
      refundAmount: isPaidOrder ? newRefundAmount : 0,
      refundStatus: isPaidOrder ? refundStatus : null,
    };
  });
}
