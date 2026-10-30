import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as guardsModule from '@/lib/auth/guards';
import * as razorpayModule from '@/lib/payments/razorpay';
import { POST as handleCancelItem } from '@/app/api/v1/restaurants/[restaurantId]/orders/[orderId]/items/[itemId]/cancel/route';
import { cancelOrderItem, ItemCancellationError } from '@/lib/orders/item-cancellation';
import { UserRole, OrderStatus, OrderItemStatus, PaymentStatus, PaymentMethod } from '@/types';
import { AuthorizationError } from '@/lib/auth/session';

describe('Phase 7: Kitchen Item-Level Cancellation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockRestaurant = {
    id: 'rest_k_1',
    name: 'Napoli Kitchen',
    slug: 'napoli-kitchen',
    currency: 'INR',
    isActive: true,
  };

  const mockUserKitchen = {
    id: 'user_chef_1',
    fullName: 'Chef Luigi',
    email: 'luigi@napoli.com',
  };

  const mockMembershipKitchen = {
    userId: mockUserKitchen.id,
    restaurantId: mockRestaurant.id,
    role: UserRole.KITCHEN,
    isActive: true,
  };

  const mockOrderUnpaid = {
    id: 'order_k_100',
    restaurantId: mockRestaurant.id,
    orderNumber: 'ORD-261029-K100',
    orderStatus: OrderStatus.PREPARING,
    paymentStatus: PaymentStatus.UNPAID,
    paymentMethod: PaymentMethod.COUNTER,
    subtotal: 100000,
    tax: 0,
    total: 100000,
    refundAmount: 0,
    refundStatus: null,
    items: [
      {
        id: 'item_pizza_1',
        orderId: 'order_k_100',
        nameSnapshot: 'Margherita Pizza',
        priceSnapshot: 60000,
        quantity: 1,
        totalPrice: 60000,
        status: OrderItemStatus.ACTIVE,
      },
      {
        id: 'item_coke_2',
        orderId: 'order_k_100',
        nameSnapshot: 'Cold Brew Coffee',
        priceSnapshot: 40000,
        quantity: 1,
        totalPrice: 40000,
        status: OrderItemStatus.ACTIVE,
      },
    ],
    payments: [],
    restaurant: mockRestaurant,
  };

  it('1. Successfully cancels a single eligible item and recalculates order total', async () => {
    vi.spyOn(guardsModule, 'requireRestaurantAccess').mockResolvedValue({
      user: mockUserKitchen as any,
      restaurant: mockRestaurant as any,
      membership: mockMembershipKitchen as any,
    });

    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(mockOrderUnpaid as any);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        orderItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        order: {
          update: vi.fn().mockResolvedValue({
            ...mockOrderUnpaid,
            subtotal: 40000,
            total: 40000,
            items: [
              { ...mockOrderUnpaid.items[0], status: OrderItemStatus.CANCELLED },
              mockOrderUnpaid.items[1],
            ],
          }),
        },
        orderStatusHistory: {
          create: vi.fn().mockResolvedValue({ id: 'h_1' }),
        },
      };
      return cb(mockTx);
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/restaurants/rest_k_1/orders/order_k_100/items/item_pizza_1/cancel',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Item unavailable',
          note: 'Dough ran out',
        }),
      },
    );

    const res = await handleCancelItem(req, {
      params: Promise.resolve({
        restaurantId: 'rest_k_1',
        orderId: 'order_k_100',
        itemId: 'item_pizza_1',
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.cancelledItem.name).toBe('Margherita Pizza');
    expect(data.data.cancelledItem.reason).toBe('Item unavailable');
    expect(data.data.allItemsCancelled).toBe(false);
    expect(data.data.order.total).toBe(40000);
  });

  it('2. Transitions entire order to CANCELLED when all remaining items are cancelled', async () => {
    const singleItemOrder = {
      ...mockOrderUnpaid,
      items: [mockOrderUnpaid.items[0]],
    };

    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(singleItemOrder as any);

    let recordedOrderStatus: string | undefined;
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        orderItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        order: {
          update: vi.fn().mockImplementation((args: any) => {
            recordedOrderStatus = args.data.orderStatus;
            return {
              ...singleItemOrder,
              orderStatus: args.data.orderStatus,
              subtotal: args.data.subtotal,
              total: args.data.total,
            };
          }),
        },
        orderStatusHistory: {
          create: vi.fn().mockResolvedValue({ id: 'h_2' }),
        },
      };
      return cb(mockTx);
    });

    const result = await cancelOrderItem({
      restaurantId: mockRestaurant.id,
      orderId: singleItemOrder.id,
      itemId: singleItemOrder.items[0].id,
      userId: mockUserKitchen.id,
      userRole: UserRole.KITCHEN,
      reason: 'Ingredient out of stock',
    });

    expect(result.allItemsCancelled).toBe(true);
    expect(recordedOrderStatus).toBe(OrderStatus.CANCELLED);
    expect(result.order.orderStatus).toBe(OrderStatus.CANCELLED);
  });

  it('3. Rejects cancellation when item is already cancelled (409 Conflict)', async () => {
    const orderWithCancelledItem = {
      ...mockOrderUnpaid,
      items: [
        {
          ...mockOrderUnpaid.items[0],
          status: OrderItemStatus.CANCELLED,
        },
      ],
    };

    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(orderWithCancelledItem as any);

    await expect(
      cancelOrderItem({
        restaurantId: mockRestaurant.id,
        orderId: mockOrderUnpaid.id,
        itemId: 'item_pizza_1',
        userId: mockUserKitchen.id,
        userRole: UserRole.KITCHEN,
        reason: 'Equipment issue',
      }),
    ).rejects.toThrow(ItemCancellationError);
  });

  it('4. Rejects cancellation when order is already SERVED (400 Bad Request)', async () => {
    const servedOrder = {
      ...mockOrderUnpaid,
      orderStatus: OrderStatus.SERVED,
    };

    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(servedOrder as any);

    await expect(
      cancelOrderItem({
        restaurantId: mockRestaurant.id,
        orderId: servedOrder.id,
        itemId: 'item_pizza_1',
        userId: mockUserKitchen.id,
        userRole: UserRole.KITCHEN,
        reason: 'Item unavailable',
      }),
    ).rejects.toThrow('Cannot cancel items from an order that has already been served.');
  });

  it('5. Enforces role-based permissions: Cashier/Waiter cannot cancel kitchen items', async () => {
    vi.spyOn(guardsModule, 'requireRestaurantAccess').mockRejectedValue(
      new AuthorizationError('Insufficient permissions for this action.'),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/restaurants/rest_k_1/orders/order_k_100/items/item_pizza_1/cancel',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Other' }),
      },
    );

    const res = await handleCancelItem(req, {
      params: Promise.resolve({
        restaurantId: 'rest_k_1',
        orderId: 'order_k_100',
        itemId: 'item_pizza_1',
      }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('6. Handles paid orders by recording PENDING_COUNTER_REFUND without initiating online Razorpay refund', async () => {
    const mockOrderPaid = {
      ...mockOrderUnpaid,
      paymentStatus: PaymentStatus.PAID,
      refundAmount: 0,
      refundStatus: null,
      payments: [
        {
          id: 'pay_online_1',
          method: PaymentMethod.ONLINE,
          status: PaymentStatus.PAID,
          amount: 100000,
          refundAmount: 0,
          gatewayTransactionId: 'pay_rzp_tx_123',
        },
      ],
    };

    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(mockOrderPaid as any);
    const refundSpy = vi.spyOn(razorpayModule, 'refundGatewayPayment');

    let recordedPaymentStatus: string | undefined;
    let recordedRefundStatus: string | undefined;
    let recordedRefundAmount: number | undefined;

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        orderItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        order: {
          update: vi.fn().mockImplementation((args: any) => {
            recordedPaymentStatus = args.data.paymentStatus;
            recordedRefundStatus = args.data.refundStatus;
            recordedRefundAmount = args.data.refundAmount;
            return {
              ...mockOrderPaid,
              ...args.data,
            };
          }),
        },
        payment: {
          update: vi.fn().mockResolvedValue({ id: 'pay_online_1' }),
        },
        orderStatusHistory: {
          create: vi.fn().mockResolvedValue({ id: 'h_3' }),
        },
      };
      return cb(mockTx);
    });

    const result = await cancelOrderItem({
      restaurantId: mockRestaurant.id,
      orderId: mockOrderPaid.id,
      itemId: 'item_pizza_1',
      userId: mockUserKitchen.id,
      userRole: UserRole.KITCHEN,
      reason: 'Item unavailable',
    });

    // Does NOT trigger Razorpay automatic refund
    expect(refundSpy).not.toHaveBeenCalled();

    // Sets PENDING_COUNTER_REFUND and preserves original payment status
    expect(result.refundAmount).toBe(60000);
    expect(result.refundStatus).toBe('PENDING_COUNTER_REFUND');
    expect(recordedRefundStatus).toBe('PENDING_COUNTER_REFUND');
    expect(recordedRefundAmount).toBe(60000);
    expect(recordedPaymentStatus).toBe(PaymentStatus.PAID);
  });

  it('7. Handles paid counter orders with PENDING_COUNTER_REFUND for cashier settlement', async () => {
    const mockOrderCounterPaid = {
      ...mockOrderUnpaid,
      paymentStatus: PaymentStatus.PAID,
      refundAmount: 0,
      refundStatus: null,
      payments: [
        {
          id: 'pay_counter_1',
          method: PaymentMethod.COUNTER,
          status: PaymentStatus.PAID,
          amount: 100000,
          refundAmount: 0,
          gatewayTransactionId: null,
        },
      ],
    };

    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(mockOrderCounterPaid as any);

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        orderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        order: {
          update: vi.fn().mockImplementation((args: any) => ({
            ...mockOrderCounterPaid,
            ...args.data,
          })),
        },
        payment: { update: vi.fn().mockResolvedValue({ id: 'pay_counter_1' }) },
        orderStatusHistory: { create: vi.fn().mockResolvedValue({ id: 'h_4' }) },
      };
      return cb(mockTx);
    });

    const result = await cancelOrderItem({
      restaurantId: mockRestaurant.id,
      orderId: mockOrderCounterPaid.id,
      itemId: 'item_pizza_1',
      userId: mockUserKitchen.id,
      userRole: UserRole.KITCHEN,
      reason: 'Equipment issue',
    });

    expect(result.refundAmount).toBe(60000);
    expect(result.refundStatus).toBe('PENDING_COUNTER_REFUND');
    expect(result.order.paymentStatus).toBe(PaymentStatus.PAID);
  });

  it('8. Accumulates refund amount without double counting when multiple items are cancelled', async () => {
    const mockOrderPartiallyCancelled = {
      ...mockOrderUnpaid,
      paymentStatus: PaymentStatus.PAID,
      refundAmount: 60000,
      refundStatus: 'PENDING_COUNTER_REFUND',
      payments: [
        {
          id: 'pay_online_1',
          method: PaymentMethod.ONLINE,
          status: PaymentStatus.PAID,
          amount: 100000,
          refundAmount: 60000,
        },
      ],
      items: [
        {
          ...mockOrderUnpaid.items[0],
          status: OrderItemStatus.CANCELLED,
        },
        mockOrderUnpaid.items[1], // 40000
      ],
    };

    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(mockOrderPartiallyCancelled as any);

    let finalRefundAmount: number | undefined;
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        orderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        order: {
          update: vi.fn().mockImplementation((args: any) => {
            finalRefundAmount = args.data.refundAmount;
            return {
              ...mockOrderPartiallyCancelled,
              ...args.data,
            };
          }),
        },
        payment: { update: vi.fn().mockResolvedValue({ id: 'pay_online_1' }) },
        orderStatusHistory: { create: vi.fn().mockResolvedValue({ id: 'h_5' }) },
      };
      return cb(mockTx);
    });

    const result = await cancelOrderItem({
      restaurantId: mockRestaurant.id,
      orderId: mockOrderPartiallyCancelled.id,
      itemId: mockOrderUnpaid.items[1].id,
      userId: mockUserKitchen.id,
      userRole: UserRole.KITCHEN,
      reason: 'Ingredient out of stock',
    });

    expect(result.allItemsCancelled).toBe(true);
    expect(result.order.orderStatus).toBe(OrderStatus.CANCELLED);
    expect(result.order.paymentStatus).toBe(PaymentStatus.PAID);
    expect(finalRefundAmount).toBe(100000);
    expect(result.refundAmount).toBe(100000);
    expect(result.refundStatus).toBe('PENDING_COUNTER_REFUND');
  });
});
