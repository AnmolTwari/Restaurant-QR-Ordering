import { NextRequest } from 'next/server';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { getTableActiveSessionSummary } from '@/lib/qr/session';
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
 * GET /api/v1/restaurants/[restaurantId]/tables/[tableId]/session-summary
 * Returns the current active dining session status and closure eligibility for staff.
 */
export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(
      params.restaurantId,
      [
        UserRole.OWNER,
        UserRole.MANAGER,
        UserRole.WAITER,
        UserRole.CASHIER,
        UserRole.KITCHEN,
      ],
    );

    const summary = await getTableActiveSessionSummary(
      restaurant.id,
      params.tableId,
    );

    if (!summary) {
      throw new NotFoundError('Table not found in this restaurant.');
    }

    return apiSuccess({ summary });
  } catch (error) {
    return handleApiError(error);
  }
}

