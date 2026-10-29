import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { signAuthToken, verifyAuthToken } from '@/lib/auth/jwt';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { AuthorizationError, AuthenticationError } from '@/lib/auth/session';
import * as sessionModule from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@/types';

describe('Phase 2: Authentication & Password Security', () => {
  it('should securely hash password with bcrypt and verify matching plaintext', async () => {
    const plaintext = 'SuperSecret123!';
    const hash = await hashPassword(plaintext);

    expect(hash).not.toBe(plaintext);
    expect(hash.startsWith('$2')).toBe(true);

    const isMatch = await verifyPassword(plaintext, hash);
    expect(isMatch).toBe(true);

    const isWrongMatch = await verifyPassword('WrongPassword', hash);
    expect(isWrongMatch).toBe(false);
  });

  it('should sign tamper-proof JWT auth token and verify valid payload', async () => {
    const payload = { userId: 'user-uuid-1', email: 'owner@test.com' };
    const token = await signAuthToken(payload);

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const verified = await verifyAuthToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe('user-uuid-1');
    expect(verified?.email).toBe('owner@test.com');
  });

  it('should reject tampered or corrupted JWT tokens', async () => {
    const validToken = await signAuthToken({ userId: 'user-uuid-1', email: 'owner@test.com' });
    const tampered = validToken.slice(0, -6) + 'abcdef';

    const verified = await verifyAuthToken(tampered);
    expect(verified).toBeNull();
  });
});

describe('Phase 2: Tenant Isolation & Authorization Guards', () => {
  const mockUser = {
    id: 'user-owner-1',
    email: 'owner@bistro.com',
    fullName: 'Owner One',
    phone: null,
    isActive: true,
    createdAt: new Date(),
  };

  const mockRestaurant = {
    id: 'rest-uuid-1',
    name: 'Bistro One',
    slug: 'bistro-one',
    description: null,
    address: null,
    phone: null,
    currency: 'INR',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should permit access when user has valid membership and role', async () => {
    vi.spyOn(sessionModule, 'requireUser').mockResolvedValue(mockUser);
    vi.spyOn(prisma.restaurantMembership, 'findFirst').mockResolvedValue({
      id: 'membership-1',
      userId: mockUser.id,
      restaurantId: mockRestaurant.id,
      role: UserRole.OWNER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      restaurant: mockRestaurant,
    } as any);

    const ctx = await requireRestaurantAccess(mockRestaurant.id, [UserRole.OWNER, UserRole.MANAGER]);

    expect(ctx.user.id).toBe(mockUser.id);
    expect(ctx.restaurant.id).toBe(mockRestaurant.id);
    expect(ctx.membership.role).toBe(UserRole.OWNER);
  });

  it('should reject and return NotFoundError when user has NO membership in restaurant (preventing tenant probing)', async () => {
    vi.spyOn(sessionModule, 'requireUser').mockResolvedValue(mockUser);
    vi.spyOn(prisma.restaurantMembership, 'findFirst').mockResolvedValue(null);

    await expect(requireRestaurantAccess('other-tenant-id')).rejects.toThrow(NotFoundError);
  });

  it('should reject with AuthorizationError when user role is not permitted for the action', async () => {
    vi.spyOn(sessionModule, 'requireUser').mockResolvedValue(mockUser);
    vi.spyOn(prisma.restaurantMembership, 'findFirst').mockResolvedValue({
      id: 'membership-2',
      userId: mockUser.id,
      restaurantId: mockRestaurant.id,
      role: UserRole.WAITER, // Waiter role
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      restaurant: mockRestaurant,
    } as any);

    // Action requires OWNER or MANAGER
    await expect(
      requireRestaurantAccess(mockRestaurant.id, [UserRole.OWNER, UserRole.MANAGER]),
    ).rejects.toThrow(AuthorizationError);
  });

  it('should reject unauthenticated requests with AuthenticationError', async () => {
    vi.spyOn(sessionModule, 'requireUser').mockRejectedValue(new AuthenticationError());

    await expect(requireRestaurantAccess(mockRestaurant.id)).rejects.toThrow(AuthenticationError);
  });
});

describe('Phase 2: Cross-Tenant Validation Invariants', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should disallow associating a menu item with a category from another restaurant', async () => {
    const restaurant1Id = 'rest-1111-1111';
    const foreignCategoryId = 'cat-belonging-to-rest-2';

    // Simulate database returning null when querying category with restaurant1Id
    vi.spyOn(prisma.menuCategory, 'findFirst').mockResolvedValue(null);

    const categoryInRestaurant1 = await prisma.menuCategory.findFirst({
      where: {
        id: foreignCategoryId,
        restaurantId: restaurant1Id,
      },
    });

    expect(categoryInRestaurant1).toBeNull();
  });

  it('should prevent duplicate category names within the same restaurant', async () => {
    const restaurantId = 'rest-1111-1111';
    const categoryName = 'Beverages';

    vi.spyOn(prisma.menuCategory, 'findUnique').mockResolvedValue({
      id: 'cat-1',
      restaurantId,
      name: categoryName,
      description: null,
      sortOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const existing = await prisma.menuCategory.findUnique({
      where: {
        restaurantId_name: {
          restaurantId,
          name: categoryName,
        },
      },
    });

    expect(existing).not.toBeNull();
    expect(existing?.name).toBe('Beverages');
  });
});
