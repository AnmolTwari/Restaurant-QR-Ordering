import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { settleCounterPayment, SettlementError } from '@/lib/payments/settlement';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    restaurantId: string;
    orderId: string;
  }>;
}

const SettleCounterSchema = z.object({
  amount: z.number().int().positive({ message: 'Amount must be a positive integer in minor units.' }),
  reference: z.string().max(100).optional(),
  notes: z.string().max(300).optional(),
});

export async function POST(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // 1. Authorize staff: CASHIER, WAITER, OWNER, MANAGER
    const context = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
      UserRole.CASHIER,
      UserRole.WAITER,
    ]);

    const body = await req.json();
    const data = SettleCounterSchema.parse(body);

    // 2. Perform transactional settlement
    const result = await settleCounterPayment({
      restaurantId: params.restaurantId,
      orderId: params.orderId,
      amount: data.amount,
      userId: context.user.id,
      userFullName: context.user.fullName,
      userRole: context.membership.role as UserRole,
      reference: data.reference,
      notes: data.notes,
    });

    return apiSuccess({
      settled: true,
      payment: {
        id: result.payment.id,
        amount: result.payment.amount,
        currency: result.payment.currency,
        method: result.payment.method,
        status: result.payment.status,
        gatewayTransactionId: result.payment.gatewayTransactionId,
        paidAt: result.payment.paidAt,
        settledBy: context.user.fullName,
        settledByRole: context.membership.role,
      },
      order: {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        orderStatus: result.order.orderStatus,
        paymentStatus: result.order.paymentStatus,
        paymentMethod: result.order.paymentMethod,
        total: result.order.total,
      },
    });
  } catch (error) {
    if (error instanceof SettlementError) {
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
