import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as sessionModule from '@/lib/qr/session';
import { GET as handleListOrders } from '@/app/api/v1/public/orders/route';
import { OrderStatus, PaymentStatus, PaymentMethod, OrderItemStatus } from '@/types';

describe('Phase 7: Customer Order Tracking Access (GET /api/v1/public/orders)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockRestaurant = {
    id: 'rest_p7_1',
    name: 'Bella Italia',
    slug: 'bella-italia',
    currency: 'INR',
    isActive: true,
  };

  const mockTable = {
    id: 'table_p7_1',
    tableNumber: '5',
    status: 'ACTIVE',
  };

  const mockSession = {
    id: 'session_p7_1',
    restaurantId: mockRestaurant.id,
    tableId: mockTable.id,
    sessionTokenHash: 'hash_p7_token',
    isActive: true,
    expiresAt: new Date(Date.now() + 6 * 3600 * 1000),
    restaurant: mockRestaurant,
    table: mockTable,
  };

  it('1. Successfully lists all orders for an authenticated active table session', async () => {
    vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue({
      session: mockSession as any,
      restaurantId: mockRestaurant.id,
      tableId: mockTable.id,
    });

    const mockOrders = [
      {
        id: 'ord_1',
        orderNumber: 'ORD-261029-AAA1',
        orderStatus: OrderStatus.PREPARING,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.ONLINE,
        subtotal: 120000,
        tax: 0,
        total: 120000,
        refundAmount: 0,
        refundStatus: null,
        notes: 'Extra spicy',
        createdAt: new Date('2026-10-29T20:00:00Z'),
        restaurant: mockRestaurant,
        table: mockTable,
        items: [
          {
            id: 'item_1',
            nameSnapshot: 'Diavola Pizza',
            priceSnapshot: 80000,
            quantity: 1,
            totalPrice: 80000,
            notes: null,
            status: OrderItemStatus.ACTIVE,
            cancelReason: null,
            cancelNote: null,
          },
          {
            id: 'item_2',
            nameSnapshot: 'Tiramisu',
            priceSnapshot: 40000,
            quantity: 1,
            totalPrice: 40000,
            notes: null,
            status: OrderItemStatus.ACTIVE,
            cancelReason: null,
            cancelNote: null,
          },
        ],
        statusHistory: [],
      },
    ];

    vi.spyOn(prisma.order, 'findMany').mockResolvedValue(mockOrders as any);

    const req = new NextRequest('http://localhost:3000/api/v1/public/orders');
    const res = await handleListOrders(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.orders).toHaveLength(1);
    expect(data.data.orders[0].orderNumber).toBe('ORD-261029-AAA1');
    expect(data.data.orders[0].items).toHaveLength(2);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('2. Supports multiple orders placed within the same table session', async () => {
    vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue({
      session: mockSession as any,
      restaurantId: mockRestaurant.id,
      tableId: mockTable.id,
    });

    const mockOrders = [
      {
        id: 'ord_2',
        orderNumber: 'ORD-261029-BBB2',
        orderStatus: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: 30000,
        tax: 0,
        total: 30000,
        refundAmount: 0,
        refundStatus: null,
        notes: 'Dessert order',
        createdAt: new Date('2026-10-29T20:30:00Z'),
        restaurant: mockRestaurant,
        table: mockTable,
        items: [],
        statusHistory: [],
      },
      {
        id: 'ord_1',
        orderNumber: 'ORD-261029-AAA1',
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.ONLINE,
        subtotal: 120000,
        tax: 0,
        total: 120000,
        refundAmount: 0,
        refundStatus: null,
        notes: 'Main course',
        createdAt: new Date('2026-10-29T20:00:00Z'),
        restaurant: mockRestaurant,
        table: mockTable,
        items: [],
        statusHistory: [],
      },
    ];

    vi.spyOn(prisma.order, 'findMany').mockResolvedValue(mockOrders as any);

    const req = new NextRequest('http://localhost:3000/api/v1/public/orders');
    const res = await handleListOrders(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.orders).toHaveLength(2);
    expect(data.data.orders[0].orderNumber).toBe('ORD-261029-BBB2');
    expect(data.data.orders[1].orderNumber).toBe('ORD-261029-AAA1');
  });

  it('3. Rejects order listing when table session is missing or unauthenticated', async () => {
    vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/v1/public/orders');
    const res = await handleListOrders(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_OR_EXPIRED_SESSION');
  });

  it('4. Rejects order listing when session belongs to a different restaurant', async () => {
    vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue({
      session: mockSession as any,
      restaurantId: 'foreign_rest_id',
      tableId: mockTable.id,
    });

    vi.spyOn(prisma.restaurant, 'findUnique').mockResolvedValue({
      id: mockRestaurant.id,
      slug: mockRestaurant.slug,
      isActive: true,
    } as any);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/public/orders?restaurantSlug=bella-italia',
    );
    const res = await handleListOrders(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_OR_EXPIRED_SESSION');
  });

  it('5. Returns cancelled item status and refund amounts correctly in order tracking', async () => {
    vi.spyOn(sessionModule, 'verifyActiveTableSession').mockResolvedValue({
      session: mockSession as any,
      restaurantId: mockRestaurant.id,
      tableId: mockTable.id,
    });

    const mockOrders = [
      {
        id: 'ord_partially_cancelled',
        orderNumber: 'ORD-261029-REF1',
        orderStatus: OrderStatus.PREPARING,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
        paymentMethod: PaymentMethod.ONLINE,
        subtotal: 60000,
        tax: 0,
        total: 60000,
        refundAmount: 40000,
        refundStatus: 'SUCCEEDED',
        notes: null,
        createdAt: new Date('2026-10-29T20:00:00Z'),
        restaurant: mockRestaurant,
        table: mockTable,
        items: [
          {
            id: 'item_active',
            nameSnapshot: 'Pasta Carbonara',
            priceSnapshot: 60000,
            quantity: 1,
            totalPrice: 60000,
            status: OrderItemStatus.ACTIVE,
            cancelReason: null,
          },
          {
            id: 'item_cancelled',
            nameSnapshot: 'Gelato Pistachio',
            priceSnapshot: 40000,
            quantity: 1,
            totalPrice: 40000,
            status: OrderItemStatus.CANCELLED,
            cancelReason: 'Ingredient out of stock',
            cancelNote: 'Pistachios sold out',
          },
        ],
        statusHistory: [],
      },
    ];

    vi.spyOn(prisma.order, 'findMany').mockResolvedValue(mockOrders as any);

    const req = new NextRequest('http://localhost:3000/api/v1/public/orders');
    const res = await handleListOrders(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    const order = data.data.orders[0];
    expect(order.paymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(order.refundAmount).toBe(40000);
    expect(order.refundStatus).toBe('SUCCEEDED');
    expect(order.items[1].status).toBe(OrderItemStatus.CANCELLED);
    expect(order.items[1].cancelReason).toBe('Ingredient out of stock');
  });
});

