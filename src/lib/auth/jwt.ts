import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const AUTH_COOKIE_NAME = 'auth_token';
const DEFAULT_EXPIRATION = '7d';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  [key: string]: unknown;
}

function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production.');
    }
    return new TextEncoder().encode('dev-jwt-super-secret-key-change-in-production-min-32-chars');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Signs a secure JWT auth token with tamper-proof HMAC SHA-256.
 */
export async function signAuthToken(payload: AuthTokenPayload): Promise<string> {
  const secretKey = getJwtSecretKey();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(DEFAULT_EXPIRATION)
    .sign(secretKey);
}

/**
 * Verifies a JWT auth token and returns the decoded payload.
 */
export async function verifyAuthToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const secretKey = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secretKey);
    if (!payload.userId || typeof payload.userId !== 'string') {
      return null;
    }
    return {
      userId: payload.userId,
      email: (payload.email as string) || '',
    };
  } catch {
    return null;
  }
}

/**
 * Sets the secure httpOnly auth cookie on the current response.
 */
export function setAuthCookie(token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  cookies().set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  });
}

/**
 * Clears the auth cookie.
 */
export function clearAuthCookie(): void {
  try {
    cookies().delete(AUTH_COOKIE_NAME);
  } catch {
    // Handled safely outside request scope
  }
}

/**
 * Retrieves the raw auth token string from request cookies.
 */
export function getAuthTokenFromCookies(): string | undefined {
  try {
    return cookies().get(AUTH_COOKIE_NAME)?.value;
  } catch {
    return undefined;
  }
}
