import { prisma } from '@/lib/prisma';
import { UserRole } from '@/types';
import { requireUser, AuthorizationError } from './session';
import type { AuthenticatedUser } from './session';
import type { Restaurant, RestaurantMembership } from '@/generated/prisma';

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface RestaurantAccessContext {
  user: AuthenticatedUser;
  membership: RestaurantMembership;
  restaurant: Restaurant;
}

/**
 * Enforces strict tenant isolation and role-based authorization.
 *
 * 1. Authenticates current user.
 * 2. Verifies active membership for the requested restaurantId from the database.
 * 3. Never trusts client-supplied roles or permissions.
 * 4. Checks role against allowedRoles (if provided).
 * 5. Returns 404 (NotFoundError) if membership is absent to avoid tenant enumeration.
 */
export async function requireRestaurantAccess(
  restaurantId: string,
  allowedRoles?: UserRole[],
): Promise<RestaurantAccessContext> {
  const user = await requireUser();

  if (!restaurantId || typeof restaurantId !== 'string') {
    throw new NotFoundError('Restaurant not found');
  }

  const membership = await prisma.restaurantMembership.findFirst({
    where: {
      userId: user.id,
      restaurantId,
      isActive: true,
      restaurant: {
        isActive: true,
      },
    },
    include: {
      restaurant: true,
    },
  });

  if (!membership || !membership.restaurant) {
    // Return 404 rather than 403 when no membership exists to avoid tenant ID discovery
    throw new NotFoundError('Restaurant not found');
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const hasRole = allowedRoles.includes(membership.role as UserRole);
    if (!hasRole) {
      throw new AuthorizationError(
        `Action requires one of the following roles: ${allowedRoles.join(', ')}`,
      );
    }
  }

  return {
    user,
    membership,
    restaurant: membership.restaurant,
  };
}
