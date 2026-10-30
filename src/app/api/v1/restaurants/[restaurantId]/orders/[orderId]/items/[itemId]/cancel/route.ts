import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { cancelOrderItem, ItemCancellationError } from '@/lib/orders/item-cancellation';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { UserRole } from '@/types';

export const dynamic = 'force-dynamic';

const CancelItemBodySchema = z.object({
  reason: z.enum([
    'Item unavailable',
    'Ingredient out of stock',
    'Equipment issue',
    'Other',
  ]),
  note: z.string().max(250).optional().nullable(),
});

interface RouteParams {
  params: Promise<{
    restaurantId: string;
    orderId: string;
    itemId: string;
  }>;
}

export async function POST(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { user, restaurant, membership } = await requireRestaurantAccess(
      params.restaurantId,
      [UserRole.OWNER, UserRole.MANAGER, UserRole.KITCHEN],
    );

    const body = await req.json().catch(() => ({}));
    const data = CancelItemBodySchema.parse(body);

    const result = await cancelOrderItem({
      restaurantId: restaurant.id,
      orderId: params.orderId,
      itemId: params.itemId,
      userId: user.id,
      userRole: membership.role as UserRole,
      reason: data.reason,
      note: data.note,
    });

    return apiSuccess({
      message: 'Order item cancelled successfully.',
      ...result,
    });
  } catch (error) {
    if (error instanceof ItemCancellationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.statusCode },
      );
    }
    return handleApiError(error);
  }
}

