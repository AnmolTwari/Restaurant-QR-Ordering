import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  verifyActiveTableSession,
  attachTableSessionCookie,
} from '@/lib/qr/session';
import {
  listSessionOrders,
  createSessionOrder,
  OrderOperationError,
} from '@/lib/orders/public-orders';
import { OrderPricingValidationError } from '@/lib/orders/pricing';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const CreateOrderSchema = z.object({
  restaurantSlug: z.string().min(1).trim(),
  idempotencyKey: z.string().min(8).max(100).trim(),
  notes: z.string().max(500).optional().nullable(),
  sessionToken: z.string().optional(), // Fallback if cookie not forwarded
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
        notes: z.string().max(200).optional().nullable(),
      }),
    )
    .min(1, 'Order must contain at least one item.'),
});

/**
 * GET /api/v1/public/orders
 * Returns all orders placed by the customer within the current validated table session.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`orders-list:${ip}`, { limit: 60, windowMs: 60000 });
    if (!rateCheck.success) {
      return rateLimitResponse(rateCheck);
    }

    const fallbackToken = req.headers.get('x-session-token') || undefined;
    const verifiedSession = await verifyActiveTableSession(fallbackToken);

    if (!verifiedSession) {
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

    const { searchParams } = new URL(req.url);
    const restaurantSlug = searchParams.get('restaurantSlug') || undefined;

    if (restaurantSlug) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug: restaurantSlug.toLowerCase() },
      });
      if (!restaurant || verifiedSession.restaurantId !== restaurant.id) {
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
    }

    const orders = await listSessionOrders(verifiedSession, restaurantSlug);

    const response = apiSuccess({ orders }, 200);
    response.headers.set('Cache-Control', 'no-store, private');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return response;
  } catch (error) {
    if (error instanceof OrderOperationError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode },
      );
    }
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/public/orders
 * Places a customer order for the authenticated table session.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`order-create:${ip}`, { limit: 30, windowMs: 60000 });
    if (!rateCheck.success) {
      return rateLimitResponse(rateCheck);
    }

    const body = await req.json();
    const data = CreateOrderSchema.parse(body);

    // 1. Resolve restaurant by slug
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: data.restaurantSlug.toLowerCase() },
    });

    if (!restaurant || !restaurant.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RESTAURANT_NOT_FOUND_OR_INACTIVE',
            message: 'This restaurant is unavailable or inactive.',
          },
        },
        { status: 404 },
      );
    }

    // 2. Verify guest dining session
    const fallbackToken = req.headers.get('x-session-token') || data.sessionToken || undefined;
    const verifiedSession = await verifyActiveTableSession(fallbackToken);

    if (!verifiedSession || verifiedSession.restaurantId !== restaurant.id) {
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

    const result = await createSessionOrder(verifiedSession, data, restaurant);

    const response = apiSuccess(
      {
        order: result.order,
        isDuplicate: result.isDuplicate,
      },
      result.isDuplicate ? 200 : 201,
    );

    if (fallbackToken) {
      attachTableSessionCookie(response, fallbackToken);
    }
    response.headers.set('Cache-Control', 'no-store, private');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
  } catch (error) {
    if (error instanceof OrderOperationError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode },
      );
    }
    if (error instanceof OrderPricingValidationError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 400 },
      );
    }
    return handleApiError(error);
  }
}
