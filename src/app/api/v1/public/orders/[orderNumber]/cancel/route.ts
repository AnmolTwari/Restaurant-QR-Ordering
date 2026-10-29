import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyActiveTableSession } from '@/lib/qr/session';
import { validateStatusTransition } from '@/lib/orders/status-machine';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { OrderStatus } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: {
    orderNumber: string;
  };
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const sessionToken = req.headers.get('x-session-token') || undefined;
    const verifiedSession = await verifyActiveTableSession(sessionToken);

    if (!verifiedSession) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED_SESSION',
            message: 'A valid active table dining session is required to cancel this order.',
          },
        },
        { status: 401 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          orderNumber: params.orderNumber.toUpperCase(),
          restaurantId: verifiedSession.restaurantId,
          tableId: verifiedSession.tableId,
        },
      });

      if (!order) {
        throw new Error('ORDER_NOT_FOUND');
      }

      // Validate customer cancellation rules (only allowed while PENDING)
      validateStatusTransition(order.orderStatus as OrderStatus, OrderStatus.CANCELLED, 'CUSTOMER');

      // Optimistic concurrency check: ensure order is still PENDING
      const updateResult = await tx.order.updateMany({
        where: {
          id: order.id,
          orderStatus: OrderStatus.PENDING,
        },
        data: { orderStatus: OrderStatus.CANCELLED },
      });

      if (updateResult.count === 0) {
        throw new Error('STATUS_CONCURRENT_CONFLICT');
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.orderStatus,
          toStatus: OrderStatus.CANCELLED,
          note: 'Cancelled by customer before kitchen acceptance',
        },
      });

      return updatedOrder;
    });

    const response = apiSuccess({
      message: 'Order cancelled successfully.',
      orderNumber: updated.orderNumber,
      orderStatus: updated.orderStatus,
    });
    response.headers.set('Cache-Control', 'no-store, private');
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'STATUS_CONCURRENT_CONFLICT') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CANNOT_CANCEL_ORDER',
            message:
              'Order was already accepted or modified by the kitchen and can no longer be cancelled.',
          },
        },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === 'ORDER_NOT_FOUND') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Order not found for this table session.',
          },
        },
        { status: 404 },
      );
    }
    return handleApiError(error);
  }
}
