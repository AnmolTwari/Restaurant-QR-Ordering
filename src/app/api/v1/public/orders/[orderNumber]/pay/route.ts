import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyActiveTableSession } from '@/lib/qr/session';
import { createGatewayOrder } from '@/lib/payments/razorpay';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@/types';

import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    orderNumber: string;
  }>;
}

export async function POST(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // Rate limit: 15 payment requests per minute per IP
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`pay-init:${ip}`, { limit: 15, windowMs: 60000 });
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
              'A valid active table dining session is required to pay for this order.',
          },
        },
        { status: 401 },
      );
    }

    const order = await prisma.order.findFirst({
      where: {
        orderNumber: params.orderNumber.toUpperCase(),
        restaurantId: verifiedSession.restaurantId,
        tableId: verifiedSession.tableId,
        sessionId: verifiedSession.session.id,
      },
      include: {
        restaurant: {
          select: { id: true, name: true, slug: true, currency: true },
        },
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

    if (order.orderStatus === OrderStatus.CANCELLED) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ORDER_CANCELLED',
            message: 'Cannot pay for a cancelled order.',
          },
        },
        { status: 400 },
      );
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ORDER_ALREADY_PAID',
            message: 'This order has already been paid in full.',
          },
        },
        { status: 400 },
      );
    }

    // Authoritative server-side price (never trust client)
    const payableAmount = order.total;

    // Create server-side gateway order
    const gatewayOrder = await createGatewayOrder({
      amount: payableAmount,
      currency: order.restaurant.currency || 'INR',
      receipt: order.orderNumber,
      notes: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        restaurantId: order.restaurantId,
        tableId: order.tableId,
      },
    });

    // Record or update pending payment record transactionally
    await prisma.$transaction(async (tx) => {
      const existingPending = await tx.payment.findFirst({
        where: {
          orderId: order.id,
          status: PaymentStatus.PENDING,
        },
      });

      if (existingPending) {
        await tx.payment.update({
          where: { id: existingPending.id },
          data: {
            gatewayOrderId: gatewayOrder.id,
            gatewayProvider: 'RAZORPAY',
            amount: payableAmount,
          },
        });
      } else {
        await tx.payment.create({
          data: {
            restaurantId: order.restaurantId,
            orderId: order.id,
            amount: payableAmount,
            currency: order.restaurant.currency || 'INR',
            method: PaymentMethod.ONLINE,
            status: PaymentStatus.PENDING,
            gatewayProvider: 'RAZORPAY',
            gatewayOrderId: gatewayOrder.id,
          },
        });
      }

      if (order.paymentStatus === PaymentStatus.UNPAID) {
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: PaymentStatus.PENDING },
        });
      }
    });

    const response = apiSuccess({
      gatewayOrderId: gatewayOrder.id,
      amount: payableAmount,
      currency: order.restaurant.currency || 'INR',
      keyId:
        process.env.RAZORPAY_KEY_ID ||
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
        '',
      orderNumber: order.orderNumber,
      restaurantName: order.restaurant.name,
    });
    response.headers.set('Cache-Control', 'no-store, private');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
