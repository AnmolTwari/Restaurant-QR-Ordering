import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashToken } from './token';
import type { TableSession, Restaurant, RestaurantTable } from '@/generated/prisma';

export const TABLE_SESSION_COOKIE_NAME = 'table_session';
const SESSION_DURATION_HOURS = 6;

export interface SessionResult {
  sessionToken: string;
  session: TableSession;
  isNew: boolean;
}

/**
 * Resolves an existing active session or creates a new table dining session.
 * Reusing an existing valid session prevents duplicate sessions on page reloads.
 */
export async function resolveOrCreateTableSession(
  restaurantId: string,
  tableId: string,
  existingRawToken?: string,
): Promise<SessionResult> {
  const now = new Date();

  // 1. If customer already has a session token, verify if it is valid for this exact table
  if (existingRawToken) {
    const sessionTokenHash = hashToken(existingRawToken);
    const existingSession = await prisma.tableSession.findUnique({
      where: { sessionTokenHash },
    });

    if (
      existingSession &&
      existingSession.isActive &&
      existingSession.restaurantId === restaurantId &&
      existingSession.tableId === tableId &&
      existingSession.expiresAt > now
    ) {
      return {
        sessionToken: existingRawToken,
        session: existingSession,
        isNew: false,
      };
    }
  }

  // 2. Otherwise create a fresh dining session bound to (restaurantId, tableId)
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const sessionTokenHash = hashToken(sessionToken);
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  const session = await prisma.tableSession.create({
    data: {
      restaurantId,
      tableId,
      sessionTokenHash,
      expiresAt,
      isActive: true,
    },
  });

  return {
    sessionToken,
    session,
    isNew: true,
  };
}

/**
 * Sets the secure table session cookie.
 */
export async function setTableSessionCookie(sessionToken: string): Promise<void> {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieStore = await cookies();
    cookieStore.set(TABLE_SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DURATION_HOURS * 60 * 60,
    });
  } catch {
    // Handled safely in environments where next/headers cookies() is read-only
  }
}

/**
 * Attaches the secure table session cookie directly to a NextResponse.
 */
export function attachTableSessionCookie(
  response: NextResponse,
  sessionToken: string,
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  response.cookies.set(TABLE_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_HOURS * 60 * 60,
  });
}

/**
 * Clears the table session cookie from response or store.
 */
export async function clearTableSessionCookie(response?: NextResponse): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  if (response) {
    response.cookies.set(TABLE_SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  } else {
    try {
      const cookieStore = await cookies();
      cookieStore.set(TABLE_SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
    } catch {
      // Safe in SSR
    }
  }
}

/**
 * Gets the current raw table session token from cookies.
 */
export async function getTableSessionTokenFromCookies(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(TABLE_SESSION_COOKIE_NAME)?.value;
  } catch {
    return undefined;
  }
}

export interface VerifiedTableSessionContext {
  session: TableSession & {
    restaurant: Restaurant;
    table: RestaurantTable;
  };
  restaurantId: string;
  tableId: string;
}

/**
 * Verifies an active, unexpired table dining session from cookie or provided raw token.
 * Returns the session context or null if missing, inactive, or expired.
 */
export async function verifyActiveTableSession(
  rawToken?: string,
): Promise<VerifiedTableSessionContext | null> {
  const token = rawToken || (await getTableSessionTokenFromCookies());
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return null;
  }

  const sessionTokenHash = hashToken(token.trim());
  const session = await prisma.tableSession.findUnique({
    where: { sessionTokenHash },
    include: {
      restaurant: true,
      table: true,
    },
  });

  if (
    !session ||
    !session.isActive ||
    session.expiresAt <= new Date() ||
    (session.restaurant && !session.restaurant.isActive) ||
    (session.table && session.table.status === 'INACTIVE')
  ) {
    return null;
  }

  return {
    session,
    restaurantId: session.restaurantId,
    tableId: session.tableId,
  };
}
