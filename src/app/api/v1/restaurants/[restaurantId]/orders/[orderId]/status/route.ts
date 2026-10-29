import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { validateStatusTransition } from '@/lib/orders/status-machine';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { UserRole, OrderStatus } from '@/types';

export const dynamic = 'force-dynamic';

const UpdateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  note: z.string().max(250).optional().nullable(),
});

interface RouteParams {
  params: {
    restaurantId: string;
    orderId: string;
  };
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { user, restaurant, membership } = await requireRestaurantAccess(
      params.restaurantId,
      [UserRole.OWNER, UserRole.MANAGER, UserRole.KITCHEN, UserRole.WAITER],
    );

    const body = await req.json();
    const data = UpdateStatusSchema.parse(body);

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

      // Validate the state transition and role authorization atomically
      validateStatusTransition(
        currentOrder.orderStatus as OrderStatus,
        data.status,
        membership.role,
      );

      // Optimistic concurrency check: ensure order status has not changed concurrently
      const updateResult = await tx.order.updateMany({
        where: {
          id: currentOrder.id,
          orderStatus: currentOrder.orderStatus,
        },
        data: { orderStatus: data.status },
      });

      if (updateResult.count === 0) {
        throw new Error('STATUS_CONCURRENT_CONFLICT');
      }

      const updatedOrder = await tx.order.findUniqueOrThrow({
        where: { id: currentOrder.id },
        include: {
          table: {
            select: { id: true, tableNumber: true },
          },
          items: true,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: currentOrder.id,
          fromStatus: currentOrder.orderStatus,
          toStatus: data.status,
          changedByUserId: user.id,
          note: data.note?.trim() || `Status updated to ${data.status} by ${user.fullName}`,
        },
      });

      return updatedOrder;
    });

    return apiSuccess({
      message: `Order status advanced to ${updated.orderStatus}`,
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
              'Order status was updated by another staff member concurrently. Please refresh.',
          },
        },
        { status: 409 },
      );
    }
    return handleApiError(error);
  }
}
