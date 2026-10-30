import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTableQrToken } from '@/lib/qr/token';
import {
  resolveOrCreateTableSession,
  verifyActiveTableSession,
  attachTableSessionCookie,
  getTableSessionTokenFromCookies,
  TABLE_SESSION_COOKIE_NAME,
} from '@/lib/qr/session';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const SessionRequestSchema = z.object({
  restaurantSlug: z.string().min(1).trim(),
  tableToken: z.string().min(10).optional(),
});

/**
 * POST /api/v1/public/session
 * Establishes or refreshes a guest dining table session via Route Handler.
 * Sets the secure HttpOnly `table_session` cookie on the response.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`session-sync:${ip}`, { limit: 60, windowMs: 60000 });
    if (!rateCheck.success) {
      return rateLimitResponse(rateCheck);
    }

    const body = await req.json();
    const { restaurantSlug, tableToken } = SessionRequestSchema.parse(body);
    const normalizedSlug = restaurantSlug.toLowerCase().trim();

    if (tableToken) {
      // 1. Resolve raw table token via its SHA-256 hash
      const resolved = await resolveTableQrToken(tableToken);

      if (!resolved || resolved.restaurant.slug !== normalizedSlug) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_QR_TOKEN',
              message:
                'This table QR code is invalid, expired, or has been revoked. Please ask staff for assistance.',
            },
          },
          { status: 401 },
        );
      }

      if (resolved.table.status === 'INACTIVE') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'TABLE_INACTIVE',
              message: 'This table has been marked inactive. Please inform staff.',
            },
          },
          { status: 400 },
        );
      }

      // 2. Resolve or create dining table session (reuses active session if present)
      const existingCookieToken =
        req.cookies.get(TABLE_SESSION_COOKIE_NAME)?.value ||
        (await getTableSessionTokenFromCookies());
      const sessionResult = await resolveOrCreateTableSession(
        resolved.restaurant.id,
        resolved.table.id,
        existingCookieToken,
      );

      const response = apiSuccess({
        valid: true,
        isNewSession: sessionResult.isNew,
        restaurantId: resolved.restaurant.id,
        tableId: resolved.table.id,
        tableNumber: resolved.table.tableNumber,
      });

      // 3. Attach HttpOnly table_session cookie to the response
      attachTableSessionCookie(response, sessionResult.sessionToken);
      response.headers.set('Cache-Control', 'no-store, private');
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

      return response;
    }

    // Fallback: Verify existing cookie or header-based active session
    const headerToken =
      req.headers.get('x-session-token') ||
      req.cookies.get(TABLE_SESSION_COOKIE_NAME)?.value ||
      undefined;
    const verified = await verifyActiveTableSession(headerToken);

    if (
      !verified ||
      verified.session.restaurant.slug !== normalizedSlug ||
      (verified.session.table && verified.session.table.status === 'INACTIVE')
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_OR_EXPIRED_SESSION',
            message:
              'Your table session is invalid, expired, or belongs to a different restaurant. Please rescan your table QR code.',
          },
        },
        { status: 401 },
      );
    }

    const response = apiSuccess({
      valid: true,
      isNewSession: false,
      restaurantId: verified.restaurantId,
      tableId: verified.tableId,
      tableNumber: verified.session.table.tableNumber,
    });
    response.headers.set('Cache-Control', 'no-store, private');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/v1/public/session?restaurantSlug=...
 * Validates whether the caller holds an active, unexpired session for the restaurant.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('restaurantSlug') || searchParams.get('slug');

    if (!slug) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_SLUG',
            message: 'Restaurant slug is required.',
          },
        },
        { status: 400 },
      );
    }

    const headerToken =
      req.headers.get('x-session-token') ||
      req.cookies.get(TABLE_SESSION_COOKIE_NAME)?.value ||
      undefined;
    const verified = await verifyActiveTableSession(headerToken);

    if (
      !verified ||
      verified.session.restaurant.slug !== slug.toLowerCase().trim() ||
      (verified.session.table && verified.session.table.status === 'INACTIVE')
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_OR_EXPIRED_SESSION',
            message:
              'No active table session found for this restaurant. Please scan your table QR code.',
          },
        },
        { status: 401 },
      );
    }

    const response = apiSuccess({
      valid: true,
      restaurantId: verified.restaurantId,
      tableId: verified.tableId,
      tableNumber: verified.session.table.tableNumber,
    });
    response.headers.set('Cache-Control', 'no-store, private');

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
