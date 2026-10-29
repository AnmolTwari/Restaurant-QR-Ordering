import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TABLE_SESSION_COOKIE_NAME } from '@/lib/qr/session';
import { createReceiptToken } from '@/lib/orders/receipt-token';
import { POST as handleCreateOrder } from '@/app/api/v1/public/orders/route';
import { GET as handleTrackOrder } from '@/app/api/v1/public/orders/[orderNumber]/route';
import { POST as handleCancelOrder } from '@/app/api/v1/public/orders/[orderNumber]/cancel/route';
import { POST as handlePayOrder } from '@/app/api/v1/public/orders/[orderNumber]/pay/route';
import * as sessionModule from '@/lib/qr/session';

describe('Public Order Authorization & Receipt Token Isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockRestaurant = {
    id: 'rest_auth_1',
    name: 'Auth Bistro',
    slug: 'auth-bistro',
    isActive: true,
    currency: 'INR',
  };

  const mockTable1 = {
    id: 'table_auth_1',
    tableNumber: 'T1',
    status: 'ACTIVE',
  };

  const mockTable2 = {
    id: 'table_auth_2',
    tableNumber: 'T2',
    status: 'ACTIVE',
  };

  describe('1. Order Creation Authorization & Session Validation', () => {
    it('rejects order creation when table session cookie is missing', async () => {
      vi.spyOn(prisma.restaurant, 'findUnique').mockResolvedValue(mockRestaurant as any);
      vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/v1/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantSlug: 'auth-bistro',
          idempotencyKey: 'idemp_missing_session_01',
          items: [{ menuItemId: 'd290f1ee-6c54-4b01-90e6-d701748f0851', quantity: 1 }],
        }),
      });

      const res = await handleCreateOrder(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_OR_EXPIRED_SESSION');
    });

    it('rejects order creation when a scoped receipt token is presented as session credential', async () => {
      const receiptToken = await createReceiptToken('ORD-RECEIPT-ONLY', 'rest_auth_1');

      vi.spyOn(prisma.restaurant, 'findUnique').mockResolvedValue(mockRestaurant as any);
      vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue(null);

      // A receiptToken will not resolve to a valid tableSession
      const req = new NextRequest('http://localhost:3000/api/v1/public/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': receiptToken,
        },
        body: JSON.stringify({
          restaurantSlug: 'auth-bistro',
          idempotencyKey: 'idemp_receipt_token_leak_01',
          items: [{ menuItemId: 'd290f1ee-6c54-4b01-90e6-d701748f0851', quantity: 1 }],
        }),
      });

      const res = await handleCreateOrder(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_OR_EXPIRED_SESSION');
    });

    it('rejects order creation when session belongs to a different restaurant', async () => {
      vi.spyOn(prisma.restaurant, 'findUnique').mockResolvedValue(mockRestaurant as any);
      vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue({
        session: { id: 's_other', restaurantId: 'rest_other_999' } as any,
        restaurantId: 'rest_other_999', // Mismatched restaurant
        tableId: 'table_auth_1',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantSlug: 'auth-bistro',
          idempotencyKey: 'idemp_wrong_rest_01',
          items: [{ menuItemId: 'd290f1ee-6c54-4b01-90e6-d701748f0851', quantity: 1 }],
        }),
      });

      const res = await handleCreateOrder(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_OR_EXPIRED_SESSION');
    });
  });

  describe('2. Cross-Table Isolation for Tracking, Cancellation & Payment', () => {
    const existingOrder = {
      id: 'ord_table1_order',
      orderNumber: 'ORD-TABLE1-100',
      restaurantId: 'rest_auth_1',
      tableId: 'table_auth_1', // Placed at Table 1
      orderStatus: 'PENDING',
      paymentStatus: 'UNPAID',
      subtotal: 3000,
      tax: 150,
      total: 3150,
      restaurant: mockRestaurant,
      table: mockTable1,
      items: [],
      statusHistory: [],
    };

    it('prevents customer at Table 2 from viewing/tracking orders belonging to Table 1', async () => {
      // Customer at Table 2 makes request
      vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue({
        session: { id: 's_table2' } as any,
        restaurantId: 'rest_auth_1',
        tableId: 'table_auth_2', // Customer is at Table 2
      });

      // Query scopes by restaurantId and tableId -> findFirst returns null
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/v1/public/orders/ORD-TABLE1-100');
      const res = await handleTrackOrder(req, { params: { orderNumber: 'ORD-TABLE1-100' } });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('prevents customer at Table 2 from cancelling orders belonging to Table 1', async () => {
      // Customer at Table 2 attempts cancellation
      vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue({
        session: { id: 's_table2' } as any,
        restaurantId: 'rest_auth_1',
        tableId: 'table_auth_2', // Table 2
      });

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            findFirst: vi.fn().mockResolvedValue(null), // Cannot find order for Table 2
          },
        };
        return cb(tx);
      });

      const req = new NextRequest('http://localhost:3000/api/v1/public/orders/ORD-TABLE1-100/cancel', {
        method: 'POST',
      });
      const res = await handleCancelOrder(req, { params: { orderNumber: 'ORD-TABLE1-100' } });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('prevents customer from initiating payment for an order at another table', async () => {
      vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue({
        session: { id: 's_table2' } as any,
        restaurantId: 'rest_auth_1',
        tableId: 'table_auth_2', // Table 2
      });

      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/v1/public/orders/ORD-TABLE1-100/pay', {
        method: 'POST',
      });
      const res = await handlePayOrder(req, { params: { orderNumber: 'ORD-TABLE1-100' } });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('rejects payment initiation when a receiptToken is presented instead of active table session', async () => {
      const receiptToken = await createReceiptToken('ORD-TABLE1-100', 'rest_auth_1');

      vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/v1/public/orders/ORD-TABLE1-100/pay', {
        method: 'POST',
        headers: { 'x-session-token': receiptToken },
      });
      const res = await handlePayOrder(req, { params: { orderNumber: 'ORD-TABLE1-100' } });
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED_SESSION');
    });
  });
});
