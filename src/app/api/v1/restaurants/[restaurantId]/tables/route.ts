import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { UserRole, TableStatus } from '@/types';
import { createTableQrToken } from '@/lib/qr/token';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const CreateTableSchema = z.object({
  tableNumber: z.string().min(1, 'Table number is required').max(20).trim(),
  capacity: z.number().int().min(1, 'Capacity must be at least 1').max(50).default(4),
  status: z.nativeEnum(TableStatus).default(TableStatus.AVAILABLE),
  generateQr: z.boolean().default(true),
});

interface RouteParams {
  params: Promise<{
    restaurantId: string;
  }>;
}

export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId);
    const now = new Date();

    const tables = await prisma.restaurantTable.findMany({
      where: {
        restaurantId: restaurant.id,
      },
      include: {
        qrTokens: {
          where: { isRevoked: false },
          select: {
            id: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        sessions: {
          where: {
            isActive: true,
            status: 'ACTIVE',
            expiresAt: { gt: now },
          },
          include: {
            orders: {
              select: {
                id: true,
                orderNumber: true,
                orderStatus: true,
                paymentStatus: true,
                total: true,
                refundStatus: true,
                refundAmount: true,
                refundedAtCounterAmount: true,
              },
            },
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            sessions: {
              where: {
                isActive: true,
                expiresAt: { gt: now },
              },
            },
            orders: true,
          },
        },
      },
      orderBy: {
        tableNumber: 'asc',
      },
    });

    const formatted = tables.map((t) => {
      const activeSession = t.sessions[0];
      let operationalState: 'AVAILABLE' | 'OCCUPIED' | 'NEEDS_ATTENTION' =
        t.status === 'AVAILABLE' ? 'AVAILABLE' : 'OCCUPIED';
      let attentionReason: string | null = null;
      let isFullyServed = false;

      if (t.status === 'INACTIVE') {
        operationalState = 'AVAILABLE';
      } else if (!activeSession) {
        operationalState = 'AVAILABLE';
      } else {
        const orders = activeSession.orders;
        const hasUnpaid = orders.some(
          (o) =>
            o.total > 0 &&
            o.orderStatus !== 'CANCELLED' &&
            o.paymentStatus !== 'PAID' &&
            o.paymentStatus !== 'PARTIALLY_REFUNDED' &&
            o.paymentStatus !== 'REFUNDED',
        );
        const hasReady = orders.some((o) => o.orderStatus === 'READY');
        const hasPendingRefund = orders.some(
          (o) =>
            o.refundStatus === 'PENDING_COUNTER_REFUND' &&
            o.refundAmount - o.refundedAtCounterAmount > 0,
        );
        isFullyServed =
          orders.length > 0 &&
          orders.every(
            (o) => o.orderStatus === 'SERVED' || o.orderStatus === 'CANCELLED',
          );

        if (hasUnpaid) {
          operationalState = 'NEEDS_ATTENTION';
          attentionReason = 'Unpaid Orders';
        } else if (hasPendingRefund) {
          operationalState = 'NEEDS_ATTENTION';
          attentionReason = 'Pending Refund';
        } else if (hasReady) {
          operationalState = 'NEEDS_ATTENTION';
          attentionReason = 'Ready to Serve';
        } else if (isFullyServed) {
          operationalState = 'NEEDS_ATTENTION';
          attentionReason = 'Ready to Clear Table';
        } else {
          operationalState = 'OCCUPIED';
        }
      }

      return {
        id: t.id,
        tableNumber: t.tableNumber,
        capacity: t.capacity,
        status: t.status,
        operationalState,
        attentionReason,
        isFullyServed,
        hasActiveSession: Boolean(activeSession),
        activeSessionId: activeSession?.id || null,
        activeOrdersCount: activeSession?.orders.length || 0,
        hasActiveQr: t.qrTokens.length > 0,
        qrTokenInfo: t.qrTokens[0] || null,
        activeSessionsCount: t._count.sessions,
        totalOrdersCount: t._count.orders,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    });

    return apiSuccess({ tables: formatted });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
    ]);

    const body = await req.json();
    const data = CreateTableSchema.parse(body);

    // Enforce tableNumber uniqueness within this restaurant
    const existing = await prisma.restaurantTable.findUnique({
      where: {
        restaurantId_tableNumber: {
          restaurantId: restaurant.id,
          tableNumber: data.tableNumber,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DUPLICATE_TABLE_NUMBER',
            message: `A table with number "${data.tableNumber}" already exists in this restaurant.`,
          },
        },
        { status: 409 },
      );
    }

    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurant.id,
        tableNumber: data.tableNumber,
        capacity: data.capacity,
        status: data.status,
      },
    });

    let rawToken: string | undefined;
    let publicMenuUrl: string | undefined;

    if (data.generateQr) {
      const qrResult = await createTableQrToken(restaurant.id, table.id);
      rawToken = qrResult.rawToken;
      publicMenuUrl = `/m/${restaurant.slug}?tableToken=${rawToken}`;
    }

    return apiSuccess(
      {
        table: {
          ...table,
          hasActiveQr: !!rawToken,
        },
        rawToken,
        publicMenuUrl,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
