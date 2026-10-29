import crypto from 'crypto';
import Razorpay from 'razorpay';

export class RazorpayConfigError extends Error {
  code = 'GATEWAY_CONFIG_MISSING';
  constructor(message = 'Razorpay credentials not configured in environment.') {
    super(message);
    this.name = 'RazorpayConfigError';
  }
}

/**
 * Checks whether Razorpay credentials are real and configured (not missing or placeholders)
 */
export function isRazorpayConfigured(): boolean {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) return false;
  if (
    key_id.toLowerCase().includes('placeholder') ||
    key_secret.toLowerCase().includes('placeholder')
  ) {
    return false;
  }
  return true;
}

/**
 * Get or initialize Razorpay SDK client with environment credentials
 */
export function getRazorpayClient(): Razorpay {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (
    !key_id ||
    !key_secret ||
    key_id.toLowerCase().includes('placeholder') ||
    key_secret.toLowerCase().includes('placeholder')
  ) {
    throw new RazorpayConfigError(
      'Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are missing, undefined, or set to placeholder values in environment.',
    );
  }

  if (process.env.NODE_ENV === 'production' && key_id.startsWith('rzp_test_')) {
    console.warn(
      '[SECURITY WARNING] Running with Razorpay TEST credentials in production environment.',
    );
  }

  return new Razorpay({
    key_id,
    key_secret,
  });
}

export interface CreateGatewayOrderParams {
  amount: number; // in minor units (e.g. paise)
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface GatewayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

/**
 * Creates a server-side payment order on Razorpay
 */
export async function createGatewayOrder(
  params: CreateGatewayOrderParams,
): Promise<GatewayOrderResult> {
  if (!params.amount || params.amount <= 0 || !Number.isInteger(params.amount)) {
    throw new Error('Amount must be a positive integer in minor units (paise).');
  }

  const client = getRazorpayClient();
  const order = await client.orders.create({
    amount: params.amount,
    currency: params.currency || 'INR',
    receipt: params.receipt,
    notes: params.notes,
  });

  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    receipt: order.receipt || params.receipt,
    status: order.status,
  };
}

/**
 * Verifies Razorpay checkout callback HMAC-SHA256 signature
 * Format: HMAC_SHA256(order_id + "|" + payment_id, secret)
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret?: string;
}): boolean {
  const secret = params.secret || process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !params.orderId || !params.paymentId || !params.signature) {
    return false;
  }

  const payload = `${params.orderId}|${params.paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  if (expectedSignature.length !== params.signature.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf-8'),
      Buffer.from(params.signature, 'utf-8'),
    );
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay Webhook signature against raw request body
 * Format: HMAC_SHA256(rawBody, webhookSecret)
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  signature: string;
  secret?: string;
}): boolean {
  const secret = params.secret || process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !params.rawBody || !params.signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(params.rawBody)
    .digest('hex');

  if (expectedSignature.length !== params.signature.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf-8'),
      Buffer.from(params.signature, 'utf-8'),
    );
  } catch {
    return false;
  }
}

/**
 * Fetches verified payment information directly from Razorpay
 */
export async function fetchGatewayPayment(paymentId: string) {
  const client = getRazorpayClient();
  const payment = await client.payments.fetch(paymentId);
  return payment;
}

/**
 * Performs a verified refund operation on Razorpay
 */
export async function refundGatewayPayment(paymentId: string, amount?: number) {
  const client = getRazorpayClient();
  const refundOptions: { amount?: number } = {};
  if (amount !== undefined) {
    refundOptions.amount = amount;
  }
  const refund = await client.payments.refund(paymentId, refundOptions);
  return refund;
}
