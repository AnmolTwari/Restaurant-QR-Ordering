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

    // If order is already PAID, return idempotent success
    if (order.paymentStatus === PaymentStatus.PAID) {
      const existingPayment = await tx.payment.findFirst({
        where: {
          orderId: order.id,
          status: PaymentStatus.PAID,
        },
        include: { events: true },
      });

      return {
        isAlreadyPaid: true,
        order,
        payment: existingPayment,
      };
    }

    // Verify amount if provided by gateway response
    if (
      params.verifiedAmount !== undefined &&
      params.verifiedAmount !== order.total
    ) {
      throw new SettlementError(
        'GATEWAY_AMOUNT_MISMATCH',
        `Gateway amount (${params.verifiedAmount}) does not match order total (${order.total}).`,
        400,
      );
    }

    // Verify currency if provided by gateway response
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

    // Verify gateway order matching: Prevent associating foreign gateway order to this restaurant order
    const existingOrderPayment = await tx.payment.findFirst({
      where: {
        orderId: order.id,
        gatewayProvider: 'RAZORPAY',
      },
      orderBy: { createdAt: 'desc' },
    });

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

    // Find pending payment or create new one
    let payment = await tx.payment.findFirst({
      where: {
        orderId: order.id,
        gatewayOrderId: params.gatewayOrderId,
      },
    });

    if (payment) {
      payment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          gatewayTransactionId: params.gatewayTransactionId,
          paidAt: new Date(),
        },
      });
    } else {
      payment = await tx.payment.create({
        data: {
          restaurantId: order.restaurantId,
          orderId: order.id,
          amount: order.total,
          currency: order.restaurant.currency || 'INR',
          method: PaymentMethod.ONLINE,
          status: PaymentStatus.PAID,
          gatewayProvider: 'RAZORPAY',
          gatewayOrderId: params.gatewayOrderId,
          gatewayTransactionId: params.gatewayTransactionId,
          paidAt: new Date(),
        },
      });
    }

    // Idempotent PaymentEvent recording
    const existingEvent = await tx.paymentEvent.findUnique({
      where: { eventId: params.gatewayTransactionId },
    });

    if (!existingEvent) {
      await tx.paymentEvent.create({
        data: {
          paymentId: payment.id,
          provider: 'RAZORPAY',
          eventId: params.gatewayTransactionId,
          eventType: 'payment.verified',
          payload: params.rawPayload || {
            gatewayOrderId: params.gatewayOrderId,
            gatewayTransactionId: params.gatewayTransactionId,
            verifiedAt: new Date().toISOString(),
          },
        },
      });
    }

    // Update order payment status conditionally (optimistic concurrency guard)
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
          paymentMethod: PaymentMethod.ONLINE,
        },
      });

      if (updateResult.count === 0) {
        // Order was marked PAID concurrently
        const currentOrder = (typeof tx.order.findUniqueOrThrow === 'function'
          ? await tx.order.findUniqueOrThrow({ where: { id: order.id } })
          : (await tx.order.findUnique({ where: { id: order.id } }))) as typeof order;
        return {
          isAlreadyPaid: true,
          order: currentOrder,
          payment,
        };
      }

      updatedOrder = (typeof tx.order.findUniqueOrThrow === 'function'
        ? await tx.order.findUniqueOrThrow({ where: { id: order.id } })
        : (await tx.order.findUnique({ where: { id: order.id } }))) as typeof order;
    } else {
      updatedOrder = (await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.ONLINE,
        },
      })) as typeof order;
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
    if (params.gatewayOrderId) {
      const payment = await tx.payment.findFirst({
        where: {
          orderId: order.id,
          gatewayOrderId: params.gatewayOrderId,
        },
      });

      if (payment && payment.status !== PaymentStatus.PAID) {
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

    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: PaymentStatus.FAILED,
      },
    });

    return { ignored: false };
  });
}
