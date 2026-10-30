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
 * Cancels a specific order item from an active order.
 * - Recalculates subtotal, tax, and total based on remaining active items.
 * - If all items are cancelled, transitions order to CANCELLED.
 * - For paid orders (online or counter):
 *   - Accumulates the amount owed into order.refundAmount.
 *   - Sets refundStatus to 'PENDING_COUNTER_REFUND'.
 *   - Does NOT issue automatic online refunds or change original payment to REFUNDED.
 *   - Preserves original captured payment amount for counter staff resolution.
 */
export async function cancelOrderItem(params: CancelOrderItemParams) {
  // 1. Fetch order and item within restaurant tenant scope
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

  // 2. State & eligibility checks
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

  // 3. Recalculate remaining items
  const remainingActiveItems = order.items.filter(
    (i) => i.id !== targetItem.id && i.status === OrderItemStatus.ACTIVE,
  );

  const newSubtotal = remainingActiveItems.reduce((acc, i) => acc + i.totalPrice, 0);
  const newTax = 0;
  const newTotal = newSubtotal + newTax;
  const allItemsCancelled = remainingActiveItems.length === 0;

  // 4. Financial and refund calculations
  const isPaidOrder =
    order.paymentStatus === PaymentStatus.PAID ||
    order.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED;

  const itemPrice = targetItem.totalPrice;
  const newRefundAmount = isPaidOrder ? order.refundAmount + itemPrice : order.refundAmount;

  // For paid orders, flag as requiring counter refund.
  // Original payment status and amount are preserved; no automatic Razorpay API calls.
  const refundStatus = isPaidOrder ? 'PENDING_COUNTER_REFUND' : null;

  const targetOrderStatus = allItemsCancelled
    ? OrderStatus.CANCELLED
    : order.orderStatus;

  const matchingPayment = order.payments[0];

  // 5. Atomic transaction execution
  const result = await prisma.$transaction(async (tx) => {
    // Optimistic concurrency: ensure target item is still ACTIVE
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
        'ITEM_CONCURRENT_UPDATE',
        'Item status was updated concurrently. Please refresh.',
        409,
      );
    }

    // Update order totals and refund state
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        subtotal: newSubtotal,
        tax: newTax,
        total: newTotal,
        orderStatus: targetOrderStatus,
        // Preserve original payment status (e.g. PAID); do not change to REFUNDED until counter refund is confirmed
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

    // If paid, record pending counter refund state on the payment record without altering original captured amount
    if (isPaidOrder && matchingPayment) {
      await tx.payment.update({
        where: { id: matchingPayment.id },
        data: {
          refundAmount: newRefundAmount,
          refundStatus: 'PENDING_COUNTER_REFUND',
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

    return updatedOrder;
  });

  return {
    order: result,
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
    refundStatus: isPaidOrder ? 'PENDING_COUNTER_REFUND' : null,
  };
}
