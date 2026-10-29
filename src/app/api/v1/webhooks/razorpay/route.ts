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
    let event: any;
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

    const eventType: string = event.event;
    const eventId: string =
      event.id ||
      event.payload?.payment?.entity?.id ||
      `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 3. Idempotency Check: prevent duplicate event processing
    const existingEvent = await prisma.paymentEvent.findUnique({
      where: { eventId },
    });

    if (existingEvent) {
      return NextResponse.json(
        {
          success: true,
          duplicate: true,
          message: 'Webhook event was already processed.',
        },
        { status: 200 },
      );
    }

    // 4. Handle supported event types
    const paymentEntity = event.payload?.payment?.entity;
    const orderEntity = event.payload?.order?.entity;
    const refundEntity = event.payload?.refund?.entity;

    const gatewayOrderId =
      paymentEntity?.order_id || orderEntity?.id;
    const gatewayPaymentId = paymentEntity?.id;
    const notes = paymentEntity?.notes || orderEntity?.notes || {};
    const orderIdFromNotes = notes.orderId;
    const orderNumberFromNotes = notes.orderNumber;

    // Locate target order
    let targetOrder = null;
    if (orderIdFromNotes) {
      targetOrder = await prisma.order.findUnique({
        where: { id: orderIdFromNotes },
      });
    } else if (orderNumberFromNotes) {
      targetOrder = await prisma.order.findFirst({
        where: { orderNumber: orderNumberFromNotes },
      });
    } else if (gatewayOrderId) {
      const existingPayment = await prisma.payment.findFirst({
        where: { gatewayOrderId },
        include: { order: true },
      });
      targetOrder = existingPayment?.order || null;
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

      case 'refund.processed':
      case 'refund.created': {
        if (targetOrder) {
          await prisma.$transaction(async (tx) => {
            const payment = await tx.payment.findFirst({
              where: { orderId: targetOrder.id },
            });

            if (payment) {
              await tx.payment.update({
                where: { id: payment.id },
                data: { status: PaymentStatus.REFUNDED },
              });
            }

            await tx.order.update({
              where: { id: targetOrder.id },
              data: { paymentStatus: PaymentStatus.REFUNDED },
            });

            await tx.paymentEvent.create({
              data: {
                paymentId: payment?.id,
                provider: 'RAZORPAY',
                eventId,
                eventType,
                payload: event,
              },
            });
          });
        }
        break;
      }

      default: {
        // Record unknown/unhandled events for audit without failing
        await prisma.paymentEvent.create({
          data: {
            provider: 'RAZORPAY',
            eventId,
            eventType,
            payload: event,
          },
        });
        return NextResponse.json(
          {
            success: true,
            unhandled: true,
            eventType,
            message: 'Event logged but no action required.',
          },
          { status: 200 },
        );
      }
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
    const message = error instanceof Error ? error.message : 'Webhook error';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'WEBHOOK_PROCESSING_ERROR',
          message,
        },
      },
      { status: 500 },
    );
  }
}
