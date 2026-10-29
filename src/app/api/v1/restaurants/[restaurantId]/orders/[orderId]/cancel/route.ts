import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { validateStatusTransition } from '@/lib/orders/status-machine';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { UserRole, OrderStatus } from '@/types';

export const dynamic = 'force-dynamic';

const CancelOrderSchema = z.object({
  reason: z.string().max(250).optional().nullable(),
});

interface RouteParams {
  params: {
    restaurantId: string;
    orderId: string;
  };
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { user, restaurant, membership } = await requireRestaurantAccess(
      params.restaurantId,
      [UserRole.OWNER, UserRole.MANAGER, UserRole.WAITER],
    );

    const body = await req.json().catch(() => ({}));
    const data = CancelOrderSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findFirst({
        where: {
          id: params.orderId,
          restaurantId: restaurant.id,
        },
      });

      if (!currentOrder) {
        throw new NotFoundError('Order not found in this restaurant.');
      }

      validateStatusTransition(
        currentOrder.orderStatus as OrderStatus,
        OrderStatus.CANCELLED,
        membership.role,
      );

      // Optimistic concurrency check: ensure order status has not changed concurrently
      const updateResult = await tx.order.updateMany({
        where: {
          id: currentOrder.id,
          orderStatus: currentOrder.orderStatus,
        },
        data: { orderStatus: OrderStatus.CANCELLED },
      });

      if (updateResult.count === 0) {
        throw new Error('STATUS_CONCURRENT_CONFLICT');
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: currentOrder.id },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: currentOrder.id,
          fromStatus: currentOrder.orderStatus,
          toStatus: OrderStatus.CANCELLED,
          changedByUserId: user.id,
          note: data.reason?.trim() || `Cancelled by ${user.fullName} (${membership.role})`,
        },
      });

      return updatedOrder;
    });

    return apiSuccess({
      message: 'Order has been cancelled.',
      order: updated,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'STATUS_CONCURRENT_CONFLICT') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'STATUS_CONCURRENT_CONFLICT',
            message:
              'Order status was updated concurrently. Please refresh the page.',
          },
        },
        { status: 409 },
      );
    }
    return handleApiError(error);
  }
}
