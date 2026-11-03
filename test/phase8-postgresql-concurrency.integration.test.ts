import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { cancelOrderItem } from '@/lib/orders/item-cancellation';
import { completeCounterRefund } from '@/lib/orders/counter-refund';
import {
  UserRole,
  OrderStatus,
  OrderItemStatus,
  PaymentStatus,
  PaymentMethod,
  TableStatus,
} from '@/types';

describe('Phase 8: PostgreSQL Real Transaction & Concurrency Integration', () => {
  const timestamp = Date.now();
  let restaurantId: string;
  let ownerUserId: string;
  let tableId: string;
  let sessionId: string;
  let orderId: string;
  let itemAId: string;
  let itemBId: string;
  let itemCId: string;
  let paymentId: string;

  beforeAll(async () => {
    // Setup test restaurant and owner in real PostgreSQL database
    const owner = await prisma.user.create({
      data: {
        email: `concur-owner-${timestamp}@bistro.com`,
        passwordHash: '$2a$10$hashedpasswordplaceholder1234567890123456789012',
        fullName: 'Concurrency Owner',
        tokenVersion: 1,
      },
    });
    ownerUserId = owner.id;

    const restaurant = await prisma.restaurant.create({
      data: {
        name: `Concurrency Bistro ${timestamp}`,
        slug: `concur-bistro-${timestamp}`,
        currency: 'INR',
        memberships: {
          create: {
            userId: owner.id,
            role: UserRole.OWNER,
          },
        },
      },
    });
    restaurantId = restaurant.id;

    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurant.id,
        tableNumber: `T-CONCUR-${timestamp.toString().slice(-4)}`,
        status: TableStatus.OCCUPIED,
      },
    });
    tableId = table.id;

    const session = await prisma.tableSession.create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        sessionTokenHash: `hash_concur_session_${timestamp}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    sessionId = session.id;

    // Create order with 3 active items totalling ₹1000.00
    const order = await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        sessionId: session.id,
        orderNumber: `ORD-CONCUR-${timestamp.toString().slice(-4)}`,
        orderStatus: OrderStatus.PREPARING,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.ONLINE,
        subtotal: 100000,
        tax: 0,
        total: 100000,
        refundAmount: 0,
        refundedAtCounterAmount: 0,
        items: {
          create: [
            {
              nameSnapshot: 'Paneer Tikka',
              priceSnapshot: 30000,
              quantity: 1,
              totalPrice: 30000,
              status: OrderItemStatus.ACTIVE,
            },
            {
              nameSnapshot: 'Butter Naan',
              priceSnapshot: 20000,
              quantity: 1,
              totalPrice: 20000,
              status: OrderItemStatus.ACTIVE,
            },
            {
              nameSnapshot: 'Dal Makhani',
              priceSnapshot: 50000,
              quantity: 1,
              totalPrice: 50000,
              status: OrderItemStatus.ACTIVE,
            },
          ],
        },
        payments: {
          create: {
            restaurantId: restaurant.id,
            amount: 100000,
            currency: 'INR',
            method: PaymentMethod.ONLINE,
            status: PaymentStatus.PAID,
            gatewayProvider: 'RAZORPAY',
            gatewayOrderId: `rzp_order_concur_${timestamp}`,
            gatewayTransactionId: `rzp_pay_concur_${timestamp}`,
            paidAt: new Date(),
          },
        },
      },
      include: {
        items: true,
        payments: true,
      },
    });

    orderId = order.id;
    itemAId = order.items.find((i) => i.nameSnapshot === 'Paneer Tikka')!.id;
    itemBId = order.items.find((i) => i.nameSnapshot === 'Butter Naan')!.id;
    itemCId = order.items.find((i) => i.nameSnapshot === 'Dal Makhani')!.id;
    paymentId = order.payments[0].id;
  });

  afterAll(async () => {
    // Cleanup created test records
    try {
      if (orderId) {
        await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
        await prisma.paymentEvent.deleteMany({ where: { paymentId } });
        await prisma.payment.deleteMany({ where: { orderId } });
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
      }
      if (sessionId) {
        await prisma.tableSession.deleteMany({ where: { id: sessionId } });
      }
      if (tableId) {
        await prisma.restaurantTable.deleteMany({ where: { id: tableId } });
      }
      if (restaurantId) {
        await prisma.restaurantMembership.deleteMany({ where: { restaurantId } });
        await prisma.restaurant.deleteMany({ where: { id: restaurantId } });
      }
      if (ownerUserId) {
        await prisma.user.deleteMany({ where: { id: ownerUserId } });
      }
    } catch {
      // Best-effort cleanup
    }
  });

  it('1. Executes concurrent item cancellations in real PostgreSQL without total corruption', async () => {
    // Simultaneously cancel Item A (₹300) and Item B (₹200)
    const [resultA, resultB] = await Promise.all([
      cancelOrderItem({
        restaurantId,
        orderId,
        itemId: itemAId,
        userId: ownerUserId,
        userRole: UserRole.OWNER,
        reason: 'Item unavailable',
      }),
      cancelOrderItem({
        restaurantId,
        orderId,
        itemId: itemBId,
        userId: ownerUserId,
        userRole: UserRole.OWNER,
        reason: 'Ingredient out of stock',
      }),
    ]);

    expect(resultA.cancelledItem.id).toBe(itemAId);
    expect(resultB.cancelledItem.id).toBe(itemBId);

    // Verify final state in PostgreSQL:
    const freshOrder = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });

    const activeItems = freshOrder.items.filter((i) => i.status === OrderItemStatus.ACTIVE);
    expect(activeItems).toHaveLength(1);
    expect(activeItems[0].id).toBe(itemCId); // Only Dal Makhani (₹500) active

    // Authoritative total must be exactly ₹500 (50000 paise)
    expect(freshOrder.total).toBe(50000);

    // Refund liability must be exactly ₹500 (100000 paid - 50000 active)
    expect(freshOrder.refundAmount).toBe(50000);
    expect(freshOrder.refundStatus).toBe('PENDING_COUNTER_REFUND');
    expect(freshOrder.paymentStatus).toBe(PaymentStatus.PAID);
  });

  it('2. Prevents double-cancellation of the same item concurrently', async () => {
    // Attempt to cancel Item C twice simultaneously
    const results = await Promise.allSettled([
      cancelOrderItem({
        restaurantId,
        orderId,
        itemId: itemCId,
        userId: ownerUserId,
        userRole: UserRole.OWNER,
        reason: 'Equipment issue',
      }),
      cancelOrderItem({
        restaurantId,
        orderId,
        itemId: itemCId,
        userId: ownerUserId,
        userRole: UserRole.OWNER,
        reason: 'Equipment issue',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason.message).toContain('already been cancelled');

    // All items now cancelled: order should transition to CANCELLED and refund full 100000
    const freshOrder = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });

    expect(freshOrder.orderStatus).toBe(OrderStatus.CANCELLED);
    expect(freshOrder.total).toBe(0);
    expect(freshOrder.refundAmount).toBe(100000);
    expect(freshOrder.refundStatus).toBe('PENDING_COUNTER_REFUND');
  });

  it('3. Prevents duplicate counter refund completion under concurrent requests', async () => {
    // Attempt to complete the pending counter refund twice concurrently
    const results = await Promise.allSettled([
      completeCounterRefund({
        restaurantId,
        orderId,
        userId: ownerUserId,
        userRole: UserRole.OWNER,
        userFullName: 'Owner Admin',
      }),
      completeCounterRefund({
        restaurantId,
        orderId,
        userId: ownerUserId,
        userRole: UserRole.OWNER,
        userFullName: 'Owner Admin',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed; the other must conflict or reject
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Verify in PostgreSQL: refunded amount must equal 100000 exactly (never 200000!)
    const freshOrder = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });

    expect(freshOrder.refundedAtCounterAmount).toBe(100000);
    expect(freshOrder.refundStatus).toBe('REFUNDED_AT_COUNTER');
    expect(freshOrder.paymentStatus).toBe(PaymentStatus.REFUNDED);
  });
});

