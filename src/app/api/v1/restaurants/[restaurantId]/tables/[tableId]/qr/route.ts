import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { createTableQrToken, revokeTableQrToken } from '@/lib/qr/token';
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
      return handleApiError(new Error('Cannot generate QR code for an inactive table.'));
    }

    const { rawToken, qrToken } = await createTableQrToken(restaurant.id, table.id);

    return apiSuccess({
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

export async function DELETE(req: NextRequest, props: RouteParams) {
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

    await revokeTableQrToken(restaurant.id, table.id);

    return apiSuccess({
      message: 'Table QR code has been revoked successfully. Further access will be blocked.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
