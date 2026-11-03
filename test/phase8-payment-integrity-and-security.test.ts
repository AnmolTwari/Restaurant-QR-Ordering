import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { POST as handleRazorpayWebhook } from '@/app/api/v1/webhooks/razorpay/route';
import { POST as handleVerifyPayment } from '@/app/api/v1/public/orders/[orderNumber]/verify-payment/route';
import { GET as handleTrackOrder } from '@/app/api/v1/public/orders/[orderNumber]/route';
import { POST as handlePayOrder } from '@/app/api/v1/public/orders/[orderNumber]/pay/route';
import { POST as handleCancelOrder } from '@/app/api/v1/public/orders/[orderNumber]/cancel/route';
import { POST as handleLogout } from '@/app/api/v1/auth/logout/route';
import { recordOnlinePaymentVerified } from '@/lib/payments/online-settlement';
import * as razorpayModule from '@/lib/payments/razorpay';
import * as sessionModule from '@/lib/qr/session';
import * as authSessionModule from '@/lib/auth/session';
import { checkInMemoryRateLimit, getClientIp } from '@/lib/rate-limit';
import * as jwtModule from '@/lib/auth/jwt';
import { signAuthToken, verifyAuthToken } from '@/lib/auth/jwt';
import { getCurrentUser } from '@/lib/auth/session';
import { PaymentStatus, PaymentMethod, OrderStatus, OrderItemStatus } from '@/types';

