import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  verifyActiveTableSession,
  attachTableSessionCookie,
} from '@/lib/qr/session';
import { calculateOrderPricing, OrderPricingValidationError } from '@/lib/orders/pricing';
import { generateOrderNumber } from '@/lib/orders/order-number';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@/types';

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

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 30 order placement attempts per minute per IP
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
    // Primary: HttpOnly table_session cookie (verified automatically when no raw token is provided)
    // Fallback: Scoped x-session-token header (or body sessionToken for legacy non-browser API clients)
    const fallbackToken = req.headers.get('x-session-token') || data.sessionToken || undefined;
    const verifiedSession = await verifyActiveTableSession(fallbackToken);

    if (
      !verifiedSession ||
      verifiedSession.restaurantId !== restaurant.id
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

    // 3. Verify table status
    const table = await prisma.restaurantTable.findUnique({
      where: { id: verifiedSession.tableId },
    });

    if (!table || table.status === 'INACTIVE') {
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

    // 4. Idempotency Check
    const existingOrder = await prisma.order.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      include: {
        items: true,
        table: {
          select: { id: true, tableNumber: true },
        },
      },
    });

    if (existingOrder) {
      const isSameContext =
        existingOrder.restaurantId === restaurant.id &&
        existingOrder.tableId === table.id;

      // Verify payload matches (same notes and same items)
      const isSameNotes = (existingOrder.notes || '') === (data.notes || '');

      let isSameItems = existingOrder.items.length === data.items.length;
      if (isSameItems) {
        const existingSorted = [...existingOrder.items].sort((a, b) =>
          (a.menuItemId || '').localeCompare(b.menuItemId || ''),
        );
        const incomingSorted = [...data.items].sort((a, b) =>
          a.menuItemId.localeCompare(b.menuItemId),
        );
        for (let i = 0; i < existingSorted.length; i++) {
          const ex = existingSorted[i];
          const inc = incomingSorted[i];
          if (
            ex.menuItemId !== inc.menuItemId ||
            ex.quantity !== inc.quantity ||
            (ex.notes || '') !== (inc.notes || '')
          ) {
            isSameItems = false;
            break;
          }
        }
      }

      if (isSameContext && isSameNotes && isSameItems) {
        // Safe deduplication: return the already created order
        return apiSuccess(
          {
            order: {
              id: existingOrder.id,
              orderNumber: existingOrder.orderNumber,
              orderStatus: existingOrder.orderStatus,
              paymentStatus: existingOrder.paymentStatus,
              subtotal: existingOrder.subtotal,
              tax: existingOrder.tax,
              total: existingOrder.total,
              notes: existingOrder.notes,
              createdAt: existingOrder.createdAt,
              table: existingOrder.table,
              items: existingOrder.items,
            },
            isDuplicate: true,
          },
          200,
        );
      } else {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message:
                'This idempotency key was previously used with a different request payload or context.',
            },
          },
          { status: 409 },
        );
      }
    }

    // 5. Server-side price calculation and item availability check
    let pricing;
    try {
      pricing = await calculateOrderPricing(
        restaurant.id,
        data.items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          notes: i.notes || undefined,
        })),
      );
    } catch (err) {
      if (err instanceof OrderPricingValidationError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: err.code,
              message: err.message,
            },
          },
          { status: 400 },
        );
      }
      throw err;
    }

    // 6. Generate customer-safe order reference
    const orderNumber = generateOrderNumber();

    // 7. Atomic order creation transaction
    const createdOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          restaurantId: restaurant.id,
          tableId: table.id,
          sessionId: verifiedSession.session.id,
          orderNumber,
          orderStatus: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: PaymentMethod.COUNTER,
          subtotal: pricing.subtotal,
          tax: pricing.tax,
          total: pricing.total,
          notes: data.notes?.trim() || null,
          idempotencyKey: data.idempotencyKey,
        },
      });

      // Insert immutable snapshot items
      await tx.orderItem.createMany({
        data: pricing.items.map((item) => ({
          orderId: order.id,
          menuItemId: item.menuItemId,
          nameSnapshot: item.nameSnapshot,
          priceSnapshot: item.priceSnapshot,
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          notes: item.notes,
        })),
      });

      // Initial status history log
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          note: 'Order submitted by customer at table',
        },
      });

      return order;
    });

    const items = await prisma.orderItem.findMany({
      where: { orderId: createdOrder.id },
    });

    const response = apiSuccess(
      {
        order: {
          id: createdOrder.id,
          orderNumber: createdOrder.orderNumber,
          orderStatus: createdOrder.orderStatus,
          paymentStatus: createdOrder.paymentStatus,
          subtotal: createdOrder.subtotal,
          tax: createdOrder.tax,
          total: createdOrder.total,
          notes: createdOrder.notes,
          createdAt: createdOrder.createdAt,
          table: {
            id: table.id,
            tableNumber: table.tableNumber,
          },
          items,
        },
      },
      201,
    );

    // If fallback token was used (e.g. non-browser API client), attach HttpOnly cookie for future calls
    if (fallbackToken) {
      attachTableSessionCookie(response, fallbackToken);
    }
    response.headers.set('Cache-Control', 'no-store, private');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
