import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import {
  recordOnlinePaymentVerified,
  recordOnlinePaymentFailed,
} from '@/lib/payments/settlement';
import { PaymentStatus } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Read raw body as string for cryptographic verification
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_SIGNATURE',
            message: 'Missing x-razorpay-signature header.',
          },
        },
        { status: 400 },
      );
    }

    const isValid = verifyWebhookSignature({
      rawBody,
      signature,
    });

    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_WEBHOOK_SIGNATURE',
            message: 'Webhook signature verification failed.',
          },
        },
        { status: 400 },
      );
    }

    // 2. Parse event body safely
    let event: Record<string, any>;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Malformed JSON payload.',
          },
        },
        { status: 400 },
      );
    }

    const eventType: string = event.event || 'unknown';
    const paymentEntity = event.payload?.payment?.entity;
    const orderEntity = event.payload?.order?.entity;
    const refundEntity = event.payload?.refund?.entity;

    const gatewayOrderId = paymentEntity?.order_id || orderEntity?.id;
    const gatewayPaymentId = paymentEntity?.id || refundEntity?.payment_id;

    // Stable deterministic eventId: Header ID -> Body ID -> Deterministic entity composite
    const eventId: string =
      req.headers.get('x-razorpay-event-id') ||
      (typeof event.id === 'string' && event.id ? event.id : '') ||
      `${eventType}:${gatewayPaymentId || gatewayOrderId || 'evt'}:${refundEntity?.id || paymentEntity?.created_at || 'ts'}`;

    // 3. Process webhook idempotently within an atomic transaction
    const processResult = await prisma.$transaction(async (tx) => {
      // Idempotency check: return duplicate if event already recorded
      const existingEvent = await tx.paymentEvent.findUnique({
        where: { eventId },
      });

      if (existingEvent) {
        return { duplicate: true };
      }

      // Locate target order and payment
      const notes = paymentEntity?.notes || orderEntity?.notes || {};
      const orderIdFromNotes = notes.orderId;
      const orderNumberFromNotes = notes.orderNumber;

      let targetOrder = null;
      let targetPayment = null;

      const findOrderById = async (id: string) => {
        if (typeof tx.order?.findUnique === 'function') {
          return await tx.order.findUnique({ where: { id } });
        }
        if (typeof tx.order?.findFirst === 'function') {
          return await tx.order.findFirst({ where: { id } });
        }
        return null;
      };

      if (orderIdFromNotes) {
        targetOrder = await findOrderById(orderIdFromNotes);
      } else if (orderNumberFromNotes && typeof tx.order?.findFirst === 'function') {
        targetOrder = await tx.order.findFirst({
          where: { orderNumber: orderNumberFromNotes },
        });
      }

      if (gatewayPaymentId && typeof tx.payment?.findFirst === 'function') {
        targetPayment = await tx.payment.findFirst({
          where: { gatewayTransactionId: gatewayPaymentId },
          include: { order: true },
        });
        if (!targetOrder && targetPayment) {
          targetOrder =
            targetPayment.order ||
            (targetPayment.orderId ? await findOrderById(targetPayment.orderId) : null);
        }
      }

      if (!targetOrder && gatewayOrderId && typeof tx.payment?.findFirst === 'function') {
        const existingPayment = await tx.payment.findFirst({
          where: { gatewayOrderId },
          include: { order: true },
        });
        targetOrder =
          existingPayment?.order ||
          (existingPayment?.orderId ? await findOrderById(existingPayment.orderId) : null);
        if (!targetPayment) {
          targetPayment = existingPayment;
        }
      }

      switch (eventType) {
        case 'payment.captured':
        case 'order.paid': {
          if (targetOrder && gatewayOrderId && gatewayPaymentId) {
            await recordOnlinePaymentVerified({
              orderId: targetOrder.id,
              gatewayOrderId,
              gatewayTransactionId: gatewayPaymentId,
              verifiedAmount: paymentEntity?.amount,
              verifiedCurrency: paymentEntity?.currency,
              rawPayload: event,
            });
          }
          break;
        }

        case 'payment.failed': {
          if (targetOrder) {
            await recordOnlinePaymentFailed({
              orderId: targetOrder.id,
              gatewayOrderId,
              gatewayTransactionId: gatewayPaymentId,
              reason:
                paymentEntity?.error_description ||
                paymentEntity?.error_reason ||
                'Payment failed on gateway.',
              rawPayload: event,
            });
          }
          break;
        }

        case 'refund.created': {
          // Razorpay refund initiated: mark status as processing but do NOT mark refunded yet
          if (targetOrder || targetPayment) {
            const payment =
              targetPayment ||
              (targetOrder
                ? await tx.payment.findFirst({
                    where: {
                      orderId: targetOrder.id,
                      ...(gatewayPaymentId ? { gatewayTransactionId: gatewayPaymentId } : {}),
                    },
                  })
                : null);

            if (payment) {
              await tx.payment.update({
                where: { id: payment.id },
                data: {
                  refundStatus: 'PROCESSING',
                  gatewayRefundId: refundEntity?.id || undefined,
                },
              });
            }

            await tx.paymentEvent.create({
              data: {
                paymentId: payment?.id,
                provider: 'RAZORPAY',
                eventId,
                eventType,
                payload: event,
              },
            });
          }
          break;
        }

        case 'refund.processed': {
          // Razorpay refund succeeded: accurately distinguish full vs partial refund
          if (targetOrder || targetPayment) {
            const payment =
              targetPayment ||
              (targetOrder
                ? await tx.payment.findFirst({
                    where: {
                      orderId: targetOrder.id,
                      ...(gatewayPaymentId ? { gatewayTransactionId: gatewayPaymentId } : {}),
                    },
                  })
                : null);

            if (payment) {
              const refundAmount = Number(refundEntity?.amount) || 0;
              const currentRefunded = payment.refundAmount || 0;
              const newTotalRefunded = Math.min(payment.amount, currentRefunded + refundAmount);
              const isFullRefund = newTotalRefunded >= payment.amount;

              const targetStatus = isFullRefund
                ? PaymentStatus.REFUNDED
                : PaymentStatus.PARTIALLY_REFUNDED;

              await tx.payment.update({
                where: { id: payment.id },
                data: {
                  status: targetStatus,
                  refundAmount: newTotalRefunded,
                  refundStatus: 'PROCESSED',
                  gatewayRefundId: refundEntity?.id || undefined,
                },
              });

              if (targetOrder || payment.orderId) {
                await tx.order.update({
                  where: { id: targetOrder?.id || payment.orderId },
                  data: {
                    paymentStatus: targetStatus,
                    refundAmount: newTotalRefunded,
                  },
                });
              }
            }

            await tx.paymentEvent.create({
              data: {
                paymentId: payment?.id,
                provider: 'RAZORPAY',
                eventId,
                eventType,
                payload: event,
              },
            });
          }
          break;
        }

        case 'refund.failed': {
          if (targetOrder) {
            const payment = await tx.payment.findFirst({
              where: {
                orderId: targetOrder.id,
                ...(gatewayPaymentId ? { gatewayTransactionId: gatewayPaymentId } : {}),
              },
            });

            if (payment) {
              await tx.payment.update({
                where: { id: payment.id },
                data: { refundStatus: 'FAILED' },
              });
            }

            await tx.paymentEvent.create({
              data: {
                paymentId: payment?.id,
                provider: 'RAZORPAY',
                eventId,
                eventType,
                payload: event,
              },
            });
          }
          break;
        }

        default: {
          // Audit-log unhandled/unknown event without corrupting payment state
          await tx.paymentEvent.create({
            data: {
              provider: 'RAZORPAY',
              eventId,
              eventType,
              payload: event,
            },
          });
          break;
        }
      }

      return { duplicate: false };
    });

    if (processResult.duplicate) {
      return NextResponse.json(
        {
          success: true,
          duplicate: true,
          message: 'Webhook event was already processed.',
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        received: true,
        eventType,
      },
      { status: 200 },
    );
  } catch (error) {
    const correlationId = `err_webhook_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    console.error(`[Razorpay Webhook Error] [${correlationId}]`, error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'WEBHOOK_PROCESSING_ERROR',
          message: 'An error occurred while processing the webhook event.',
          correlationId,
        },
      },
      { status: 500 },
    );
  }
}
