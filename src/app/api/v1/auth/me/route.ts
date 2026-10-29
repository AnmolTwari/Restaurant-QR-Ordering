import { requireUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

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
          select: {
            id: true,
            name: true,
            slug: true,
            currency: true,
            address: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return apiSuccess({
      user,
      memberships: memberships.map((m) => ({
        id: m.id,
        role: m.role,
        restaurant: m.restaurant,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
