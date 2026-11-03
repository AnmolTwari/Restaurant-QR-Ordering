import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyActiveTableSession } from '@/lib/qr/session';
import {
  verifyPaymentSignature,
  isRazorpayConfigured,
  fetchGatewayPayment,
} from '@/lib/payments/razorpay';
import { recordOnlinePaymentVerified } from '@/lib/payments/settlement';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    orderNumber: string;
  }>;
}

const VerifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`pay-verify:${ip}`, { limit: 15, windowMs: 60000 });
    if (!rateCheck.success) {
      return rateLimitResponse(rateCheck);
    }

    const sessionToken = req.headers.get('x-session-token') || undefined;
    const verifiedSession = await verifyActiveTableSession(sessionToken);

    if (!verifiedSession) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED_SESSION',
            message:
              'A valid active table dining session is required to verify payment.',
          },
        },
        { status: 401 },
      );
    }

    const body = await req.json();
    const data = VerifyPaymentSchema.parse(body);

    // 1. Cryptographically verify signature
    const isValidSignature = verifyPaymentSignature({
      orderId: data.razorpay_order_id,
      paymentId: data.razorpay_payment_id,
      signature: data.razorpay_signature,
    });

    if (!isValidSignature) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PAYMENT_SIGNATURE',
            message:
              'Payment verification failed: cryptographic signature mismatch.',
          },
        },
        { status: 400 },
      );
    }

    // 2. Locate order bound to active session
    const order = await prisma.order.findFirst({
      where: {
        orderNumber: params.orderNumber.toUpperCase(),
        restaurantId: verifiedSession.restaurantId,
        tableId: verifiedSession.tableId,
        sessionId: verifiedSession.session.id,
      },
    });

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Order not found for current table session.',
          },
        },
        { status: 404 },
      );
    }

    // 3. Direct server-to-server gateway verification:
    // Never mark a payment paid solely on client callback when gateway SDK is active
    let verifiedAmount: number | undefined;
    let verifiedCurrency: string | undefined;

    if (isRazorpayConfigured()) {
      try {
        const gatewayPayment = (await fetchGatewayPayment(data.razorpay_payment_id)) as {
          id: string;
          status: string;
          amount: number;
          currency: string;
          order_id?: string;
        };

        if (gatewayPayment.status !== 'captured') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'GATEWAY_PAYMENT_NOT_CAPTURED',
                message: `Gateway payment status is ${gatewayPayment.status}. Payment cannot be confirmed until captured.`,
              },
            },
            { status: 400 },
          );
        }

        verifiedAmount = gatewayPayment.amount;
        verifiedCurrency = gatewayPayment.currency;
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'GATEWAY_VERIFICATION_FAILED',
              message:
                'Failed to verify payment status directly with payment gateway. Payment will be finalized upon webhook receipt.',
            },
          },
          { status: 502 },
        );
      }
    }

    // 4. Persist verified payment evidence transactionally
    const result = await recordOnlinePaymentVerified({
      orderId: order.id,
      gatewayOrderId: data.razorpay_order_id,
      gatewayTransactionId: data.razorpay_payment_id,
      verifiedAmount,
      verifiedCurrency,
      rawPayload: {
        razorpay_order_id: data.razorpay_order_id,
        razorpay_payment_id: data.razorpay_payment_id,
        verifiedVia: 'checkout_callback',
        verifiedAt: new Date().toISOString(),
      },
    });

    const response = apiSuccess({
      verified: true,
      orderNumber: order.orderNumber,
      paymentStatus: result.order.paymentStatus,
      paymentMethod: result.order.paymentMethod,
      gatewayTransactionId: data.razorpay_payment_id,
    });
    response.headers.set('Cache-Control', 'no-store, private');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
