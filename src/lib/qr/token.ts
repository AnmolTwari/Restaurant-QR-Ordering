import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import type { Restaurant, RestaurantTable, TableQrToken } from '@/generated/prisma';

/**
 * Generates an unpredictable URL-safe raw token using Node.js cryptographic randomness.
 * 32 random bytes = 256 bits of entropy (64 hex characters).
 */
export function generateRawToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Creates a deterministic SHA-256 hash of a raw token.
 * Only the hash is ever persisted in the database; raw tokens are never stored.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export interface GeneratedQrResult {
  rawToken: string;
  qrToken: TableQrToken;
}

/**
 * Creates a new active QR token for a table.
 * Atomically revokes any existing active tokens for this table first,
 * ensuring at most one valid token exists at any time.
 */
export async function createTableQrToken(
  restaurantId: string,
  tableId: string,
): Promise<GeneratedQrResult> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  const qrToken = await prisma.$transaction(async (tx) => {
    // Invalidate all existing tokens for this table
    await tx.tableQrToken.updateMany({
      where: {
        restaurantId,
        tableId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    // Create the new active token
    return tx.tableQrToken.create({
      data: {
        restaurantId,
        tableId,
        tokenHash,
        isRevoked: false,
      },
    });
  });

  return { rawToken, qrToken };
}

/**
 * Rotates an existing table QR code:
 * Revokes any previous active tokens and generates a fresh active token.
 */
export async function rotateTableQrToken(
  restaurantId: string,
  tableId: string,
): Promise<GeneratedQrResult> {
  return createTableQrToken(restaurantId, tableId);
}

/**
 * Revokes any active QR token for a table.
 */
export async function revokeTableQrToken(
  restaurantId: string,
  tableId: string,
): Promise<{ count: number }> {
  return prisma.tableQrToken.updateMany({
    where: {
      restaurantId,
      tableId,
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
    },
  });
}

export interface ResolvedQrContext {
  restaurant: Restaurant;
  table: RestaurantTable;
  qrToken: TableQrToken;
}

/**
 * Resolves a raw bearer QR token:
 * 1. Hashes the raw token with SHA-256.
 * 2. Looks up active (unrevoked) TableQrToken record.
 * 3. Validates that the associated table and restaurant are both active.
 * Returns null if token is invalid, revoked, or bound to an inactive entity.
 */
export async function resolveTableQrToken(rawToken: string): Promise<ResolvedQrContext | null> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    return null;
  }

  const tokenHash = hashToken(rawToken.trim());

  const tokenRecord = await prisma.tableQrToken.findUnique({
    where: { tokenHash },
    include: {
      restaurant: true,
      table: true,
    },
  });

  if (!tokenRecord) {
    return null;
  }

  // Token must not be revoked
  if (tokenRecord.isRevoked) {
    return null;
  }

  // Restaurant must be active
  if (!tokenRecord.restaurant.isActive) {
    return null;
  }

  // Table must not be inactive
  if (tokenRecord.table.status === 'INACTIVE') {
    return null;
  }

  return {
    restaurant: tokenRecord.restaurant,
    table: tokenRecord.table,
    qrToken: tokenRecord,
  };
}
