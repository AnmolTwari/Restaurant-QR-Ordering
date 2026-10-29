import crypto from 'crypto';

/**
 * Generates an opaque, human-readable, customer-safe order reference.
 * Format: ORD-YYMMDD-XXXX (e.g., ORD-261027-A8F2)
 * Does not expose internal database IDs or predictable sequential counters.
 */
export function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const datePart = `${year}${month}${day}`;

  const randomPart = crypto.randomBytes(2).toString('hex').toUpperCase();

  return `ORD-${datePart}-${randomPart}`;
}
