import { prisma } from '@/lib/prisma';
import { resolveTableQrToken } from '@/lib/qr/token';
import {
  resolveOrCreateTableSession,
  verifyActiveTableSession,
  getTableSessionTokenFromCookies,
} from '@/lib/qr/session';
import type { PublicMenuData } from '@/types/public-menu';

export type LoadPublicMenuResult =
  | { success: true; data: PublicMenuData }
  | { success: false; error: string; code: 'MISSING_PARAMS' | 'INVALID_QR_TOKEN' | 'SERVER_ERROR' };

/**
 * Server-side loader for restaurant public menu and table session.
 * Used by SSR menu page and API route.
 */
export async function loadPublicMenuData(
  slug: string | null | undefined,
  tableToken: string | null | undefined,
): Promise<LoadPublicMenuResult> {
  try {
    if (!slug) {
      return {
        success: false,
        error: 'Missing restaurant slug.',
        code: 'MISSING_PARAMS',
      };
    }

    let restaurant;
    let table;
    const existingSessionToken = await getTableSessionTokenFromCookies();

    if (tableToken) {
      // 1. Resolve raw table token via its SHA-256 hash
      const resolved = await resolveTableQrToken(tableToken);

      if (!resolved || resolved.restaurant.slug !== slug.toLowerCase().trim()) {
        return {
          success: false,
          error:
            'This table QR code is invalid, expired, or has been revoked. Please ask staff for assistance.',
          code: 'INVALID_QR_TOKEN',
        };
      }

      restaurant = resolved.restaurant;
      table = resolved.table;
    } else {
      // Check if user already has an active dining session for this restaurant
      const verified = await verifyActiveTableSession();
      if (
        verified &&
        verified.session.restaurant &&
        verified.session.restaurant.slug === slug.toLowerCase().trim() &&
        verified.session.table
      ) {
        restaurant = verified.session.restaurant;
        table = verified.session.table;
      } else {
        return {
          success: false,
          error: 'Missing table QR access token. Please scan a valid table QR code.',
          code: 'MISSING_PARAMS',
        };
      }
    }

    // 2. Fetch active categories and available items
    const categories = await prisma.menuCategory.findMany({
      where: {
        restaurantId: restaurant.id,
        isActive: true,
      },
      include: {
        menuItems: {
          where: {
            isAvailable: true,
          },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            imageUrl: true,
            isAvailable: true,
            sortOrder: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // 3. Resolve or create dining table session
    const sessionResult = await resolveOrCreateTableSession(
      restaurant.id,
      table.id,
      existingSessionToken,
    );

    const data: PublicMenuData = {
      restaurant: {
        name: restaurant.name,
        slug: restaurant.slug,
        description: restaurant.description,
        address: restaurant.address,
        phone: restaurant.phone,
        currency: restaurant.currency,
      },
      table: {
        id: table.id,
        tableNumber: table.tableNumber,
        capacity: table.capacity,
      },
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        items: cat.menuItems,
      })),
      session: {
        id: sessionResult.session.id,
        sessionToken: sessionResult.sessionToken,
        expiresAt: sessionResult.session.expiresAt.toISOString(),
      },
    };

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error';
    return { success: false, error: message, code: 'SERVER_ERROR' };
  }
}
