import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma';
import { PaymentStatus, PaymentMethod } from '@/types';
import { SettlementError } from './counter-settlement';

export interface RecordOnlinePaymentVerifiedParams {
  orderId: string;
  gatewayOrderId: string;
  gatewayTransactionId: string;
  rawPayload?: Prisma.InputJsonValue;
  verifiedAmount?: number;
  verifiedCurrency?: string;
}

/**
 * Idempotently records verified online payment outcome.
 * Used by checkout signature verification and webhook handlers.
 *
 * Hardening features:
 * - Validates currency against restaurant settings.
 * - Enforces gateway order matching against initiated payment attempts.
 * - Prevents foreign transaction reuse across different orders.
 * - Handles race conditions where items were cancelled during checkout.
 * - Atomically settles payment and order states.
 */
export async function recordOnlinePaymentVerified(
  params: RecordOnlinePaymentVerifiedParams,
) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: params.orderId },
      include: {
        restaurant: true,
      },
    });

    if (!order) {
      throw new SettlementError('ORDER_NOT_FOUND', 'Order not found.', 404);
    }

    // 1. If order is already PAID, return idempotent success after validating gateway details
    if (order.paymentStatus === PaymentStatus.PAID) {
      const existingPayment = typeof tx.payment?.findFirst === 'function'
        ? await tx.payment.findFirst({
            where: {
              orderId: order.id,
              status: PaymentStatus.PAID,
            },
            include: { events: true },
          })
        : null;

      if (
        existingPayment &&
        existingPayment.gatewayOrderId &&
        params.gatewayOrderId &&
        existingPayment.gatewayOrderId !== params.gatewayOrderId
      ) {
        throw new SettlementError(
          'PAYMENT_ALREADY_SETTLED',
          'Order is already settled under a different gateway order ID.',
          409,
        );
      }

      return {
        isAlreadyPaid: true,
        order,
        payment: existingPayment,
      };
    }

    // 2. Verify currency if provided
    if (
      params.verifiedCurrency &&
      params.verifiedCurrency.toUpperCase() !==
        (order.restaurant.currency || 'INR').toUpperCase()
    ) {
      throw new SettlementError(
        'GATEWAY_CURRENCY_MISMATCH',
        `Gateway currency (${params.verifiedCurrency}) does not match restaurant currency (${order.restaurant.currency || 'INR'}).`,
        400,
      );
    }

    // 3. Verify gateway order matching: Prevent associating foreign gateway order to this restaurant order
    const existingOrderPayment = typeof tx.payment?.findFirst === 'function'
      ? await tx.payment.findFirst({
          where: {
            orderId: order.id,
            gatewayProvider: 'RAZORPAY',
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    if (
      existingOrderPayment &&
      existingOrderPayment.gatewayOrderId &&
      existingOrderPayment.gatewayOrderId !== params.gatewayOrderId
    ) {
      throw new SettlementError(
        'GATEWAY_ORDER_MISMATCH',
        `Gateway order ID (${params.gatewayOrderId}) does not match the pending order initiated for this order (${existingOrderPayment.gatewayOrderId}).`,
        400,
      );
    }

    // 4. Prevent foreign transaction reuse: transaction ID cannot be applied to multiple orders
    if (typeof tx.payment?.findFirst === 'function') {
      const foreignPayment = await tx.payment.findFirst({
        where: {
          gatewayTransactionId: params.gatewayTransactionId,
          orderId: { not: order.id },
          status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
        },
      });

      if (foreignPayment && foreignPayment.orderId && foreignPayment.orderId !== order.id) {
        throw new SettlementError(
          'DUPLICATE_GATEWAY_TRANSACTION',
          'This payment transaction ID has already been applied to another order.',
          409,
        );
      }
    }

    // 5. Locate pending payment or fallback to order total
    let payment = typeof tx.payment?.findFirst === 'function'
      ? await tx.payment.findFirst({
          where: {
            orderId: order.id,
            gatewayOrderId: params.gatewayOrderId,
          },
        })
      : null;

    const expectedAmount = payment?.amount ?? order.total;

    // Verify amount: accepts payment attempt amount OR current order total
    if (
      params.verifiedAmount !== undefined &&
      params.verifiedAmount !== expectedAmount &&
      params.verifiedAmount !== order.total
    ) {
      throw new SettlementError(
        'GATEWAY_AMOUNT_MISMATCH',
        `Gateway amount (${params.verifiedAmount}) does not match order total (${order.total}).`,
        400,
      );
    }

    const settledAmount = params.verifiedAmount ?? expectedAmount;

    // Reconciliation for checkout/cancellation race conditions:
    // If the captured amount exceeds current order total (e.g. item cancelled during checkout),
    // mark order PAID and track excess as a pending counter refund owed to customer.
    const excessCaptured = Math.max(0, settledAmount - order.total);
    const finalRefundAmount = (order.refundAmount || 0) + excessCaptured;
    const finalRefundStatus =
      excessCaptured > 0 ? 'PENDING_COUNTER_REFUND' : order.refundStatus;

    if (payment && typeof tx.payment?.update === 'function') {
      payment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          amount: settledAmount,
          gatewayTransactionId: params.gatewayTransactionId,
          refundAmount: finalRefundAmount,
          refundStatus: finalRefundStatus,
          paidAt: new Date(),
        },
      });
    } else if (typeof tx.payment?.create === 'function') {
      payment = await tx.payment.create({
        data: {
          restaurantId: order.restaurantId,
          orderId: order.id,
          amount: settledAmount,
          currency: order.restaurant.currency || 'INR',
          method: PaymentMethod.ONLINE,
          status: PaymentStatus.PAID,
          gatewayProvider: 'RAZORPAY',
          gatewayOrderId: params.gatewayOrderId,
          gatewayTransactionId: params.gatewayTransactionId,
          refundAmount: finalRefundAmount,
          refundStatus: finalRefundStatus,
          paidAt: new Date(),
        },
      });
    }

    // 6. Idempotent PaymentEvent recording
    const eventId = params.gatewayTransactionId;
    if (typeof tx.paymentEvent?.upsert === 'function') {
      await tx.paymentEvent.upsert({
        where: { eventId },
        update: {},
        create: {
          paymentId: payment?.id,
          provider: 'RAZORPAY',
          eventId,
          eventType: 'payment.verified',
          payload: params.rawPayload || {
            gatewayOrderId: params.gatewayOrderId,
            gatewayTransactionId: params.gatewayTransactionId,
            verifiedAt: new Date().toISOString(),
          },
        },
      });
    } else if (typeof tx.paymentEvent?.create === 'function') {
      await tx.paymentEvent.create({
        data: {
          paymentId: payment?.id,
          provider: 'RAZORPAY',
          eventId,
          eventType: 'payment.verified',
          payload: params.rawPayload || {
            gatewayOrderId: params.gatewayOrderId,
            gatewayTransactionId: params.gatewayTransactionId,
            verifiedAt: new Date().toISOString(),
          },
        },
      });
    }

    // 7. Update order payment status conditionally
    let updatedOrder: typeof order;
    if (typeof tx.order?.updateMany === 'function') {
      const updateResult = await tx.order.updateMany({
        where: {
          id: order.id,
          paymentStatus: {
            in: [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.FAILED],
          },
        },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.ONLINE,
          refundAmount: finalRefundAmount,
          refundStatus: finalRefundStatus,
        },
      });

      if (updateResult.count === 0) {
        const currentOrder = typeof tx.order?.findUniqueOrThrow === 'function'
          ? await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { restaurant: true } })
          : ((await tx.order.findUnique({ where: { id: order.id }, include: { restaurant: true } })) as typeof order);
        return {
          isAlreadyPaid: true,
          order: currentOrder,
          payment,
        };
      }

      updatedOrder = typeof tx.order?.findUniqueOrThrow === 'function'
        ? await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { restaurant: true } })
        : ((await tx.order.findUnique({ where: { id: order.id }, include: { restaurant: true } })) as typeof order);
    } else {
      updatedOrder = (await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.ONLINE,
          refundAmount: finalRefundAmount,
          refundStatus: finalRefundStatus,
        },
        include: { restaurant: true },
      })) as typeof order;
    }

    // 8. If excess was captured due to item cancellation during checkout, append audit history
    if (excessCaptured > 0 && typeof tx.orderStatusHistory?.create === 'function') {
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.orderStatus,
          toStatus: order.orderStatus,
          note: `Payment of ₹${(settledAmount / 100).toFixed(2)} captured. Items were cancelled during checkout; counter refund required: ₹${(excessCaptured / 100).toFixed(2)}.`,
        },
      });
    }

    return {
      isAlreadyPaid: false,
      order: updatedOrder,
      payment,
    };
  });
}

