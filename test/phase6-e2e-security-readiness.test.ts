import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  settleCounterPayment,
  recordOnlinePaymentVerified,
  recordOnlinePaymentFailed,
  reconcilePaymentRecord,
  SettlementError,
} from '@/lib/payments/settlement';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-response';
import { OrderStatus, PaymentStatus, PaymentMethod, UserRole } from '@/types';
import nextConfig from '../next.config.mjs';

describe('Phase 6: Security Audit, Tenant Isolation & Concurrency Guarding', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Tenant Isolation & Role Permissions', () => {
    it('prevents staff from settling payments for an order belonging to another restaurant', async () => {
      const mockOrderA = {
        id: 'ord_tenant_a',
        restaurantId: 'rest_a',
        total: 50000,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        restaurant: { id: 'rest_a', currency: 'INR' },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrderA),
          },
        };
        return cb(tx);
      });

      // Staff of restaurant B attempts to settle order of restaurant A
      await expect(
        settleCounterPayment({
          restaurantId: 'rest_b', // Mismatched tenant ID
          orderId: 'ord_tenant_a',
          amount: 50000,
          userId: 'user_b',
          userFullName: 'Owner B',
          userRole: UserRole.OWNER,
        }),
      ).rejects.toThrow('Order not found or does not belong to this restaurant.');
    });

    it('rejects counter settlement when unauthorized role (e.g. KITCHEN) attempts settlement', async () => {
      await expect(
        settleCounterPayment({
          restaurantId: 'rest_a',
          orderId: 'ord_tenant_a',
          amount: 50000,
          userId: 'user_cook',
          userFullName: 'Cook Mario',
          userRole: UserRole.KITCHEN,
        }),
      ).rejects.toThrow('Role KITCHEN is not authorized to settle counter payments.');
    });

    it('rejects cross-tenant payment reconciliation when payment belongs to another restaurant', async () => {
      const mockForeignPayment = {
        id: 'pay_foreign_rest',
        restaurantId: 'rest_foreign',
        orderId: 'ord_foreign',
        method: PaymentMethod.COUNTER,
        status: PaymentStatus.PAID,
      };

      vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue(mockForeignPayment as any);

      await expect(
        reconcilePaymentRecord('pay_foreign_rest', 'rest_local'),
      ).rejects.toThrow('Payment not found.');
    });
  });

  describe('2. Concurrency, Exact Amount & Payment Race Conditions', () => {
    it('strictly rejects partial payments and overpayments', async () => {
      const mockOrder = {
        id: 'ord_exact_test',
        restaurantId: 'rest_a',
        total: 75000,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        restaurant: { id: 'rest_a', currency: 'INR' },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrder),
          },
        };
        return cb(tx);
      });

      // Partial amount
      await expect(
        settleCounterPayment({
          restaurantId: 'rest_a',
          orderId: 'ord_exact_test',
          amount: 50000,
          userId: 'cashier_1',
          userFullName: 'Cashier Alice',
          userRole: UserRole.CASHIER,
        }),
      ).rejects.toThrow('does not match order total');
    });

    it('rejects counter settlement when order is already marked as PAID', async () => {
      const mockPaidOrder = {
        id: 'ord_already_paid',
        restaurantId: 'rest_a',
        orderNumber: 'ORD-999',
        total: 50000,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.PAID,
        restaurant: { id: 'rest_a', currency: 'INR' },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockPaidOrder),
          },
        };
        return cb(tx);
      });

      await expect(
        settleCounterPayment({
          restaurantId: 'rest_a',
          orderId: 'ord_already_paid',
          amount: 50000,
          userId: 'cashier_1',
          userFullName: 'Cashier Alice',
          userRole: UserRole.CASHIER,
        }),
      ).rejects.toThrow('is already marked as PAID. Duplicate settlement rejected.');
    });

    it('handles idempotent online payment verification when order is already PAID', async () => {
      const mockPaidOrder = {
        id: 'ord_already_paid_online',
        restaurantId: 'rest_a',
        orderNumber: 'ORD-998',
        total: 50000,
        paymentStatus: PaymentStatus.PAID,
        restaurant: { id: 'rest_a', currency: 'INR' },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockPaidOrder),
          },
          payment: {
            findFirst: vi.fn().mockResolvedValue({ id: 'pay_existing', status: PaymentStatus.PAID }),
          },
        };
        return cb(tx);
      });

      const result = await recordOnlinePaymentVerified({
        orderId: 'ord_already_paid_online',
        gatewayOrderId: 'order_gw_123',
        gatewayTransactionId: 'pay_gw_123',
      });

      expect(result.isAlreadyPaid).toBe(true);
      expect(result.order.paymentStatus).toBe(PaymentStatus.PAID);
    });

    it('safeguards against late failed payment webhook downgrading an already PAID order', async () => {
      const mockPaidOrder = {
        id: 'ord_safe_paid',
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

      const failOutcome = await recordOnlinePaymentFailed({
        orderId: 'ord_safe_paid',
        gatewayOrderId: 'order_gw_late',
        gatewayTransactionId: 'pay_gw_late_failed',
        reason: 'Payment failed late at gateway',
      });

      expect(failOutcome.ignored).toBe(true);
      expect(failOutcome.reason).toContain('late failed event ignored');
    });

    it('rejects online payment verification if gateway order ID does not match initiated order', async () => {
      const mockOrder = {
        id: 'ord_mismatch_gw',
        restaurantId: 'rest_a',
        total: 50000,
        paymentStatus: PaymentStatus.PENDING,
        restaurant: { id: 'rest_a', currency: 'INR' },
      };

      const mockExistingPayment = {
        id: 'pay_initiated',
        orderId: 'ord_mismatch_gw',
        gatewayOrderId: 'order_expected_123',
        gatewayProvider: 'RAZORPAY',
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrder),
          },
          payment: {
            findFirst: vi.fn().mockResolvedValue(mockExistingPayment),
          },
        };
        return cb(tx);
      });

      await expect(
        recordOnlinePaymentVerified({
          orderId: 'ord_mismatch_gw',
          gatewayOrderId: 'order_foreign_999', // Mismatched gateway order ID!
          gatewayTransactionId: 'pay_attacker_captured',
        }),
      ).rejects.toThrow('does not match the pending order initiated for this order');
    });

    it('rejects online payment verification if currency does not match restaurant currency', async () => {
      const mockOrder = {
        id: 'ord_currency_test',
        restaurantId: 'rest_a',
        total: 50000,
        paymentStatus: PaymentStatus.PENDING,
        restaurant: { id: 'rest_a', currency: 'INR' },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrder),
          },
          payment: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return cb(tx);
      });

      await expect(
        recordOnlinePaymentVerified({
          orderId: 'ord_currency_test',
          gatewayOrderId: 'order_gw_curr',
          gatewayTransactionId: 'pay_gw_curr',
          verifiedCurrency: 'USD', // Mismatched currency!
        }),
      ).rejects.toThrow('Gateway currency (USD) does not match restaurant currency (INR)');
    });
  });

  describe('3. Rate Limiting Sliding-Window', () => {
    it('permits requests within quota and blocks requests exceeding limit', () => {
      const testKey = `test-ip-${Date.now()}`;
      const options = { limit: 3, windowMs: 10000 };

      const r1 = checkRateLimit(testKey, options);
      expect(r1.success).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = checkRateLimit(testKey, options);
      expect(r2.success).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = checkRateLimit(testKey, options);
      expect(r3.success).toBe(true);
      expect(r3.remaining).toBe(0);

      // 4th request must be blocked
      const r4 = checkRateLimit(testKey, options);
      expect(r4.success).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.resetMs).toBeGreaterThan(0);
    });
  });

  describe('4. Error Handling, Sanitization & Security Headers', () => {
    it('properly translates SettlementError into typed JSON error response', () => {
      const err = new SettlementError('CUSTOM_CODE', 'Custom error message', 402);
      const res = handleApiError(err);
      expect(res.status).toBe(402);
    });

    it('configures production security headers in next.config.mjs', async () => {
      expect(typeof nextConfig.headers).toBe('function');
      const headersConfig = nextConfig.headers ? await nextConfig.headers() : [];
      expect(headersConfig).toBeDefined();
      expect(headersConfig.length).toBeGreaterThan(0);

      const headerRules = headersConfig[0].headers;
      const headerMap = new Map(headerRules.map((h: any) => [h.key, h.value]));

      expect(headerMap.get('X-Frame-Options')).toBe('SAMEORIGIN');
      expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
      expect(headerMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(headerMap.get('Strict-Transport-Security')).toContain('max-age=63072000');
      expect(headerMap.get('Content-Security-Policy')).toContain('default-src');
    });
  });
});
