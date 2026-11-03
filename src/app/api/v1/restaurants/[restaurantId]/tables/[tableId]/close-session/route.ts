import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { closeTableSession, TableSessionClosureError } from '@/lib/qr/session';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { UserRole } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    restaurantId: string;
    tableId: string;
  }>;
}

/**
 * POST /api/v1/restaurants/[restaurantId]/tables/[tableId]/close-session
 * Staff action to clear an occupied table and close its active dining session.
 * Enforces business rules: all orders must be SERVED/CANCELLED, all payments settled,
 * and no pending counter refunds before closure is permitted.
 */
export async function POST(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { user, restaurant } = await requireRestaurantAccess(
      params.restaurantId,
      [UserRole.OWNER, UserRole.MANAGER, UserRole.WAITER, UserRole.CASHIER],
    );

    let expectedSessionId: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.expectedSessionId === 'string' && body.expectedSessionId.trim()) {
        expectedSessionId = body.expectedSessionId.trim();
      }
    } catch {
      // Body may be empty or not provided
    }

    const result = await closeTableSession({
      restaurantId: restaurant.id,
      tableId: params.tableId,
      expectedSessionId,
      closedByUserId: user.id,
    });

    return apiSuccess({
      message: result.message,
      sessionSummary: {
        closedSessionId: result.closedSessionId,
        ordersCount: result.ordersCount,
        totalAmount: result.totalAmount,
        closedAt: result.closedAt,
      },
    });
  } catch (error) {
    if (error instanceof TableSessionClosureError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        { status: error.statusCode },
      );
    }
    return handleApiError(error);
  }
}

