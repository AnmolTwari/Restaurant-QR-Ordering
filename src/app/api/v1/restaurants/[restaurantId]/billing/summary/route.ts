import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { UserRole, PaymentStatus } from '@/types';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    restaurantId: string;
  }>;
}

/**
 * GET: Aggregates financial billing summary for restaurant owners and managers.
 * Supports date range filtering (?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD).
 */
export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
    ]);

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (startDateParam) {
      dateFilter.gte = new Date(startDateParam);
    }
    if (endDateParam) {
      const end = new Date(endDateParam);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const whereClause = {
      restaurantId: restaurant.id,
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    };

    const orders = await prisma.order.findMany({
      where: whereClause,
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        paymentStatus: true,
        paymentMethod: true,
        subtotal: true,
        tax: true,
        total: true,
        cgst: true,
        sgst: true,
        igst: true,
        serviceCharge: true,
        packagingCharge: true,
        customCharge: true,
        discountAmount: true,
        taxableAmount: true,
        refundAmount: true,
        refundedAtCounterAmount: true,
        createdAt: true,
      },
    });

    let totalBilled = 0;
    let totalCashCollected = 0;
    let outstandingUnpaid = 0;
    let totalDiscounts = 0;
    let totalGstCollected = 0;
    let totalServiceCharges = 0;
    let totalPackagingCharges = 0;
    let totalCustomCharges = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let refundedCount = 0;

    for (const o of orders) {
      if (o.orderStatus === 'CANCELLED') continue;

      totalBilled += o.total;
      totalDiscounts += o.discountAmount;
      totalServiceCharges += o.serviceCharge;
      totalPackagingCharges += o.packagingCharge;
      totalCustomCharges += o.customCharge;

      if (o.paymentStatus === PaymentStatus.PAID) {
        paidCount++;
        totalCashCollected += o.total;
        totalGstCollected += o.tax;
      } else if (
        o.paymentStatus === PaymentStatus.REFUNDED ||
        o.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED
      ) {
        refundedCount++;
        const netCollected = Math.max(0, o.total - o.refundedAtCounterAmount);
        totalCashCollected += netCollected;
      } else {
        unpaidCount++;
        outstandingUnpaid += o.total;
      }
    }

    return apiSuccess({
      metrics: {
        totalBilled,
        totalCashCollected,
        outstandingUnpaid,
        totalDiscounts,
        totalGstCollected,
        additionalCharges: {
          serviceCharge: totalServiceCharges,
          packagingCharge: totalPackagingCharges,
          customCharge: totalCustomCharges,
          total: totalServiceCharges + totalPackagingCharges + totalCustomCharges,
        },
        counts: {
          totalOrders: orders.length,
          paidOrders: paidCount,
          unpaidOrders: unpaidCount,
          refundedOrders: refundedCount,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
