import { SignJWT, jwtVerify } from 'jose';

const RECEIPT_TOKEN_EXPIRATION = '30d';

function getReceiptSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production.');
    }
    return new TextEncoder().encode('receipt-scope:dev-jwt-super-secret-key-change-in-production-min-32-chars');
  }
  return new TextEncoder().encode(`receipt-scope:${secret}`);
}

export interface ReceiptTokenPayload {
  orderNumber: string;
  restaurantId: string;
  scope: 'read:receipt';
}

/**
 * Creates a narrowly scoped, tamper-proof token that grants ONLY read access
 * to a specific order receipt. Cannot be used for table sessions, ordering,
 * cancelling, or payment operations.
 */
export async function createReceiptToken(
  orderNumber: string,
  restaurantId: string,
): Promise<string> {
  const secretKey = getReceiptSecretKey();
  return new SignJWT({
    orderNumber: orderNumber.toUpperCase(),
    restaurantId,
    scope: 'read:receipt',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(RECEIPT_TOKEN_EXPIRATION)
    .sign(secretKey);
}

/**
 * Verifies a receipt token for a specific orderNumber.
 * Fails if token is expired, tampered, or for a different order/scope.
 */
export async function verifyReceiptToken(
  token: string,
  expectedOrderNumber: string,
): Promise<{ valid: boolean; restaurantId?: string }> {
  try {
    const secretKey = getReceiptSecretKey();
    const { payload } = await jwtVerify(token, secretKey);

    if (
      payload.scope !== 'read:receipt' ||
      typeof payload.orderNumber !== 'string' ||
      payload.orderNumber.toUpperCase() !== expectedOrderNumber.toUpperCase() ||
      typeof payload.restaurantId !== 'string'
    ) {
      return { valid: false };
    }

    return {
      valid: true,
      restaurantId: payload.restaurantId,
    };
  } catch {
    return { valid: false };
  }
}
