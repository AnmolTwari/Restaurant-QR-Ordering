import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: {
    restaurantId: string;
  };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
      UserRole.CASHIER,
    ]);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const method = searchParams.get('method');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const whereClause: Record<string, unknown> = {
      restaurantId: params.restaurantId,
    };

    if (status) {
      whereClause.status = status;
    }
    if (method) {
      whereClause.method = method;
    }

    const payments = await prisma.payment.findMany({
      where: whereClause,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderStatus: true,
            total: true,
            table: {
              select: { tableNumber: true },
            },
          },
        },
        events: {
          select: {
            id: true,
            eventType: true,
            payload: true,
            processedAt: true,
          },
          orderBy: { processedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });

    // Format output extracting counter staff member when available
    const formattedPayments = payments.map((p) => {
      let counterStaffName: string | null = null;
      let counterStaffRole: string | null = null;
      let counterReference: string | null = null;

      if (p.method === 'COUNTER') {
        const settleEvent = p.events.find(
          (e) => e.eventType === 'counter.settled',
        );
        if (settleEvent && typeof settleEvent.payload === 'object' && settleEvent.payload !== null) {
          const payload = settleEvent.payload as Record<string, unknown>;
          counterStaffName = (payload.settledByName as string) || null;
          counterStaffRole = (payload.staffRole as string) || null;
          counterReference = (payload.reference as string) || null;
        }
      }

      return {
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order.orderNumber,
        tableNumber: p.order.table.tableNumber,
        orderStatus: p.order.orderStatus,
        amount: p.amount,
        currency: p.currency,
        method: p.method,
        status: p.status,
        gatewayProvider: p.gatewayProvider,
        gatewayTransactionId: p.gatewayTransactionId,
        gatewayOrderId: p.gatewayOrderId,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        counterStaffName,
        counterStaffRole,
        counterReference,
        eventsCount: p.events.length,
      };
    });

    return apiSuccess({ payments: formattedPayments });
  } catch (error) {
    return handleApiError(error);
  }
}
