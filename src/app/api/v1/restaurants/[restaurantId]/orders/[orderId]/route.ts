import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { UserRole } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    restaurantId: string;
    orderId: string;
  }>;
}

export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
      UserRole.KITCHEN,
      UserRole.WAITER,
      UserRole.CASHIER,
    ]);

    const order = await prisma.order.findFirst({
      where: {
        id: params.orderId,
        restaurantId: restaurant.id,
      },
      include: {
        table: {
          select: {
            id: true,
            tableNumber: true,
            capacity: true,
          },
        },
        items: true,
        statusHistory: {
          include: {
            changedByUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found.');
    }

    return apiSuccess({ order });
  } catch (error) {
    return handleApiError(error);
  }
}
