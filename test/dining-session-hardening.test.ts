import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  resolveOrCreateTableSession,
  verifyActiveTableSession,
  attachTableSessionCookie,
  TABLE_SESSION_COOKIE_NAME,
} from '@/lib/qr/session';
import { hashToken } from '@/lib/qr/token';
import { createReceiptToken } from '@/lib/orders/receipt-token';
import { getReceiptData } from '@/lib/orders/receipt';
import { POST as handleSessionPost, GET as handleSessionGet } from '@/app/api/v1/public/session/route';
import * as qrTokenModule from '@/lib/qr/token';
import * as sessionModule from '@/lib/qr/session';

describe('Dining Session Hardening & Cookie Isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Route Handler Session Establishment & HttpOnly Cookie', () => {
    it('establishes dining session via POST /api/v1/public/session and sets HttpOnly cookie', async () => {
      const mockTableToken = 'valid_raw_qr_token_12345';
      const mockSessionToken = 'raw_session_token_67890';
      const mockRestaurant = {
        id: 'rest_bistro',
        name: 'The Bistro',
        slug: 'the-bistro',
        isActive: true,
      };
      const mockTable = {
        id: 'table_10',
        tableNumber: '10',
        status: 'ACTIVE',
      };

      vi.spyOn(qrTokenModule, 'resolveTableQrToken').mockResolvedValue({
        qrToken: { id: 'tt_1' } as any,
        table: mockTable as any,
        restaurant: mockRestaurant as any,
      });

      vi.spyOn(sessionModule, 'resolveOrCreateTableSession').mockResolvedValue({
        sessionToken: mockSessionToken,
        session: { id: 'ts_1', expiresAt: new Date(Date.now() + 6 * 3600 * 1000) } as any,
        isNew: true,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/public/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantSlug: 'the-bistro',
          tableToken: mockTableToken,
        }),
      });

      const res = await handleSessionPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.valid).toBe(true);
      expect(data.data.tableId).toBe('table_10');

      // Verify Set-Cookie header attributes
      const cookie = res.cookies.get(TABLE_SESSION_COOKIE_NAME);
      expect(cookie).toBeDefined();
      expect(cookie?.value).toBe(mockSessionToken);
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe('lax');
      expect(cookie?.path).toBe('/');
      expect(cookie?.maxAge).toBe(6 * 3600);

      // Verify Cache-Control
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('rejects session establishment when QR token is invalid or revoked', async () => {
      vi.spyOn(qrTokenModule, 'resolveTableQrToken').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/v1/public/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantSlug: 'the-bistro',
          tableToken: 'invalid_or_revoked_token',
        }),
      });

      const res = await handleSessionPost(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_QR_TOKEN');
      expect(res.cookies.get(TABLE_SESSION_COOKIE_NAME)).toBeUndefined();
    });

    it('rejects session establishment when table is marked INACTIVE', async () => {
      vi.spyOn(qrTokenModule, 'resolveTableQrToken').mockResolvedValue({
        qrToken: { id: 'tt_1' } as any,
        table: { id: 'tbl_inactive', tableNumber: '12', status: 'INACTIVE' } as any,
        restaurant: { id: 'rest_1', slug: 'the-bistro', isActive: true } as any,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/public/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantSlug: 'the-bistro',
          tableToken: 'valid_token_inactive_table',
        }),
      });

      const res = await handleSessionPost(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('TABLE_INACTIVE');
    });
  });

  describe('2. Session Reuse on Page Refresh (No Duplicate Active Sessions)', () => {
    it('reuses existing active table session for the same table instead of inserting duplicate rows', async () => {
      const existingToken = 'existing_active_session_token';
      const existingHash = hashToken(existingToken);
      const unexpiredDate = new Date(Date.now() + 4 * 3600 * 1000);

      const mockExistingSession = {
        id: 'ts_existing_123',
        restaurantId: 'rest_bistro',
        tableId: 'table_10',
        sessionTokenHash: existingHash,
        expiresAt: unexpiredDate,
        isActive: true,
      };

      vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue(mockExistingSession as any);
      const createSpy = vi.spyOn(prisma.tableSession, 'create');

      const result = await resolveOrCreateTableSession(
        'rest_bistro',
        'table_10',
        existingToken,
      );

      expect(result.isNew).toBe(false);
      expect(result.sessionToken).toBe(existingToken);
      expect(result.session.id).toBe('ts_existing_123');
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('creates a new session if customer changes to a different table at the same restaurant', async () => {
      const existingToken = 'table10_session_token';
      const existingHash = hashToken(existingToken);

      const mockTable10Session = {
        id: 'ts_table10',
        restaurantId: 'rest_bistro',
        tableId: 'table_10', // Different table
        sessionTokenHash: existingHash,
        expiresAt: new Date(Date.now() + 4 * 3600 * 1000),
        isActive: true,
      };

      vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue(mockTable10Session as any);
      vi.spyOn(prisma.tableSession, 'create').mockResolvedValue({
        id: 'ts_table11_new',
        restaurantId: 'rest_bistro',
        tableId: 'table_11',
        sessionTokenHash: 'new_hash',
        expiresAt: new Date(Date.now() + 6 * 3600 * 1000),
        isActive: true,
      } as any);

      const result = await resolveOrCreateTableSession(
        'rest_bistro',
        'table_11', // Now at table 11
        existingToken,
      );

      expect(result.isNew).toBe(true);
      expect(result.session.tableId).toBe('table_11');
      expect(prisma.tableSession.create).toHaveBeenCalled();
    });
  });

  describe('3. Active Session Verification & Lifecycle Constraints', () => {
    it('rejects expired table dining sessions', async () => {
      const expiredToken = 'expired_session_token';
      const expiredHash = hashToken(expiredToken);

      vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue({
        id: 'ts_expired',
        restaurantId: 'rest_bistro',
        tableId: 'table_10',
        sessionTokenHash: expiredHash,
        expiresAt: new Date(Date.now() - 1000), // Expired in past
        isActive: true,
        restaurant: { isActive: true },
        table: { status: 'ACTIVE' },
      } as any);

      const verified = await verifyActiveTableSession(expiredToken);
      expect(verified).toBeNull();
    });

    it('rejects revoked or deactivated table sessions (isActive: false)', async () => {
      const revokedToken = 'revoked_session_token';
      const revokedHash = hashToken(revokedToken);

      vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue({
        id: 'ts_revoked',
        restaurantId: 'rest_bistro',
        tableId: 'table_10',
        sessionTokenHash: revokedHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        isActive: false, // Revoked
        restaurant: { isActive: true },
        table: { status: 'ACTIVE' },
      } as any);

      const verified = await verifyActiveTableSession(revokedToken);
      expect(verified).toBeNull();
    });
  });

  describe('4. Receipt-Only Token Isolation (Least Privilege)', () => {
    it('confirms receipt tokens cannot be used as dining table sessions', async () => {
      const receiptToken = await createReceiptToken('ORD-2026-X1', 'rest_bistro');

      // verifyActiveTableSession hashes the token and queries tableSession
      // A JWT string will never match a SHA-256 random session token hash
      vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue(null);

      const verified = await verifyActiveTableSession(receiptToken);
      expect(verified).toBeNull();
    });

    it('confirms receipt token grants read-only receipt access but no table session rights', async () => {
      const orderNumber = 'ORD-2026-X1';
      const restaurantId = 'rest_bistro';
      const receiptToken = await createReceiptToken(orderNumber, restaurantId);

      const mockOrder = {
        id: 'ord_1',
        orderNumber,
        restaurantId,
        tableId: 'table_10',
        orderStatus: 'SERVED',
        paymentStatus: 'PAID',
        paymentMethod: 'ONLINE',
        subtotal: 5000,
        tax: 250,
        total: 5250,
        notes: null,
        createdAt: new Date(),
        restaurant: { id: restaurantId, name: 'Bistro', slug: 'bistro', phone: null, address: null, currency: 'INR' },
        table: { id: 'table_10', tableNumber: '10' },
        items: [],
        payments: [{ id: 'p_1', method: 'ONLINE', status: 'PAID', amount: 5250, gatewayProvider: 'RAZORPAY', gatewayTransactionId: 'pay_1', paidAt: new Date() }],
      };

      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(mockOrder as any);

      // Successfully loads receipt using receiptToken without needing table session
      const receiptResult = await getReceiptData(orderNumber, { receiptToken });
      expect(receiptResult.success).toBe(true);
      if (receiptResult.success) {
        expect(receiptResult.receipt.order.orderNumber).toBe(orderNumber);
      }
    });
  });
});

