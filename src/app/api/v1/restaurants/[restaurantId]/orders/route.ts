import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { UserRole, OrderStatus } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: {
    restaurantId: string;
  };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
      UserRole.KITCHEN,
      UserRole.WAITER,
      UserRole.CASHIER,
    ]);

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status');
    const tableIdParam = searchParams.get('tableId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const statusFilter = statusParam
      ? (statusParam.split(',').map((s) => s.trim().toUpperCase()) as OrderStatus[])
      : undefined;

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: restaurant.id,
        ...(statusFilter && statusFilter.length > 0 && {
          orderStatus: { in: statusFilter },
        }),
        ...(tableIdParam && { tableId: tableIdParam }),
      },
      include: {
        table: {
          select: {
            id: true,
            tableNumber: true,
            capacity: true,
          },
        },
        items: {
          select: {
            id: true,
            nameSnapshot: true,
            priceSnapshot: true,
            quantity: true,
            totalPrice: true,
            notes: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });

    return apiSuccess({ orders });
  } catch (error) {
    return handleApiError(error);
  }
}
