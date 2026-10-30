import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { completeCounterRefund, CounterRefundError } from '@/lib/orders/counter-refund';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { UserRole } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: {
    restaurantId: string;
    orderId: string;
  };
}

/**
 * POST /api/v1/restaurants/[restaurantId]/orders/[orderId]/refund-counter
 * Marks an eligible pending counter refund as completed.
 * Guarded for OWNER, MANAGER, and CASHIER roles only.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { user, restaurant, membership } = await requireRestaurantAccess(
      params.restaurantId,
      [UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER],
    );

    const result = await completeCounterRefund({
      restaurantId: restaurant.id,
      orderId: params.orderId,
      userId: user.id,
      userRole: membership.role as UserRole,
      userFullName: user.fullName,
    });

    return apiSuccess({
      message: 'Counter refund confirmed and marked paid.',
      ...result,
    });
  } catch (error) {
    if (error instanceof CounterRefundError) {
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

