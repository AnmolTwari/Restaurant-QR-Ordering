import { prisma } from '@/lib/prisma';
import { getAuthTokenFromCookies, verifyAuthToken } from './jwt';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Retrieves the currently authenticated user from session cookie.
 * Returns null if not logged in or user is inactive.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const token = getAuthTokenFromCookies();
  if (!token) {
    return null;
  }

  const payload = await verifyAuthToken(token);
  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

export class AuthenticationError extends Error {
  constructor(message = 'Unauthorized: Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'Forbidden: Insufficient restaurant permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Requires an authenticated user. Throws AuthenticationError if unauthenticated.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthenticationError();
  }
  return user;
}
