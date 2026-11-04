import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  settleCounterPayment,
  SettlementError,
} from '@/lib/payments/counter-settlement';
import {
  resolveOrCreateTableSession,
  getTableActiveSessionSummary,
  closeTableSession,
  TableSessionClosureError,
} from '@/lib/qr/session';
import {
  UserRole,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  TableStatus,
} from '@/types';

describe('Clear Table Cash Payment Settlement & Concurrency Safety', () => {
  const timestamp = Date.now();

  let restaurantIdA: string;
  let restaurantIdB: string;
  let ownerUserIdA: string;
  let cashierUserIdA: string;
  let waiterUserIdA: string;
  let kitchenUserIdA: string;
  let ownerUserIdB: string;

  let tableA1Id: string;
  let tableA2Id: string;
  let tableA3Id: string;
  let sessionA1Token: string;
  let sessionA1Id: string;

  beforeAll(async () => {
    // 1. Create Restaurant A and its staff members
    const ownerA = await prisma.user.create({
      data: {
        email: `settle-owner-${timestamp}@restaurant.com`,
        passwordHash: '$2a$10$hashedpasswordplaceholder1234567890123456789012',
        fullName: 'Owner Alice',
        tokenVersion: 1,
      },
    });
    ownerUserIdA = ownerA.id;

    const cashierA = await prisma.user.create({
      data: {
        email: `settle-cashier-${timestamp}@restaurant.com`,
        passwordHash: '$2a$10$hashedpasswordplaceholder1234567890123456789012',
        fullName: 'Cashier Charlie',
        tokenVersion: 1,
      },
    });
    cashierUserIdA = cashierA.id;

    const waiterA = await prisma.user.create({
      data: {
        email: `settle-waiter-${timestamp}@restaurant.com`,
        passwordHash: '$2a$10$hashedpasswordplaceholder1234567890123456789012',
        fullName: 'Waiter Wendy',
        tokenVersion: 1,
      },
    });
    waiterUserIdA = waiterA.id;

    const kitchenA = await prisma.user.create({
      data: {
        email: `settle-cook-${timestamp}@restaurant.com`,
        passwordHash: '$2a$10$hashedpasswordplaceholder1234567890123456789012',
        fullName: 'Chef Kevin',
        tokenVersion: 1,
      },
    });
    kitchenUserIdA = kitchenA.id;

    const restaurantA = await prisma.restaurant.create({
      data: {
        name: `Settle Bistro A ${timestamp}`,
        slug: `settle-bistro-a-${timestamp}`,
        currency: 'INR',
        memberships: {
          create: [
            { userId: ownerA.id, role: UserRole.OWNER },
            { userId: cashierA.id, role: UserRole.CASHIER },
            { userId: waiterA.id, role: UserRole.WAITER },
            { userId: kitchenA.id, role: UserRole.KITCHEN },
          ],
        },
      },
    });
    restaurantIdA = restaurantA.id;

    // 2. Create Restaurant B and foreign owner (for tenant isolation testing)
    const ownerB = await prisma.user.create({
      data: {
        email: `settle-owner-b-${timestamp}@restaurant.com`,
        passwordHash: '$2a$10$hashedpasswordplaceholder1234567890123456789012',
        fullName: 'Owner Bob',
        tokenVersion: 1,
      },
    });
    ownerUserIdB = ownerB.id;

    const restaurantB = await prisma.restaurant.create({
      data: {
        name: `Settle Bistro B ${timestamp}`,
        slug: `settle-bistro-b-${timestamp}`,
        currency: 'INR',
        memberships: {
          create: [{ userId: ownerB.id, role: UserRole.OWNER }],
        },
      },
    });
    restaurantIdB = restaurantB.id;

    // 3. Create physical tables for Restaurant A
    const t1 = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurantIdA,
        tableNumber: `T-CASH-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });
    tableA1Id = t1.id;

    const t2 = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurantIdA,
        tableNumber: `T-MULTI-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });
    tableA2Id = t2.id;

    const t3 = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurantIdA,
        tableNumber: `T-RACE-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });
    tableA3Id = t3.id;

    // Establish active session on Table 1
    const s1 = await resolveOrCreateTableSession(restaurantIdA, tableA1Id);
    sessionA1Token = s1.sessionToken;
    sessionA1Id = s1.session.id;
  });

  it('1. Eligible cash order can be settled by authorized staff', async () => {
    const orderNumber = `ORD-C1-${timestamp.toString().slice(-4)}`;
    const order = await prisma.order.create({
      data: {
        restaurantId: restaurantIdA,
        tableId: tableA1Id,
        sessionId: sessionA1Id,
        orderNumber,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: 22000,
        tax: 0,
        total: 22000,
      },
    });

    const result = await settleCounterPayment({
      restaurantId: restaurantIdA,
      orderId: order.id,
      amount: 22000,
      userId: cashierUserIdA,
      userFullName: 'Cashier Charlie',
      userRole: UserRole.CASHIER,
      expectedSessionId: sessionA1Id,
      notes: 'Customer paid exact cash',
    });

    expect(result.order.paymentStatus).toBe(PaymentStatus.PAID);
    expect(result.order.paymentMethod).toBe(PaymentMethod.COUNTER);
    expect(result.payment.status).toBe(PaymentStatus.PAID);
    expect(result.payment.method).toBe(PaymentMethod.COUNTER);
  });

  it('2. Cash settlement creates the correct payment record and audit trail', async () => {
    const orderNumber = `ORD-C2-${timestamp.toString().slice(-4)}`;
    const order = await prisma.order.create({
      data: {
        restaurantId: restaurantIdA,
        tableId: tableA1Id,
        sessionId: sessionA1Id,
        orderNumber,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: 35000,
        tax: 0,
        total: 35000,
      },
    });

    const settleResult = await settleCounterPayment({
      restaurantId: restaurantIdA,
      orderId: order.id,
      amount: 35000,
      userId: waiterUserIdA,
      userFullName: 'Waiter Wendy',
      userRole: UserRole.WAITER,
      expectedSessionId: sessionA1Id,
      reference: `REC-${timestamp}`,
      notes: 'Settled at table in cash',
    });

    // Verify Payment row in database
    const paymentInDb = await prisma.payment.findUniqueOrThrow({
      where: { id: settleResult.payment.id },
    });
    expect(paymentInDb.orderId).toBe(order.id);
    expect(paymentInDb.amount).toBe(35000);
    expect(paymentInDb.method).toBe(PaymentMethod.COUNTER);
    expect(paymentInDb.status).toBe(PaymentStatus.PAID);
    expect(paymentInDb.gatewayProvider).toBe('COUNTER');
    expect(paymentInDb.paidAt).not.toBeNull();

    // Verify PaymentEvent audit log
    const eventInDb = await prisma.paymentEvent.findFirstOrThrow({
      where: { paymentId: settleResult.payment.id },
    });
    expect(eventInDb.eventType).toBe('counter.settled');
    const payload = eventInDb.payload as {
      settledByUserId?: string;
      settledByName?: string;
      staffRole?: string;
      amount?: number;
    };
    expect(payload.settledByUserId).toBe(waiterUserIdA);
    expect(payload.settledByName).toBe('Waiter Wendy');
    expect(payload.staffRole).toBe(UserRole.WAITER);
    expect(payload.amount).toBe(35000);

    // Verify OrderStatusHistory record
    const historyInDb = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, changedByUserId: waiterUserIdA },
    });
    expect(historyInDb).not.toBeNull();
    expect(historyInDb?.note).toContain('Payment of 35000 settled at counter by Waiter Wendy');
  });

  it('3. Duplicate cash settlement is prevented for an already PAID order', async () => {
    const orderNumber = `ORD-C3-${timestamp.toString().slice(-4)}`;
    const order = await prisma.order.create({
      data: {
        restaurantId: restaurantIdA,
        tableId: tableA1Id,
        sessionId: sessionA1Id,
        orderNumber,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: 15000,
        tax: 0,
        total: 15000,
      },
    });

    // First settlement succeeds
    await settleCounterPayment({
      restaurantId: restaurantIdA,
      orderId: order.id,
      amount: 15000,
      userId: cashierUserIdA,
      userFullName: 'Cashier Charlie',
      userRole: UserRole.CASHIER,
    });

    // Second settlement attempt must fail
    await expect(
      settleCounterPayment({
        restaurantId: restaurantIdA,
        orderId: order.id,
        amount: 15000,
        userId: cashierUserIdA,
        userFullName: 'Cashier Charlie',
        userRole: UserRole.CASHIER,
      }),
    ).rejects.toThrow(SettlementError);

    try {
      await settleCounterPayment({
        restaurantId: restaurantIdA,
        orderId: order.id,
        amount: 15000,
        userId: cashierUserIdA,
        userFullName: 'Cashier Charlie',
        userRole: UserRole.CASHIER,
      });
    } catch (err) {
      expect((err as SettlementError).code).toBe('ORDER_ALREADY_PAID');
    }
  });

  it('4. Online unpaid order cannot be marked cash paid (INELIGIBLE_PAYMENT_METHOD)', async () => {
    const orderNumber = `ORD-ON1-${timestamp.toString().slice(-4)}`;
    const onlineOrder = await prisma.order.create({
      data: {
        restaurantId: restaurantIdA,
        tableId: tableA1Id,
        sessionId: sessionA1Id,
        orderNumber,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.ONLINE, // online payment method
        subtotal: 45000,
        tax: 0,
        total: 45000,
      },
    });

    let settleErr: unknown;
    try {
      await settleCounterPayment({
        restaurantId: restaurantIdA,
        orderId: onlineOrder.id,
        amount: 45000,
        userId: cashierUserIdA,
        userFullName: 'Cashier Charlie',
        userRole: UserRole.CASHIER,
      });
    } catch (e) {
      settleErr = e;
    }

    expect(settleErr).toBeInstanceOf(SettlementError);
    const err = settleErr as SettlementError;
    expect(err.code).toBe('INELIGIBLE_PAYMENT_METHOD');
    expect(err.message).toContain('was placed for online payment and cannot be settled as cash');

    // Verify order remains UNPAID and ONLINE in database
    const orderInDb = await prisma.order.findUniqueOrThrow({
      where: { id: onlineOrder.id },
    });
    expect(orderInDb.paymentStatus).toBe(PaymentStatus.UNPAID);
    expect(orderInDb.paymentMethod).toBe(PaymentMethod.ONLINE);
  });

  it('5. Missing or ambiguous payment method cannot be settled as cash (AMBIGUOUS_PAYMENT_METHOD)', async () => {
    const orderNumber = `ORD-AMB-${timestamp.toString().slice(-4)}`;
    const order = await prisma.order.create({
      data: {
        restaurantId: restaurantIdA,
        tableId: tableA1Id,
        sessionId: sessionA1Id,
        orderNumber,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: 18000,
        tax: 0,
        total: 18000,
      },
    });

    // Simulate an order with pending online payment attempt
    await prisma.payment.create({
      data: {
        restaurantId: restaurantIdA,
        orderId: order.id,
        amount: 18000,
        method: PaymentMethod.ONLINE,
        status: PaymentStatus.PENDING,
        gatewayProvider: 'RAZORPAY',
      },
    });

    let settleErr: unknown;
    try {
      await settleCounterPayment({
        restaurantId: restaurantIdA,
        orderId: order.id,
        amount: 18000,
        userId: cashierUserIdA,
        userFullName: 'Cashier Charlie',
        userRole: UserRole.CASHIER,
      });
    } catch (e) {
      settleErr = e;
    }

    expect(settleErr).toBeInstanceOf(SettlementError);
    const err = settleErr as SettlementError;
    expect(err.code).toBe('ONLINE_PAYMENT_PENDING');
  });

  it('6. Unauthorized staff (e.g. KITCHEN) cannot settle cash (UNAUTHORIZED_SETTLEMENT)', async () => {
    const orderNumber = `ORD-COOK-${timestamp.toString().slice(-4)}`;
    const order = await prisma.order.create({
      data: {
        restaurantId: restaurantIdA,
        tableId: tableA1Id,
        sessionId: sessionA1Id,
        orderNumber,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: 10000,
        tax: 0,
        total: 10000,
      },
    });

    await expect(
      settleCounterPayment({
        restaurantId: restaurantIdA,
        orderId: order.id,
        amount: 10000,
        userId: kitchenUserIdA,
        userFullName: 'Chef Kevin',
        userRole: UserRole.KITCHEN,
      }),
    ).rejects.toThrow(SettlementError);

    try {
      await settleCounterPayment({
        restaurantId: restaurantIdA,
        orderId: order.id,
        amount: 10000,
        userId: kitchenUserIdA,
        userFullName: 'Chef Kevin',
        userRole: UserRole.KITCHEN,
      });
    } catch (err) {
      expect((err as SettlementError).code).toBe('UNAUTHORIZED_SETTLEMENT');
      expect((err as SettlementError).statusCode).toBe(403);
    }
  });

  it('7. Tenant isolation is enforced: Staff of Restaurant B cannot settle Restaurant A order', async () => {
    const orderNumber = `ORD-TENANT-${timestamp.toString().slice(-4)}`;
    const orderA = await prisma.order.create({
      data: {
        restaurantId: restaurantIdA,
        tableId: tableA1Id,
        sessionId: sessionA1Id,
        orderNumber,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: 20000,
        tax: 0,
        total: 20000,
      },
    });

    // Owner B attempts settlement with their restaurant B tenant context
    await expect(
      settleCounterPayment({
        restaurantId: restaurantIdB,
        orderId: orderA.id,
        amount: 20000,
        userId: ownerUserIdB,
        userFullName: 'Owner Bob',
        userRole: UserRole.OWNER,
      }),
    ).rejects.toThrow('Order not found or does not belong to this restaurant.');
  });

  it('8. Cash settlement updates Clear Table eligibility in session summary', async () => {
    // Establish table 2 session
    const s2 = await resolveOrCreateTableSession(restaurantIdA, tableA2Id);

    const orderNumber = `ORD-ELIG-${timestamp.toString().slice(-4)}`;
    const order = await prisma.order.create({
      data: {
        restaurantId: restaurantIdA,
        tableId: tableA2Id,
        sessionId: s2.session.id,
        orderNumber,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: 30000,
        tax: 0,
        total: 30000,
      },
    });

    // 1. Check summary before settlement: must NOT be clearable because order is unpaid
    const summaryBefore = await getTableActiveSessionSummary(restaurantIdA, tableA2Id);
    expect(summaryBefore).not.toBeNull();
    expect(summaryBefore?.canClose).toBe(false);
    expect(summaryBefore?.unpaidOrdersCount).toBe(1);
    expect(summaryBefore?.unpaidTotalAmount).toBe(30000);

    const targetOrderBefore = summaryBefore?.orders.find((o) => o.id === order.id);
    expect(targetOrderBefore?.isCashEligible).toBe(true);
    expect(targetOrderBefore?.displayPaymentStatus).toBe('UNPAID');

    // 2. Staff marks cash paid
    await settleCounterPayment({
      restaurantId: restaurantIdA,
      orderId: order.id,
      amount: 30000,
      userId: cashierUserIdA,
      userFullName: 'Cashier Charlie',
      userRole: UserRole.CASHIER,
      expectedSessionId: s2.session.id,
    });

    // 3. Check summary after settlement: now eligible for closure!
    const summaryAfter = await getTableActiveSessionSummary(restaurantIdA, tableA2Id);
    expect(summaryAfter?.canClose).toBe(true);
    expect(summaryAfter?.unpaidOrdersCount).toBe(0);
    expect(summaryAfter?.unpaidTotalAmount).toBe(0);

    const targetOrderAfter = summaryAfter?.orders.find((o) => o.id === order.id);
    expect(targetOrderAfter?.isCashEligible).toBe(false);
    expect(targetOrderAfter?.displayPaymentStatus).toBe('PAID (CASH)');

    // 4. Staff clears table: must succeed atomically
    const closeResult = await closeTableSession({
      restaurantId: restaurantIdA,
      tableId: tableA2Id,
      expectedSessionId: s2.session.id,
      closedByUserId: cashierUserIdA,
    });
    expect(closeResult.success).toBe(true);

    const tableAfterClose = await prisma.restaurantTable.findUniqueOrThrow({
      where: { id: tableA2Id },
    });
    expect(tableAfterClose.status).toBe(TableStatus.AVAILABLE);
  });

  it('9. Table cannot be cleared while any genuine unpaid liability remains', async () => {
    // Establish table 3 session with 2 orders: 1 cash paid, 1 unpaid online
    const s3 = await resolveOrCreateTableSession(restaurantIdA, tableA3Id);

    // Order 1: Cash, marked PAID
    await prisma.order.create({
      data: {
        restaurantId: restaurantIdA,
        tableId: tableA3Id,
        sessionId: s3.session.id,
        orderNumber: `ORD-T3-PAID-${timestamp.toString().slice(-4)}`,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: 20000,
        tax: 0,
        total: 20000,
      },
    });

    // Order 2: Online, UNPAID
    await prisma.order.create({
      data: {
        restaurantId: restaurantIdA,
        tableId: tableA3Id,
        sessionId: s3.session.id,
        orderNumber: `ORD-T3-UNPAID-${timestamp.toString().slice(-4)}`,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.ONLINE,
        subtotal: 40000,
        tax: 0,
        total: 40000,
      },
    });

    // Summary must indicate closure is blocked
    const summary = await getTableActiveSessionSummary(restaurantIdA, tableA3Id);
    expect(summary?.canClose).toBe(false);
    expect(summary?.unpaidOrdersCount).toBe(1);

    const onlineOrderSummary = summary?.orders.find((o) => o.paymentMethod === 'ONLINE');
    expect(onlineOrderSummary?.isCashEligible).toBe(false);
    expect(onlineOrderSummary?.displayPaymentStatus).toBe('UNPAID');

    // Attempting to clear table must fail
    await expect(
      closeTableSession({
        restaurantId: restaurantIdA,
        tableId: tableA3Id,
        expectedSessionId: s3.session.id,
        closedByUserId: ownerUserIdA,
      }),
    ).rejects.toThrow(TableSessionClosureError);
  });

  it('10. Concurrent settlement requests cannot create duplicate payments', async () => {
    const orderNumber = `ORD-RACE-${timestamp.toString().slice(-4)}`;
    const raceOrder = await prisma.order.create({
      data: {
        restaurantId: restaurantIdA,
        tableId: tableA1Id,
        sessionId: sessionA1Id,
        orderNumber,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: 50000,
        tax: 0,
        total: 50000,
      },
    });

    // Two cashiers concurrently attempt to settle the same order
    const [result1, result2] = await Promise.allSettled([
      settleCounterPayment({
        restaurantId: restaurantIdA,
        orderId: raceOrder.id,
        amount: 50000,
        userId: cashierUserIdA,
        userFullName: 'Cashier Charlie',
        userRole: UserRole.CASHIER,
      }),
      settleCounterPayment({
        restaurantId: restaurantIdA,
        orderId: raceOrder.id,
        amount: 50000,
        userId: waiterUserIdA,
        userFullName: 'Waiter Wendy',
        userRole: UserRole.WAITER,
      }),
    ]);

    // Exactly one must succeed, and one must be rejected
    const succeeded = [result1, result2].filter((r) => r.status === 'fulfilled');
    const rejected = [result1, result2].filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedError).toBeInstanceOf(SettlementError);
    expect((rejectedError as SettlementError).code).toBe('ORDER_ALREADY_PAID');

    // Exactly 1 payment row in database
    const paymentsInDb = await prisma.payment.findMany({
      where: { orderId: raceOrder.id },
    });
    expect(paymentsInDb).toHaveLength(1);
    expect(paymentsInDb[0].status).toBe(PaymentStatus.PAID);
    expect(paymentsInDb[0].amount).toBe(50000);
  });
});
