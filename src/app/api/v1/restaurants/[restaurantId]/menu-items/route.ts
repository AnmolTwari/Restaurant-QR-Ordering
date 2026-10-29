import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const CreateMenuItemSchema = z.object({
  name: z.string().min(1, 'Item name is required').max(100).trim(),
  description: z.string().optional().nullable(),
  categoryId: z.string().uuid('Valid category ID is required'),
  price: z
    .number()
    .int('Price must be an integer in minor units (e.g., paise/cents)')
    .nonnegative('Price cannot be negative'),
  imageUrl: z.string().url('Must be a valid URL').optional().nullable().or(z.literal('')),
  isAvailable: z.boolean().default(true),
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

    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get('categoryId');
    const availableOnly = searchParams.get('availableOnly') === 'true';

    const menuItems = await prisma.menuItem.findMany({
      where: {
        restaurantId: restaurant.id,
        ...(categoryId && { categoryId }),
        ...(availableOnly && { isAvailable: true }),
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    return apiSuccess({ menuItems });
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
    const data = CreateMenuItemSchema.parse(body);

    // Cross-tenant security check: Ensure category exists AND belongs to THIS restaurant
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

    const menuItem = await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: category.id,
        name: data.name,
        description: data.description || null,
        price: data.price,
        imageUrl: data.imageUrl || null,
        isAvailable: data.isAvailable,
        sortOrder: data.sortOrder,
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

    return apiSuccess({ menuItem }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
