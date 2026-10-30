import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const UpdateMenuItemSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  description: z.string().optional().nullable(),
  categoryId: z.string().uuid().optional(),
  price: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional().nullable().or(z.literal('')),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

interface RouteParams {
  params: Promise<{
    restaurantId: string;
    itemId: string;
  }>;
}

export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId);

    const menuItem = await prisma.menuItem.findFirst({
      where: {
        id: params.itemId,
        restaurantId: restaurant.id,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!menuItem) {
      throw new NotFoundError('Menu item not found');
    }

    return apiSuccess({ menuItem });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
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
    const data = UpdateMenuItemSchema.parse(body);

    // If categoryId is being changed, verify it belongs to this restaurant
    if (data.categoryId && data.categoryId !== existing.categoryId) {
      const category = await prisma.menuCategory.findFirst({
        where: {
          id: data.categoryId,
          restaurantId: restaurant.id,
        },
      });

      if (!category) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_CATEGORY',
              message: 'The selected category does not exist in this restaurant.',
            },
          },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.menuItem.update({
      where: { id: existing.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.categoryId && { categoryId: data.categoryId }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null }),
        ...(data.isAvailable !== undefined && { isAvailable: data.isAvailable }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return apiSuccess({ menuItem: updated });
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

    const existing = await prisma.menuItem.findFirst({
      where: {
        id: params.itemId,
        restaurantId: restaurant.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Menu item not found');
    }

    // Soft deactivate instead of destructive deletion to preserve historical orders
    const updated = await prisma.menuItem.update({
      where: { id: existing.id },
      data: { isAvailable: false },
    });

    return apiSuccess({
      message: 'Menu item deactivated successfully',
      menuItem: updated,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
