/**
 * Validates 15-character Indian Goods and Services Tax Identification Number (GSTIN).
 * Format: 2 digits (state) + 10 alphanumeric (PAN) + 1 entity + 1 Z + 1 check digit.
 */
export function validateGstin(gstin: string | null | undefined): boolean {
  if (!gstin) return true; // Optional field
  const trimmed = gstin.trim().toUpperCase();
  if (trimmed.length === 0) return true;
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstinRegex.test(trimmed);
}

/**
 * Normalizes phone numbers for WhatsApp click-to-chat.
 * Strips non-digits; defaults 10-digit Indian numbers with '91' country code.
 */
export function normalizePhoneNumber(
  phone: string | null | undefined,
  defaultCountryCode = '91',
): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  if (digits.length > 10 && digits.startsWith('0')) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }
  return digits;
}

/**
 * Constructs a secure WhatsApp click-to-chat URL with prefilled customer receipt message.
 */
export function buildWhatsAppShareUrl(params: {
  phone?: string | null;
  restaurantName: string;
  orderNumber: string;
  invoiceNumber?: string | null;
  totalFormatted: string;
  billUrl: string;
}): string {
  const normalizedPhone = normalizePhoneNumber(params.phone);
  const invoicePart = params.invoiceNumber ? `\nInvoice: ${params.invoiceNumber}` : '';

  const message = [
    `Hello! Thank you for dining with us at ${params.restaurantName}.`,
    '',
    `Your bill for order #${params.orderNumber} is ready.${invoicePart}`,
    `Total: ${params.totalFormatted}`,
    '',
    'View and download your digital receipt:',
    params.billUrl,
    '',
    'Thank you for your visit!',
  ].join('\n');

  const encodedMessage = encodeURIComponent(message);
  if (normalizedPhone) {
    return `https://wa.me/${normalizedPhone}?text=${encodedMessage}`;
  }
  return `https://wa.me/?text=${encodedMessage}`;
}
