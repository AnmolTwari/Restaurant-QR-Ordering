import { prisma } from '@/lib/prisma';
import { PaymentStatus, PaymentMethod } from '@/types';
import { fetchGatewayPayment } from './razorpay';
import { SettlementError } from './counter-settlement';
import {
  recordOnlinePaymentVerified,
  recordOnlinePaymentFailed,
} from './online-settlement';

/**
 * Reconciles an uncertain or pending payment against the gateway.
 */
export async function reconcilePaymentRecord(
  paymentId: string,
  restaurantId?: string,
) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: true,
    },
  });

  if (!payment || (restaurantId && payment.restaurantId !== restaurantId)) {
    throw new SettlementError('PAYMENT_NOT_FOUND', 'Payment not found.', 404);
  }

  // Counter payments are local; if marked PAID, they are verified
  if (payment.method === PaymentMethod.COUNTER) {
    return {
      paymentId: payment.id,
      status: payment.status,
      method: payment.method,
      reconciled: true,
      message: 'Counter payments are managed locally by staff.',
    };
  }

  // If gatewayTransactionId is present, query Razorpay directly
  const queryTxId = payment.gatewayTransactionId;
  if (!queryTxId) {
    return {
      paymentId: payment.id,
      status: payment.status,
      method: payment.method,
      reconciled: false,
      message: 'No gateway transaction ID available yet to query gateway.',
    };
  }

  try {
    const gatewayData = (await fetchGatewayPayment(queryTxId)) as {
      id: string;
      status: string;
      amount: number;
      currency: string;
      order_id?: string;
    };

    if (gatewayData.status === 'captured' || gatewayData.status === 'authorized') {
      const result = await recordOnlinePaymentVerified({
        orderId: payment.orderId,
        gatewayOrderId: gatewayData.order_id || payment.gatewayOrderId || '',
        gatewayTransactionId: gatewayData.id,
        verifiedAmount: gatewayData.amount,
        rawPayload: { ...gatewayData, reconciledAt: new Date().toISOString() },
      });

      return {
        paymentId: payment.id,
        status: PaymentStatus.PAID,
        reconciled: true,
        orderUpdated: true,
        message: 'Successfully verified and reconciled payment as PAID.',
        payment: result.payment,
      };
    } else if (gatewayData.status === 'failed') {
      await recordOnlinePaymentFailed({
        orderId: payment.orderId,
        gatewayOrderId: gatewayData.order_id || payment.gatewayOrderId || undefined,
        gatewayTransactionId: gatewayData.id,
        reason: 'Payment status is failed on gateway.',
      });

      return {
        paymentId: payment.id,
        status: PaymentStatus.FAILED,
        reconciled: true,
        orderUpdated: true,
        message: 'Reconciled payment status as FAILED.',
      };
    } else {
      return {
        paymentId: payment.id,
        status: payment.status,
        reconciled: false,
        message: `Gateway status is ambiguous (${gatewayData.status}). Left in current state.`,
      };
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      paymentId: payment.id,
      status: payment.status,
      reconciled: false,
      error: errorMsg,
      message: 'Failed to contact gateway or parse gateway response.',
    };
  }
}
