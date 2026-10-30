import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(60).trim().optional(),
  description: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

interface RouteParams {
  params: Promise<{
    restaurantId: string;
    categoryId: string;
  }>;
}

export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId);

    const category = await prisma.menuCategory.findFirst({
      where: {
        id: params.categoryId,
        restaurantId: restaurant.id,
      },
      include: {
        menuItems: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    return apiSuccess({ category });
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

    const existing = await prisma.menuCategory.findFirst({
      where: {
        id: params.categoryId,
        restaurantId: restaurant.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Category not found');
    }

    const body = await req.json();
    const data = UpdateCategorySchema.parse(body);

    // If renaming, check for duplicate name in same restaurant
    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.menuCategory.findUnique({
        where: {
          restaurantId_name: {
            restaurantId: restaurant.id,
            name: data.name,
          },
        },
      });

      if (duplicate && duplicate.id !== existing.id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'DUPLICATE_CATEGORY',
              message: `A category named "${data.name}" already exists in this restaurant.`,
            },
          },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.menuCategory.update({
      where: { id: existing.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return apiSuccess({ category: updated });
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

    const existing = await prisma.menuCategory.findFirst({
      where: {
        id: params.categoryId,
        restaurantId: restaurant.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Category not found');
    }

    // Safely deactivate the category to preserve historical orders
    const updated = await prisma.menuCategory.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    return apiSuccess({
      message: 'Category deactivated successfully',
      category: updated,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
