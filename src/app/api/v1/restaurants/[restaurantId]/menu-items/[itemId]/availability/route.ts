import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const ToggleAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

interface RouteParams {
  params: {
    restaurantId: string;
    itemId: string;
  };
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    // OWNER, MANAGER, or KITCHEN can toggle item availability
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
      UserRole.KITCHEN,
    ]);

    const existing = await prisma.menuItem.findFirst({
      where: {
        id: params.itemId,
        restaurantId: restaurant.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Menu item not found');
    }

    const body = await req.json();
    const data = ToggleAvailabilitySchema.parse(body);

    const updated = await prisma.menuItem.update({
      where: { id: existing.id },
      data: { isAvailable: data.isAvailable },
      select: {
        id: true,
        name: true,
        isAvailable: true,
      },
    });

    return apiSuccess({ menuItem: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