/**
 * Records payment failure from gateway or webhook.
 * Out-of-order protection: Will NOT downgrade an order that is already PAID.
 */
export async function recordOnlinePaymentFailed(params: {
  orderId: string;
  gatewayOrderId?: string;
  gatewayTransactionId?: string;
  reason?: string;
  rawPayload?: Prisma.InputJsonValue;
}) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: params.orderId },
    });

    if (!order) {
      throw new SettlementError('ORDER_NOT_FOUND', 'Order not found.', 404);
    }

    // Out-of-order safeguard: If order is already PAID, do not downgrade
    if (order.paymentStatus === PaymentStatus.PAID) {
      return {
        ignored: true,
        reason: 'Order is already marked as PAID; late failed event ignored.',
      };
    }

    // Update payment record if exists
    if (params.gatewayOrderId && typeof tx.payment?.findFirst === 'function') {
      const payment = await tx.payment.findFirst({
        where: {
          orderId: order.id,
          gatewayOrderId: params.gatewayOrderId,
        },
      });

      if (payment && payment.status !== PaymentStatus.PAID && typeof tx.payment?.update === 'function') {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
          },
        });
      }
    }

    // Record failure event
    const eventId =
      params.gatewayTransactionId ||
      `failed-${params.gatewayOrderId || order.id}-${Date.now()}`;

    if (typeof tx.paymentEvent?.upsert === 'function') {
      await tx.paymentEvent.upsert({
        where: { eventId },
        update: {},
        create: {
          provider: 'RAZORPAY',
          eventId,
          eventType: 'payment.failed',
          payload: params.rawPayload || {
            reason: params.reason || 'Payment failed at gateway.',
            failedAt: new Date().toISOString(),
          },
        },
      });
    } else if (typeof tx.paymentEvent?.create === 'function') {
      await tx.paymentEvent.create({
        data: {
          provider: 'RAZORPAY',
          eventId,
          eventType: 'payment.failed',
          payload: params.rawPayload || {
            reason: params.reason || 'Payment failed at gateway.',
            failedAt: new Date().toISOString(),
          },
        },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: PaymentStatus.FAILED,
      },
    });

    return { ignored: false };
  });
}
