import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { rotateTableQrToken } from '@/lib/qr/token';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    restaurantId: string;
    tableId: string;
  }>;
}

export async function POST(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
    ]);

    const table = await prisma.restaurantTable.findFirst({
      where: {
        id: params.tableId,
        restaurantId: restaurant.id,
      },
    });

    if (!table) {
      throw new NotFoundError('Table not found');
    }

    if (table.status === 'INACTIVE') {
      return handleApiError(new Error('Cannot rotate QR code for an inactive table.'));
    }

    const { rawToken, qrToken } = await rotateTableQrToken(restaurant.id, table.id);

    return apiSuccess({
      message: 'Previous QR code revoked and new QR token generated.',
      rawToken,
      publicMenuUrl: `/m/${restaurant.slug}?tableToken=${rawToken}`,
      qrToken: {
        id: qrToken.id,
        createdAt: qrToken.createdAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