describe('Phase 8: Payment Integrity, Concurrency & Security Hardening', () => {
  const webhookSecret = 'test_phase8_webhook_secret_key';

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    delete process.env.TRUST_PROXY;
    delete process.env.VERCEL;
  });

  describe('1. Razorpay Webhook Reliability & Idempotency', () => {
    function createSignedWebhookRequest(payload: object, signature?: string, eventId?: string) {
      const rawBody = JSON.stringify(payload);
      const validSig =
        signature ??
        crypto
          .createHmac('sha256', webhookSecret)
          .update(rawBody)
          .digest('hex');

      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-razorpay-signature': validSig,
      };
      if (eventId) {
        headers['x-razorpay-event-id'] = eventId;
      }

      return new NextRequest('http://localhost:3000/api/v1/webhooks/razorpay', {
        method: 'POST',
        headers,
        body: rawBody,
      });
    }

    it('rejects webhooks with missing or invalid signature', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/razorpay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'payment.captured' }),
      });
      const res = await handleRazorpayWebhook(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error.code).toBe('MISSING_SIGNATURE');
    });

    it('rejects forged webhook signatures', async () => {
      const req = createSignedWebhookRequest(
        { event: 'payment.captured' },
        'forged_invalid_signature_hex_00000000000000000000000000000000000000000000',
      );
      const res = await handleRazorpayWebhook(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    });

    it('processes duplicate webhook deliveries idempotently without re-executing state changes', async () => {
      const payload = {
        event: 'payment.captured',
        id: 'evt_test_dup_001',
        payload: {
          payment: {
            entity: {
              id: 'pay_dup_123',
              order_id: 'order_dup_456',
              amount: 50000,
              currency: 'INR',
              notes: { orderNumber: 'ORD-DUP-01' },
            },
          },
        },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          paymentEvent: {
            findUnique: vi.fn().mockResolvedValue({ id: 'pe_existing', eventId: 'evt_test_dup_001' }),
          },
        };
        return cb(tx);
      });

      const req = createSignedWebhookRequest(payload, undefined, 'evt_test_dup_001');
      const res = await handleRazorpayWebhook(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.duplicate).toBe(true);
      expect(data.message).toContain('already processed');
    });

    it('handles refund.created without marking payment or order as REFUNDED', async () => {
      const payload = {
        event: 'refund.created',
        id: 'evt_ref_created_001',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_001',
              payment_id: 'pay_original_123',
              amount: 15000,
              currency: 'INR',
            },
          },
        },
      };

      let paymentUpdatedStatus: string | null = null;
      let orderUpdatedStatus: string | null = null;

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          paymentEvent: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 'pe_ref_1' }),
          },
          order: {
            findFirst: vi.fn().mockResolvedValue({ id: 'order_ref_1' }),
            update: vi.fn().mockImplementation((args: any) => {
              orderUpdatedStatus = args.data.paymentStatus;
              return args.data;
            }),
          },
          payment: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'pay_1',
              orderId: 'order_ref_1',
              amount: 50000,
              status: PaymentStatus.PAID,
            }),
            update: vi.fn().mockImplementation((args: any) => {
              paymentUpdatedStatus = args.data.status;
              return args.data;
            }),
          },
        };
        return cb(tx);
      });

      const req = createSignedWebhookRequest(payload, undefined, 'evt_ref_created_001');
      const res = await handleRazorpayWebhook(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // Payment/order status must NOT be modified to REFUNDED merely because refund was created
      expect(paymentUpdatedStatus).toBeUndefined();
      expect(orderUpdatedStatus).toBeNull();
    });

    it('correctly handles partial refund.processed as PARTIALLY_REFUNDED', async () => {
      const payload = {
        event: 'refund.processed',
        id: 'evt_ref_proc_partial',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_partial_1',
              payment_id: 'pay_captured_1',
              amount: 20000, // 200.00 refunded out of 500.00
              currency: 'INR',
            },
          },
        },
      };

      let recordedPaymentStatus: string | null = null;
      let recordedRefundAmount: number | null = null;

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          paymentEvent: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 'pe_ref_2' }),
          },
          order: {
            findFirst: vi.fn().mockResolvedValue({ id: 'order_1', paymentStatus: PaymentStatus.PAID }),
            update: vi.fn().mockResolvedValue({ id: 'order_1' }),
          },
          payment: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'pay_1',
              orderId: 'order_1',
              amount: 50000,
              refundAmount: 0,
              status: PaymentStatus.PAID,
            }),
            update: vi.fn().mockImplementation((args: any) => {
              recordedPaymentStatus = args.data.status;
              recordedRefundAmount = args.data.refundAmount;
              return args.data;
            }),
          },
        };
        return cb(tx);
      });

      const req = createSignedWebhookRequest(payload, undefined, 'evt_ref_proc_partial');
      const res = await handleRazorpayWebhook(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(recordedPaymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(recordedRefundAmount).toBe(20000);
    });

    it('correctly handles full refund.processed as REFUNDED', async () => {
      const payload = {
        event: 'refund.processed',
        id: 'evt_ref_proc_full',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_full_1',
              payment_id: 'pay_captured_1',
              amount: 50000, // full 500.00 refunded
              currency: 'INR',
            },
          },
        },
      };

      let recordedPaymentStatus: string | null = null;

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          paymentEvent: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 'pe_ref_3' }),
          },
          order: {
            findFirst: vi.fn().mockResolvedValue({ id: 'order_1', paymentStatus: PaymentStatus.PAID }),
            update: vi.fn().mockResolvedValue({ id: 'order_1' }),
          },
          payment: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'pay_1',
              orderId: 'order_1',
              amount: 50000,
              refundAmount: 0,
              status: PaymentStatus.PAID,
            }),
            update: vi.fn().mockImplementation((args: any) => {
              recordedPaymentStatus = args.data.status;
              return args.data;
            }),
          },
        };
        return cb(tx);
      });

      const req = createSignedWebhookRequest(payload, undefined, 'evt_ref_proc_full');
      const res = await handleRazorpayWebhook(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(recordedPaymentStatus).toBe(PaymentStatus.REFUNDED);
    });
  });

  describe('2. Payment Verification & Duplicate Transaction Isolation', () => {
    it('rejects authorized-only gateway payment as not captured', async () => {
      vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue({
        restaurantId: 'rest_p8',
        tableId: 'table_p8',
        session: { id: 'sess_p8' } as any,
      });

      vi.spyOn(razorpayModule, 'verifyPaymentSignature').mockReturnValue(true);
      vi.spyOn(razorpayModule, 'isRazorpayConfigured').mockReturnValue(true);
      vi.spyOn(razorpayModule, 'fetchGatewayPayment').mockResolvedValue({
        id: 'pay_auth_only',
        status: 'authorized', // NOT captured!
        amount: 50000,
        currency: 'INR',
      } as any);

      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue({
        id: 'order_p8_1',
        orderNumber: 'ORD-P8-1',
        restaurantId: 'rest_p8',
        tableId: 'table_p8',
        sessionId: 'sess_p8',
        total: 50000,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/v1/public/orders/ORD-P8-1/verify-payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id: 'order_rzp_1',
          razorpay_payment_id: 'pay_auth_only',
          razorpay_signature: 'sig_valid',
        }),
      });

      const res = await handleVerifyPayment(req, {
        params: Promise.resolve({ orderNumber: 'ORD-P8-1' }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe('GATEWAY_PAYMENT_NOT_CAPTURED');
      expect(data.error.message).toContain('Payment cannot be confirmed until captured');
    });

    it('rejects foreign transaction reuse across different orders', async () => {
      const mockOrder = {
        id: 'order_target',
        total: 50000,
        paymentStatus: PaymentStatus.PENDING,
        restaurant: { currency: 'INR' },
      };

      const mockForeignPayment = {
        id: 'pay_foreign_id',
        orderId: 'order_different_victim',
        gatewayTransactionId: 'pay_stolen_tx',
        status: PaymentStatus.PAID,
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrder),
          },
          payment: {
            findFirst: vi.fn().mockImplementation((args: any) => {
              if (args?.where?.orderId?.not) {
                return mockForeignPayment;
              }
              return null;
            }),
          },
        };
        return cb(tx);
      });

      await expect(
        recordOnlinePaymentVerified({
          orderId: 'order_target',
          gatewayOrderId: 'order_rzp_tgt',
          gatewayTransactionId: 'pay_stolen_tx',
        }),
      ).rejects.toThrow('This payment transaction ID has already been applied to another order.');
    });

    it('reconciles excess payment into counter refund liability when items were cancelled during checkout', async () => {
      const mockOrder = {
        id: 'order_checkout_race',
        restaurantId: 'rest_p8',
        total: 40000, // Reduced from 50000 because of kitchen cancellation
        refundAmount: 0,
        refundStatus: null,
        paymentStatus: PaymentStatus.PENDING,
        restaurant: { currency: 'INR' },
      };

      const mockPendingPayment = {
        id: 'pay_pending_checkout',
        orderId: 'order_checkout_race',
        amount: 50000, // Initiated for original 50000
        gatewayOrderId: 'order_rzp_race',
      };

      let recordedRefundAmount = 0;
      let recordedRefundStatus = '';

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrder),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: vi.fn().mockResolvedValue({
              ...mockOrder,
              paymentStatus: PaymentStatus.PAID,
              refundAmount: 10000,
              refundStatus: 'PENDING_COUNTER_REFUND',
            }),
          },
          payment: {
            findFirst: vi.fn().mockResolvedValue(mockPendingPayment),
            update: vi.fn().mockImplementation((args: any) => {
              recordedRefundAmount = args.data.refundAmount;
              recordedRefundStatus = args.data.refundStatus;
              return { ...mockPendingPayment, ...args.data };
            }),
          },
          paymentEvent: {
            upsert: vi.fn().mockResolvedValue({ id: 'pe_race' }),
          },
          orderStatusHistory: {
            create: vi.fn().mockResolvedValue({ id: 'h_race' }),
          },
        };
        return cb(tx);
      });

      const outcome = await recordOnlinePaymentVerified({
        orderId: 'order_checkout_race',
        gatewayOrderId: 'order_rzp_race',
        gatewayTransactionId: 'pay_rzp_race_tx',
        verifiedAmount: 50000, // Paid 500.00 against 400.00 order
      });

      expect(outcome.isAlreadyPaid).toBe(false);
      expect(outcome.order.paymentStatus).toBe(PaymentStatus.PAID);
      // 100.00 difference tracked as pending counter refund
      expect(recordedRefundAmount).toBe(10000);
      expect(recordedRefundStatus).toBe('PENDING_COUNTER_REFUND');
    });
  });

  describe('3. Exact Table-Session Validation', () => {
    const activeSession = {
      restaurantId: 'rest_bistro',
      tableId: 'table_1',
      session: {
        id: 'session_alice_uuid',
        restaurantId: 'rest_bistro',
        tableId: 'table_1',
      } as any,
    };

    it('rejects order tracking from a different session at the same table (returns 404)', async () => {
      vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue(activeSession);

      // Order belongs to table_1, but sessionId was Bob's session!
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/v1/public/orders/ORD-BOB-99', {
        headers: { 'x-session-token': 'sess_token_alice' },
      });

      const res = await handleTrackOrder(req, {
        params: Promise.resolve({ orderNumber: 'ORD-BOB-99' }),
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('rejects order payment initiation from a different session at the same table', async () => {
      vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue(activeSession);
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/v1/public/orders/ORD-BOB-99/pay', {
        method: 'POST',
        headers: { 'x-session-token': 'sess_token_alice' },
      });

      const res = await handlePayOrder(req, {
        params: Promise.resolve({ orderNumber: 'ORD-BOB-99' }),
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('rejects customer order cancellation from a different session at the same table', async () => {
      vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue(activeSession);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return cb(tx);
      });

      const req = new NextRequest('http://localhost:3000/api/v1/public/orders/ORD-BOB-99/cancel', {
        method: 'POST',
        headers: { 'x-session-token': 'sess_token_alice' },
      });

      const res = await handleCancelOrder(req, {
        params: Promise.resolve({ orderNumber: 'ORD-BOB-99' }),
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('4. Rate Limiting & Trusted Proxy IP Handling', () => {
    it('enforces in-memory rate limit and returns 429 when threshold exceeded', () => {
      const key = `test-rl-${Date.now()}`;
      const options = { limit: 3, windowMs: 60000 };

      expect(checkInMemoryRateLimit(key, options).success).toBe(true);
      expect(checkInMemoryRateLimit(key, options).success).toBe(true);
      expect(checkInMemoryRateLimit(key, options).success).toBe(true);

      const blocked = checkInMemoryRateLimit(key, options);
      expect(blocked.success).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.resetMs).toBeGreaterThan(0);
    });

    it('does not trust spoofed X-Forwarded-For when TRUST_PROXY is disabled', () => {
      process.env.TRUST_PROXY = 'false';
      const req = new Request('http://localhost:3000', {
        headers: { 'x-forwarded-for': '203.0.113.195, 198.51.100.1' },
      });
      const clientIp = getClientIp(req);
      expect(clientIp).toBe('127.0.0.1');
    });

    it('extracts trusted client IP when TRUST_PROXY is enabled', () => {
      process.env.TRUST_PROXY = 'true';
      const req = new Request('http://localhost:3000', {
        headers: {
          'cf-connecting-ip': '198.51.100.42',
          'x-forwarded-for': '203.0.113.195',
        },
      });
      const clientIp = getClientIp(req);
      expect(clientIp).toBe('198.51.100.42');
    });
  });

  describe('5. Authentication Token Revocation', () => {
    it('invalidates tokens when user tokenVersion is bumped', async () => {
      const mockUser = {
        id: 'usr_revocation_test',
        email: 'alice@bistro.com',
        fullName: 'Alice Manager',
        phone: null,
        isActive: true,
        tokenVersion: 2, // Database is now on version 2
        createdAt: new Date(),
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);

      // Sign token with old version 1
      const oldToken = await signAuthToken({
        userId: mockUser.id,
        email: mockUser.email,
        tokenVersion: 1, // Stolen or pre-logout token!
      });

      // Verify token helper decodes tokenVersion
      const payload = await verifyAuthToken(oldToken);
      expect(payload?.tokenVersion).toBe(1);

      // Mock cookie return
      vi.spyOn(jwtModule, 'getAuthTokenFromCookies').mockResolvedValue(oldToken);

      // Verify getCurrentUser rejects token with outdated tokenVersion
      const currentUser = await getCurrentUser();
      expect(currentUser).toBeNull();
    });

    it('logout bumps user tokenVersion in database', async () => {
      const mockUser = {
        id: 'usr_logout_test',
        email: 'logout@bistro.com',
        fullName: 'Logout User',
        phone: null,
        isActive: true,
        tokenVersion: 1,
        createdAt: new Date(),
      };

      vi.spyOn(authSessionModule, 'getCurrentUser').mockResolvedValue(mockUser);
      const userUpdateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any);

      const res = await handleLogout();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(userUpdateSpy).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  });
});
