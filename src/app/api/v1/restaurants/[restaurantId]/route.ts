import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const UpdateRestaurantSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  description: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  currency: z.string().min(3).max(5).optional(),
});

interface RouteParams {
  params: {
    restaurantId: string;
  };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { restaurant, membership } = await requireRestaurantAccess(params.restaurantId);

    const counts = await prisma.restaurant.findUnique({
      where: { id: restaurant.id },
      select: {
        _count: {
          select: {
            categories: true,
            menuItems: true,
            tables: true,
            orders: true,
          },
        },
      },
    });

    return apiSuccess({
      restaurant: {
        ...restaurant,
        role: membership.role,
        stats: counts?._count || { categories: 0, menuItems: 0, tables: 0, orders: 0 },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    // Only OWNER and MANAGER can modify restaurant settings
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
    ]);

    const body = await req.json();
    const data = UpdateRestaurantSchema.parse(body);

    const updated = await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.currency && { currency: data.currency.toUpperCase() }),
      },
    });

    return apiSuccess({ restaurant: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
