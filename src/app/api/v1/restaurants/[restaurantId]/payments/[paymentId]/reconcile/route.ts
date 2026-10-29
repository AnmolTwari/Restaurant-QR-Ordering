import { NextRequest } from 'next/server';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { reconcilePaymentRecord, SettlementError } from '@/lib/payments/settlement';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: {
    restaurantId: string;
    paymentId: string;
  };
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
    ]);

    const result = await reconcilePaymentRecord(params.paymentId, params.restaurantId);

    return apiSuccess({
      reconciliation: result,
    });
  } catch (error) {
    if (error instanceof SettlementError) {
      return apiSuccess({
        reconciliation: {
          paymentId: params.paymentId,
          reconciled: false,
          error: error.message,
        },
      });
    }
    return handleApiError(error);
  }
}
