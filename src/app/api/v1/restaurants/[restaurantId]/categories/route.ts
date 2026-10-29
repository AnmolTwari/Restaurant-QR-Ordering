import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(60).trim(),
  description: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

interface RouteParams {
  params: {
    restaurantId: string;
  };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId);

    const categories = await prisma.menuCategory.findMany({
      where: {
        restaurantId: restaurant.id,
      },
      include: {
        _count: {
          select: {
            menuItems: true,
          },
        },
      },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    const data = categories.map((c) => ({
      ...c,
      itemCount: c._count.menuItems,
    }));

    return apiSuccess({ categories: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
    ]);

    const body = await req.json();
    const data = CreateCategorySchema.parse(body);

    // Prevent duplicate category names within this restaurant
    const existing = await prisma.menuCategory.findUnique({
      where: {
        restaurantId_name: {
          restaurantId: restaurant.id,
          name: data.name,
        },
      },
    });

    if (existing) {
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

    const category = await prisma.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: data.name,
        description: data.description || null,
        sortOrder: data.sortOrder,
        isActive: true,
      },
    });

    return apiSuccess({ category }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
