import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth/session';
import { UserRole } from '@/types';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const CreateRestaurantSchema = z.object({
  name: z.string().min(2, 'Restaurant name must be at least 2 characters').max(100).trim(),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .toLowerCase()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  currency: z.string().min(3).max(5).default('INR'),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const data = CreateRestaurantSchema.parse(body);

    const existingSlug = await prisma.restaurant.findUnique({
      where: { slug: data.slug },
    });

    if (existingSlug) {
      return handleApiError(
        new Error(`A restaurant with URL slug "${data.slug}" already exists. Please choose another.`),
      );
    }

    // Transactionally create the Restaurant and assign the creator the OWNER role
    const result = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description || null,
          address: data.address || null,
          phone: data.phone || null,
          currency: data.currency.toUpperCase(),
          isActive: true,
        },
      });

      const membership = await tx.restaurantMembership.create({
        data: {
          userId: user.id,
          restaurantId: restaurant.id,
          role: UserRole.OWNER,
          isActive: true,
        },
      });

      return { restaurant, membership };
    });

    return apiSuccess(
      {
        restaurant: result.restaurant,
        role: result.membership.role,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    const user = await requireUser();

    const memberships = await prisma.restaurantMembership.findMany({
      where: {
        userId: user.id,
        isActive: true,
        restaurant: {
          isActive: true,
        },
      },
      include: {
        restaurant: {
          include: {
            _count: {
              select: {
                categories: { where: { isActive: true } },
                menuItems: { where: { isAvailable: true } },
                tables: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const restaurants = memberships.map((m) => ({
      ...m.restaurant,
      role: m.role,
      stats: {
        activeCategories: m.restaurant._count.categories,
        activeMenuItems: m.restaurant._count.menuItems,
        tablesCount: m.restaurant._count.tables,
      },
    }));

    return apiSuccess({ restaurants });
  } catch (error) {
    return handleApiError(error);
  }
}
