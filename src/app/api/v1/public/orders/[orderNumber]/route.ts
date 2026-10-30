import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyActiveTableSession } from '@/lib/qr/session';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    orderNumber: string;
  }>;
}

export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const sessionToken = req.headers.get('x-session-token') || undefined;
    const verifiedSession = await verifyActiveTableSession(sessionToken);

    if (!verifiedSession) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED_SESSION',
            message: 'A valid active table dining session is required to track this order.',
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
      },
      include: {
        restaurant: {
          select: { id: true, name: true, slug: true, currency: true },
        },
        table: {
          select: { id: true, tableNumber: true },
        },
        items: {
          select: {
            id: true,
            nameSnapshot: true,
            priceSnapshot: true,
            quantity: true,
            totalPrice: true,
            notes: true,
            status: true,
            cancelReason: true,
            cancelNote: true,
          },
        },
        statusHistory: {
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
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

    const response = apiSuccess({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        refundAmount: order.refundAmount,
        refundedAtCounterAmount: order.refundedAtCounterAmount,
        refundStatus: order.refundStatus,
        refundCompletedAt: order.refundCompletedAt ? order.refundCompletedAt.toISOString() : null,
        refundCompletedByUserId: order.refundCompletedByUserId,
        notes: order.notes,
        createdAt: order.createdAt,
        restaurant: order.restaurant,
        table: order.table,
        items: order.items,
        statusHistory: order.statusHistory,
      },
    });
    response.headers.set('Cache-Control', 'no-store, private');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
