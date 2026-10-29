import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  createReceiptToken,
  verifyReceiptToken,
} from '@/lib/orders/receipt-token';
import {
  isRazorpayConfigured,
  getRazorpayClient,
  RazorpayConfigError,
} from '@/lib/payments/razorpay';
import {
  settleCounterPayment,
  recordOnlinePaymentVerified,
  recordOnlinePaymentFailed,
  SettlementError,
} from '@/lib/payments/settlement';
import { signAuthToken } from '@/lib/auth/jwt';
import { OrderStatus, PaymentStatus, UserRole } from '@/types';

describe('Phase 6: Staging Readiness — Scoped Tokens, Concurrency OCC & Credentials', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Scoped Receipt Tokens (Least Privilege & Tamper Resistance)', () => {
    it('creates and verifies a valid scoped receipt token', async () => {
      const orderNumber = 'ORD-2026-TEST';
      const restaurantId = 'rest_abc_123';

      const token = await createReceiptToken(orderNumber, restaurantId);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(20);

      const check = await verifyReceiptToken(token, orderNumber);
      expect(check.valid).toBe(true);
      expect(check.restaurantId).toBe(restaurantId);
    });

    it('rejects a receipt token presented for a different order number', async () => {
      const orderNumber = 'ORD-2026-TEST';
      const restaurantId = 'rest_abc_123';

      const token = await createReceiptToken(orderNumber, restaurantId);

      // Attempt to access a different order using this token
      const check = await verifyReceiptToken(token, 'ORD-DIFFERENT-ORDER');
      expect(check.valid).toBe(false);
    });

    it('rejects tampered receipt tokens', async () => {
      const orderNumber = 'ORD-2026-TEST';
      const restaurantId = 'rest_abc_123';

      const token = await createReceiptToken(orderNumber, restaurantId);
      const tampered = token.slice(0, -6) + 'xxxxxx';

      const check = await verifyReceiptToken(tampered, orderNumber);
      expect(check.valid).toBe(false);
    });
  });

  describe('2. Gateway Placeholder Credential Rejection', () => {
    it('identifies placeholder credentials and refuses to treat them as active', () => {
      const originalKeyId = process.env.RAZORPAY_KEY_ID;
      const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;

      try {
        process.env.RAZORPAY_KEY_ID = 'rzp_test_placeholder_key_id';
        process.env.RAZORPAY_KEY_SECRET = 'placeholder_secret';

        expect(isRazorpayConfigured()).toBe(false);
        expect(() => getRazorpayClient()).toThrow(RazorpayConfigError);
      } finally {
        process.env.RAZORPAY_KEY_ID = originalKeyId;
        process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
      }
    });

    it('accepts legitimate non-placeholder credentials', () => {
      const originalKeyId = process.env.RAZORPAY_KEY_ID;
      const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;

      try {
        process.env.RAZORPAY_KEY_ID = 'rzp_test_validkey123456';
        process.env.RAZORPAY_KEY_SECRET = 'validsecret987654321';

        expect(isRazorpayConfigured()).toBe(true);
      } finally {
        process.env.RAZORPAY_KEY_ID = originalKeyId;
        process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
      }
    });
  });

  describe('3. Database Optimistic Concurrency Control (OCC)', () => {
    it('detects concurrent payment settlement collision and rejects duplicate settlement', async () => {
      const mockOrder = {
        id: 'ord_occ_test',
        restaurantId: 'rest_occ',
        orderNumber: 'ORD-OCC-01',
        total: 25000,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        restaurant: { id: 'rest_occ', currency: 'INR' },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrder),
            // updateMany returns count: 0 (simulating another transaction committed PAID in the interim)
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          payment: {
            create: vi.fn().mockResolvedValue({ id: 'pay_test' }),
          },
          paymentEvent: {
            create: vi.fn().mockResolvedValue({ id: 'evt_test' }),
          },
        };
        return cb(tx);
      });

      await expect(
        settleCounterPayment({
          restaurantId: 'rest_occ',
          orderId: 'ord_occ_test',
          amount: 25000,
          userId: 'user_cashier',
          userFullName: 'Cashier OCC',
          userRole: UserRole.CASHIER,
        }),
      ).rejects.toThrow('was marked as PAID in a concurrent transaction');
    });

    it('safely handles concurrent online payment verification collision without corrupting payment state', async () => {
      const mockOrder = {
        id: 'ord_occ_online',
        restaurantId: 'rest_occ',
        orderNumber: 'ORD-OCC-02',
        total: 30000,
        paymentStatus: PaymentStatus.UNPAID,
        restaurant: { id: 'rest_occ', currency: 'INR' },
      };

      const mockPaidOrder = {
        ...mockOrder,
        paymentStatus: PaymentStatus.PAID,
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrder),
            // updateMany returns count: 0 because another process just marked it PAID
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            findUniqueOrThrow: vi.fn().mockResolvedValue(mockPaidOrder),
          },
          payment: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 'pay_online_occ' }),
          },
          paymentEvent: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 'evt_online_occ' }),
          },
        };
        return cb(tx);
      });

      const result = await recordOnlinePaymentVerified({
        orderId: 'ord_occ_online',
        gatewayOrderId: 'order_occ_gw',
        gatewayTransactionId: 'pay_occ_gw',
      });

      expect(result.isAlreadyPaid).toBe(true);
      expect(result.order.paymentStatus).toBe(PaymentStatus.PAID);
    });
  });

  describe('4. Production Secrets & Gateway Webhook Integrity', () => {
    it('refuses to use a fallback secret in production mode for auth tokens and receipt tokens', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('JWT_SECRET', '');

      try {
        await expect(
          signAuthToken({ userId: 'u_123', email: 'test@example.com' }),
        ).rejects.toThrow('JWT_SECRET environment variable is required in production');

        await expect(
          createReceiptToken('ORD-PROD-TEST', 'rest_prod_123'),
        ).rejects.toThrow('JWT_SECRET environment variable is required in production');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('protects against out-of-order delayed failed webhooks overwriting an already PAID order', async () => {
      const mockPaidOrder = {
        id: 'ord_paid_safeguard',
        orderNumber: 'ORD-PAID-01',
        total: 15000,
        paymentStatus: PaymentStatus.PAID,
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockPaidOrder),
          },
        };
        return cb(tx);
      });

      const result = await recordOnlinePaymentFailed({
        orderId: 'ord_paid_safeguard',
        gatewayOrderId: 'order_gw_late',
        gatewayTransactionId: 'pay_gw_late_failed',
        reason: 'Payment failed late notification',
      });

      expect(result.ignored).toBe(true);
      expect(result.reason).toContain('already marked as PAID');
    });
  });
});

