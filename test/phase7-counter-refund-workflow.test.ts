import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as guardsModule from '@/lib/auth/guards';
import { POST as handleRefundCounter } from '@/app/api/v1/restaurants/[restaurantId]/orders/[orderId]/refund-counter/route';
import { completeCounterRefund, CounterRefundError } from '@/lib/orders/counter-refund';
import { UserRole, OrderStatus, OrderItemStatus, PaymentStatus, PaymentMethod } from '@/types';
import { AuthorizationError } from '@/lib/auth/session';

describe('Phase 7: Counter Refund Staff Workflow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockRestaurant = {
    id: 'rest_counter_1',
    name: 'Bella Italia',
    slug: 'bella-italia',
    currency: 'INR',
    isActive: true,
  };

  const mockUserCashier = {
    id: 'user_cashier_1',
    fullName: 'Sara Cashier',
    email: 'sara@bella.com',
  };

  const mockMembershipCashier = {
    userId: mockUserCashier.id,
    restaurantId: mockRestaurant.id,
    role: UserRole.CASHIER,
    isActive: true,
  };

  const mockUserKitchen = {
    id: 'user_chef_1',
    fullName: 'Chef Luigi',
    email: 'luigi@bella.com',
  };

  const mockOrderWithPendingRefund = {
    id: 'order_cr_1',
    restaurantId: mockRestaurant.id,
    orderNumber: 'ORD-CR-001',
    orderStatus: OrderStatus.PREPARING,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.COUNTER,
    subtotal: 40000,
    tax: 0,
    total: 40000,
    refundAmount: 60000,
    refundedAtCounterAmount: 0,
    refundStatus: 'PENDING_COUNTER_REFUND',
    refundCompletedAt: null,
    refundCompletedByUserId: null,
    items: [
      {
        id: 'item_pizza_1',
        nameSnapshot: 'Margherita Pizza',
        priceSnapshot: 60000,
        quantity: 1,
        totalPrice: 60000,
        status: OrderItemStatus.CANCELLED,
      },
      {
        id: 'item_drink_2',
        nameSnapshot: 'Sparkling Water',
        priceSnapshot: 40000,
        quantity: 1,
        totalPrice: 40000,
        status: OrderItemStatus.ACTIVE,
      },
    ],
    payments: [
      {
        id: 'pay_cr_1',
        method: PaymentMethod.COUNTER,
        status: PaymentStatus.PAID,
        amount: 100000,
        refundAmount: 60000,
      },
    ],
    restaurant: mockRestaurant,
  };

  it('1. Cashier successfully completes counter refund and marks order PARTIALLY_REFUNDED', async () => {
    vi.spyOn(guardsModule, 'requireRestaurantAccess').mockResolvedValue({
      user: mockUserCashier as any,
      restaurant: mockRestaurant as any,
      membership: mockMembershipCashier as any,
    });

    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(mockOrderWithPendingRefund as any);

    let updatedRefundStatus: string | undefined;
    let updatedPaymentStatus: string | undefined;
    let updatedRefundedAtCounterAmount: number | undefined;

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          updateMany: vi.fn().mockImplementation((args: any) => {
            updatedRefundStatus = args.data.refundStatus;
            updatedPaymentStatus = args.data.paymentStatus;
            updatedRefundedAtCounterAmount = args.data.refundedAtCounterAmount;
            return { count: 1 };
          }),
          findUniqueOrThrow: vi.fn().mockImplementation(() => ({
            ...mockOrderWithPendingRefund,
            refundStatus: updatedRefundStatus,
            paymentStatus: updatedPaymentStatus,
            refundedAtCounterAmount: updatedRefundedAtCounterAmount,
          })),
        },
        payment: {
          update: vi.fn().mockResolvedValue({ id: 'pay_cr_1' }),
        },
        paymentEvent: {
          create: vi.fn().mockResolvedValue({ id: 'pe_cr_1' }),
        },
        orderStatusHistory: {
          create: vi.fn().mockResolvedValue({ id: 'osh_cr_1' }),
        },
      };
      return cb(mockTx);
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/restaurants/rest_counter_1/orders/order_cr_1/refund-counter',
      { method: 'POST' },
    );

    const res = await handleRefundCounter(req, {
      params: Promise.resolve({
        restaurantId: 'rest_counter_1',
        orderId: 'order_cr_1',
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.refundedAmount).toBe(60000);
    expect(data.data.order.refundStatus).toBe('REFUNDED_AT_COUNTER');
    expect(data.data.order.paymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(updatedRefundStatus).toBe('REFUNDED_AT_COUNTER');
    expect(updatedPaymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(updatedRefundedAtCounterAmount).toBe(60000);
  });

  it('2. Completing counter refund for an all-items-cancelled order sets paymentStatus to REFUNDED', async () => {
    const allCancelledOrder = {
      ...mockOrderWithPendingRefund,
      orderStatus: OrderStatus.CANCELLED,
      items: [
        {
          ...mockOrderWithPendingRefund.items[0],
          status: OrderItemStatus.CANCELLED,
        },
        {
          ...mockOrderWithPendingRefund.items[1],
          status: OrderItemStatus.CANCELLED,
        },
      ],
      refundAmount: 100000,
    };

    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(allCancelledOrder as any);

    let updatedPaymentStatus: string | undefined;

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          updateMany: vi.fn().mockImplementation((args: any) => {
            updatedPaymentStatus = args.data.paymentStatus;
            return { count: 1 };
          }),
          findUniqueOrThrow: vi.fn().mockImplementation(() => ({
            ...allCancelledOrder,
            refundStatus: 'REFUNDED_AT_COUNTER',
            paymentStatus: updatedPaymentStatus,
            refundedAtCounterAmount: 100000,
          })),
        },
        payment: {
          update: vi.fn().mockResolvedValue({ id: 'pay_cr_1' }),
        },
        paymentEvent: {
          create: vi.fn().mockResolvedValue({ id: 'pe_cr_2' }),
        },
        orderStatusHistory: {
          create: vi.fn().mockResolvedValue({ id: 'osh_cr_2' }),
        },
      };
      return cb(mockTx);
    });

    const result = await completeCounterRefund({
      restaurantId: mockRestaurant.id,
      orderId: allCancelledOrder.id,
      userId: mockUserCashier.id,
      userRole: UserRole.CASHIER,
      userFullName: mockUserCashier.fullName,
    });

    expect(result.order.paymentStatus).toBe(PaymentStatus.REFUNDED);
    expect(updatedPaymentStatus).toBe(PaymentStatus.REFUNDED);
    expect(result.refundedAmount).toBe(100000);
  });

  it('3. Rejects kitchen staff from completing counter refund with 403 Forbidden', async () => {
    await expect(
      completeCounterRefund({
        restaurantId: mockRestaurant.id,
        orderId: mockOrderWithPendingRefund.id,
        userId: mockUserKitchen.id,
        userRole: UserRole.KITCHEN,
        userFullName: mockUserKitchen.fullName,
      }),
    ).rejects.toThrow('Only cashiers and managers have permission to confirm counter refunds.');
  });

  it('4. Rejects counter refund completion if order is not in PENDING_COUNTER_REFUND state (400)', async () => {
    const orderNoRefund = {
      ...mockOrderWithPendingRefund,
      refundStatus: null,
      refundAmount: 0,
    };

    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(orderNoRefund as any);

    await expect(
      completeCounterRefund({
        restaurantId: mockRestaurant.id,
        orderId: orderNoRefund.id,
        userId: mockUserCashier.id,
        userRole: UserRole.CASHIER,
      }),
    ).rejects.toThrow('This order does not have a pending counter refund.');
  });

  it('5. Rejects duplicate / concurrent counter refund attempts with 409 Conflict', async () => {
    const orderAlreadyRefunded = {
      ...mockOrderWithPendingRefund,
      refundStatus: 'REFUNDED_AT_COUNTER',
      refundedAtCounterAmount: 60000,
    };

    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(orderAlreadyRefunded as any);

    await expect(
      completeCounterRefund({
        restaurantId: mockRestaurant.id,
        orderId: orderAlreadyRefunded.id,
        userId: mockUserCashier.id,
        userRole: UserRole.CASHIER,
      }),
    ).rejects.toThrow('Counter refund for this order has already been completed.');
  });

  it('6. Route Handler rejects unauthorized roles with 403 status', async () => {
    vi.spyOn(guardsModule, 'requireRestaurantAccess').mockRejectedValue(
      new AuthorizationError('Insufficient permissions for this action.'),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/restaurants/rest_counter_1/orders/order_cr_1/refund-counter',
      { method: 'POST' },
    );

    const res = await handleRefundCounter(req, {
      params: Promise.resolve({
        restaurantId: 'rest_counter_1',
        orderId: 'order_cr_1',
      }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
  });
});
