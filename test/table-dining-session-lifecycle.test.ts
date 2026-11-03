import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  resolveOrCreateTableSession,
  verifyActiveTableSession,
  closeTableSession,
  getTableActiveSessionSummary,
  TableSessionClosureError,
  TableSessionOccupiedError,
} from '@/lib/qr/session';
import {
  listSessionOrders,
  createSessionOrder,
  OrderOperationError,
} from '@/lib/orders/public-orders';
import { getReceiptData } from '@/lib/orders/receipt';
import { createReceiptToken } from '@/lib/orders/receipt-token';
import { createTableQrToken } from '@/lib/qr/token';
import {
  UserRole,
  OrderStatus,
  OrderItemStatus,
  PaymentStatus,
  PaymentMethod,
  TableStatus,
} from '@/types';

describe('Table Dining Session Lifecycle & Order Isolation Integration', () => {
  const timestamp = Date.now();
  let restaurantId: string;
  let restaurantSlug: string;
  let ownerUserId: string;
  let tableId: string;
  let qrToken: string;

  let sessionAToken: string;
  let sessionAId: string;
  let orderA1Id: string;
  let orderA1Number: string;
  let orderA2Id: string;
  let orderA2Number: string;

  let sessionBToken: string;
  let sessionBId: string;
  let testMenuItemId: string;

  beforeAll(async () => {
    // 1. Create test restaurant and owner
    const owner = await prisma.user.create({
      data: {
        email: `lifecycle-owner-${timestamp}@dining.com`,
        passwordHash: '$2a$10$hashedpasswordplaceholder1234567890123456789012',
        fullName: 'Lifecycle Owner',
        tokenVersion: 1,
      },
    });
    ownerUserId = owner.id;

    restaurantSlug = `lifecycle-bistro-${timestamp}`;
    const restaurant = await prisma.restaurant.create({
      data: {
        name: `Lifecycle Bistro ${timestamp}`,
        slug: restaurantSlug,
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

    // 2. Create category and menu item for order tests
    const category = await prisma.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: `Lifecycle Category ${timestamp}`,
        isActive: true,
      },
    });
    const item = await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: category.id,
        name: `Lifecycle Naan ${timestamp}`,
        price: 3000,
        isAvailable: true,
      },
    });
    testMenuItemId = item.id;

    // 3. Create physical Table 5
    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurant.id,
        tableNumber: `T-LIFE-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });
    tableId = table.id;

    // 4. Generate secure table QR token
    const qrResult = await createTableQrToken(restaurant.id, table.id);
    qrToken = qrResult.rawToken;
  });

  afterAll(async () => {
    try {
      if (restaurantId) {
        await prisma.orderStatusHistory.deleteMany({ where: { order: { restaurantId } } });
        await prisma.paymentEvent.deleteMany({ where: { payment: { restaurantId } } });
        await prisma.payment.deleteMany({ where: { restaurantId } });
        await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
        await prisma.order.deleteMany({ where: { restaurantId } });
        await prisma.tableSession.deleteMany({ where: { restaurantId } });
        await prisma.tableQrToken.deleteMany({ where: { restaurantId } });
        await prisma.menuItem.deleteMany({ where: { restaurantId } });
        await prisma.menuCategory.deleteMany({ where: { restaurantId } });
        await prisma.restaurantTable.deleteMany({ where: { restaurantId } });
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

  it('1. Customer A scans QR code: creates Session A and table becomes OCCUPIED', async () => {
    const sessionResult = await resolveOrCreateTableSession(restaurantId, tableId);

    expect(sessionResult.isNew).toBe(true);
    expect(sessionResult.session.isActive).toBe(true);
    expect(sessionResult.session.status).toBe('ACTIVE');

    sessionAToken = sessionResult.sessionToken;
    sessionAId = sessionResult.session.id;

    // Verify table status transitioned to OCCUPIED
    const table = await prisma.restaurantTable.findUniqueOrThrow({
      where: { id: tableId },
    });
    expect(table.status).toBe(TableStatus.OCCUPIED);
  });

  it('2. Customer A places Order 1 and it progresses to SERVED (disappears from KDS)', async () => {
    orderA1Number = `ORD-L1-${timestamp.toString().slice(-4)}`;
    const order1 = await prisma.order.create({
      data: {
        restaurantId,
        tableId,
        sessionId: sessionAId,
        orderNumber: orderA1Number,
        orderStatus: OrderStatus.PREPARING,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.ONLINE,
        subtotal: 50000,
        tax: 0,
        total: 50000,
        items: {
          create: {
            nameSnapshot: 'Paneer Butter Masala',
            priceSnapshot: 50000,
            quantity: 1,
            totalPrice: 50000,
            status: OrderItemStatus.ACTIVE,
          },
        },
        payments: {
          create: {
            restaurantId,
            amount: 50000,
            currency: 'INR',
            method: PaymentMethod.ONLINE,
            status: PaymentStatus.PAID,
            paidAt: new Date(),
          },
        },
      },
    });
    orderA1Id = order1.id;

    // Check KDS active query: order in PREPARING is visible in KDS
    const kdsActiveBefore = await prisma.order.findMany({
      where: {
        restaurantId,
        orderStatus: { in: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'] },
      },
    });
    expect(kdsActiveBefore.some((o) => o.id === orderA1Id)).toBe(true);

    // Cook marks order SERVED
    await prisma.order.update({
      where: { id: orderA1Id },
      data: { orderStatus: OrderStatus.SERVED },
    });

    // Check KDS active query: served order must be excluded from active queue
    const kdsActiveAfter = await prisma.order.findMany({
      where: {
        restaurantId,
        orderStatus: { in: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'] },
      },
    });
    expect(kdsActiveAfter.some((o) => o.id === orderA1Id)).toBe(false);
  });

  it('3. Customer A places Order 2 during the same active dining session', async () => {
    orderA2Number = `ORD-L2-${timestamp.toString().slice(-4)}`;
    const order2 = await prisma.order.create({
      data: {
        restaurantId,
        tableId,
        sessionId: sessionAId,
        orderNumber: orderA2Number,
        orderStatus: OrderStatus.PREPARING,
        paymentStatus: PaymentStatus.UNPAID,
        paymentMethod: PaymentMethod.COUNTER,
        subtotal: 20000,
        tax: 0,
        total: 20000,
        items: {
          create: {
            nameSnapshot: 'Garlic Naan',
            priceSnapshot: 20000,
            quantity: 1,
            totalPrice: 20000,
            status: OrderItemStatus.ACTIVE,
          },
        },
      },
    });
    orderA2Id = order2.id;

    // Customer A sees both orders in their session
    const verifiedSessionA = await verifyActiveTableSession(sessionAToken);
    expect(verifiedSessionA).not.toBeNull();

    const ordersA = await listSessionOrders(verifiedSessionA!);
    expect(ordersA).toHaveLength(2);
    expect(ordersA.map((o) => o.orderNumber)).toContain(orderA1Number);
    expect(ordersA.map((o) => o.orderNumber)).toContain(orderA2Number);
  });

  it('4. Session cannot close while an active order remains in kitchen', async () => {
    // Order 2 is PREPARING: closure must be rejected
    await expect(
      closeTableSession({
        restaurantId,
        tableId,
        closedByUserId: ownerUserId,
      }),
    ).rejects.toThrow(TableSessionClosureError);

    // Inspect summary: blocking reason must indicate order is still preparing
    const summary = await getTableActiveSessionSummary(restaurantId, tableId);
    expect(summary?.canClose).toBe(false);
    expect(summary?.blockingReasons.some((r) => r.includes('PREPARING'))).toBe(true);
  });

  it('5. Session cannot close while payment is pending', async () => {
    // Cook marks Order 2 SERVED, but payment is still UNPAID
    await prisma.order.update({
      where: { id: orderA2Id },
      data: { orderStatus: OrderStatus.SERVED },
    });

    await expect(
      closeTableSession({
        restaurantId,
        tableId,
        closedByUserId: ownerUserId,
      }),
    ).rejects.toThrow(TableSessionClosureError);

    const summary = await getTableActiveSessionSummary(restaurantId, tableId);
    expect(summary?.canClose).toBe(false);
    expect(summary?.blockingReasons.some((r) => r.includes('unpaid'))).toBe(true);
  });

  it('6. Session cannot close with unresolved counter refund obligations', async () => {
    // Settle payment on Order 2, but mark pending counter refund
    await prisma.order.update({
      where: { id: orderA2Id },
      data: {
        paymentStatus: PaymentStatus.PAID,
        refundStatus: 'PENDING_COUNTER_REFUND',
        refundAmount: 10000,
        refundedAtCounterAmount: 0,
      },
    });

    await expect(
      closeTableSession({
        restaurantId,
        tableId,
        closedByUserId: ownerUserId,
      }),
    ).rejects.toThrow(TableSessionClosureError);

    const summary = await getTableActiveSessionSummary(restaurantId, tableId);
    expect(summary?.canClose).toBe(false);
    expect(summary?.blockingReasons.some((r) => r.includes('counter refund'))).toBe(true);
  });

  it('7. Staff can close a fully completed and settled session; table becomes AVAILABLE', async () => {
    // Complete the counter refund
    await prisma.order.update({
      where: { id: orderA2Id },
      data: {
        refundStatus: 'REFUNDED_AT_COUNTER',
        refundedAtCounterAmount: 10000,
      },
    });

    // All orders now SERVED, all payments PAID/REFUNDED, zero pending refund
    const summaryBefore = await getTableActiveSessionSummary(restaurantId, tableId);
    expect(summaryBefore?.canClose).toBe(true);

    // Close session
    const closeResult = await closeTableSession({
      restaurantId,
      tableId,
      closedByUserId: ownerUserId,
    });

    expect(closeResult.success).toBe(true);
    expect(closeResult.ordersCount).toBe(2);

    // Verify in database: session is closed
    const sessionInDb = await prisma.tableSession.findUniqueOrThrow({
      where: { id: sessionAId },
    });
    expect(sessionInDb.isActive).toBe(false);
    expect(sessionInDb.status).toBe('CLOSED');
    expect(sessionInDb.closedByUserId).toBe(ownerUserId);
    expect(sessionInDb.closedAt).not.toBeNull();

    // Verify physical table is now AVAILABLE
    const tableInDb = await prisma.restaurantTable.findUniqueOrThrow({
      where: { id: tableId },
    });
    expect(tableInDb.status).toBe(TableStatus.AVAILABLE);
  });

  it('8. Old session token (Customer A) cannot access orders after closure', async () => {
    const verifiedSessionA = await verifyActiveTableSession(sessionAToken);
    expect(verifiedSessionA).toBeNull();
  });

  it('9. Customer B scanning the same physical table QR code gets a brand-new session', async () => {
    // Customer B scans table with no prior session
    const sessionBResult = await resolveOrCreateTableSession(restaurantId, tableId);

    expect(sessionBResult.isNew).toBe(true);
    expect(sessionBResult.session.id).not.toBe(sessionAId);
    expect(sessionBResult.session.isActive).toBe(true);
    expect(sessionBResult.session.status).toBe('ACTIVE');

    sessionBToken = sessionBResult.sessionToken;
    sessionBId = sessionBResult.session.id;

    // Table is once again OCCUPIED by Customer B
    const tableInDb = await prisma.restaurantTable.findUniqueOrThrow({
      where: { id: tableId },
    });
    expect(tableInDb.status).toBe(TableStatus.OCCUPIED);
  });

  it('10. Customer B sees empty order list and cannot view Customer A orders or receipt', async () => {
    const verifiedSessionB = await verifyActiveTableSession(sessionBToken);
    expect(verifiedSessionB).not.toBeNull();

    // Customer B calls listSessionOrders: gets 0 orders
    const ordersB = await listSessionOrders(verifiedSessionB!);
    expect(ordersB).toHaveLength(0);

    // Customer B attempts to fetch Customer A's receipt using Customer A's order number
    const receiptResult = await getReceiptData(orderA1Number, {
      sessionToken: sessionBToken,
    });

    expect(receiptResult.success).toBe(false);
    expect((receiptResult as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('11. Scenario A: Simultaneous QR scans on an available table create exactly 1 active session; loser receives TABLE_OCCUPIED (409) with no token leak', async () => {
    const tableA = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        tableNumber: `T-RACE-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });

    const results = await Promise.allSettled([
      resolveOrCreateTableSession(restaurantId, tableA.id),
      resolveOrCreateTableSession(restaurantId, tableA.id),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof resolveOrCreateTableSession>>> =>
        r.status === 'fulfilled',
    );
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winningSession = fulfilled[0].value;
    expect(winningSession.isNew).toBe(true);
    expect(winningSession.sessionToken).toBeDefined();

    const err = rejected[0].reason as TableSessionOccupiedError;
    expect(err).toBeInstanceOf(TableSessionOccupiedError);
    expect(err.code).toBe('TABLE_OCCUPIED');
    expect(err.statusCode).toBe(409);
    // Winner session token must not leak in error message or serialization
    expect(err.message).not.toContain(winningSession.sessionToken);
    expect(JSON.stringify(err)).not.toContain(winningSession.sessionToken);

    // Database verification: exactly 1 ACTIVE session exists for this table
    const activeCount = await prisma.tableSession.count({
      where: {
        restaurantId,
        tableId: tableA.id,
        status: 'ACTIVE',
        isActive: true,
      },
    });
    expect(activeCount).toBe(1);
  });

  it('12. Scenario B: Stale staff closure with expectedSessionId matching closed session is rejected with 409 and newer session remains active', async () => {
    const tableB = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        tableNumber: `T-STALE-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });

    const res1 = await resolveOrCreateTableSession(restaurantId, tableB.id);
    const session1Id = res1.session.id;

    // Staff legitimately closes Session 1
    await closeTableSession({
      restaurantId,
      tableId: tableB.id,
      expectedSessionId: session1Id,
      closedByUserId: ownerUserId,
    });

    // Customer 2 scans QR and starts Session 2
    const res2 = await resolveOrCreateTableSession(restaurantId, tableB.id);
    const session2Id = res2.session.id;
    expect(session2Id).not.toBe(session1Id);

    // Stale staff click from earlier modal submits expectedSessionId: session1Id
    let staleError: unknown;
    try {
      await closeTableSession({
        restaurantId,
        tableId: tableB.id,
        expectedSessionId: session1Id,
        closedByUserId: ownerUserId,
      });
    } catch (e) {
      staleError = e;
    }

    expect(staleError).toBeInstanceOf(TableSessionClosureError);
    const closureErr = staleError as TableSessionClosureError;
    expect(closureErr.code).toBe('SESSION_ALREADY_CLOSED');
    expect(closureErr.statusCode).toBe(409);

    // Verify Session 2 is still ACTIVE in the database
    const session2InDb = await prisma.tableSession.findUniqueOrThrow({
      where: { id: session2Id },
    });
    expect(session2InDb.isActive).toBe(true);
    expect(session2InDb.status).toBe('ACTIVE');
  });

  it('13. Scenario C: Concurrent staff closure requests with expectedSessionId: exactly 1 succeeds, second gets 409 SESSION_ALREADY_CLOSED', async () => {
    const tableC = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        tableNumber: `T-CONC-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });

    const resC = await resolveOrCreateTableSession(restaurantId, tableC.id);
    const sessionCId = resC.session.id;

    // Simulate two staff clicking "Clear Table" at the exact same instant
    const results = await Promise.allSettled([
      closeTableSession({
        restaurantId,
        tableId: tableC.id,
        expectedSessionId: sessionCId,
        closedByUserId: ownerUserId,
      }),
      closeTableSession({
        restaurantId,
        tableId: tableC.id,
        expectedSessionId: sessionCId,
        closedByUserId: ownerUserId,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const err = rejected[0].reason as TableSessionClosureError;
    expect(err).toBeInstanceOf(TableSessionClosureError);
    expect(err.code).toBe('SESSION_ALREADY_CLOSED');
    expect(err.statusCode).toBe(409);

    // Session is closed in DB
    const sessionCInDb = await prisma.tableSession.findUniqueOrThrow({
      where: { id: sessionCId },
    });
    expect(sessionCInDb.status).toBe('CLOSED');
    expect(sessionCInDb.isActive).toBe(false);
  });

  it('14. Scenario D: Order with failed online refund blocks closure and surfaces in session summary', async () => {
    const tableD = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        tableNumber: `T-FREF-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });

    const resD = await resolveOrCreateTableSession(restaurantId, tableD.id);
    const sessionDId = resD.session.id;

    // Create an order in SERVED state with a payment that failed online refund
    await prisma.order.create({
      data: {
        restaurantId,
        tableId: tableD.id,
        sessionId: sessionDId,
        orderNumber: `ORD-FREF-${timestamp.toString().slice(-4)}`,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.ONLINE,
        subtotal: 35000,
        tax: 0,
        total: 35000,
        items: {
          create: {
            nameSnapshot: 'Chicken Biryani',
            priceSnapshot: 35000,
            quantity: 1,
            totalPrice: 35000,
            status: OrderItemStatus.ACTIVE,
          },
        },
        payments: {
          create: {
            restaurantId,
            amount: 35000,
            currency: 'INR',
            method: PaymentMethod.ONLINE,
            status: PaymentStatus.PAID,
            refundStatus: 'FAILED',
            refundAmount: 15000,
            gatewayProvider: 'RAZORPAY',
            gatewayTransactionId: 'pay_test_fref_123',
            paidAt: new Date(),
          },
        },
      },
    });

    // Check summary
    const summary = await getTableActiveSessionSummary(restaurantId, tableD.id);
    expect(summary?.canClose).toBe(false);
    expect(summary?.hasFailedRefunds).toBe(true);
    expect(summary?.failedRefundsCount).toBe(1);
    expect(summary?.blockingReasons.some((r) => r.includes('failed online refund'))).toBe(true);

    // Attempting closure throws TableSessionClosureError
    let closureError: unknown;
    try {
      await closeTableSession({
        restaurantId,
        tableId: tableD.id,
        expectedSessionId: sessionDId,
        closedByUserId: ownerUserId,
      });
    } catch (e) {
      closureError = e;
    }

    expect(closureError).toBeInstanceOf(TableSessionClosureError);
    const err = closureError as TableSessionClosureError;
    expect(err.code).toBe('CANNOT_CLOSE_SESSION');
    expect(err.statusCode).toBe(400);
    expect(err.details?.failedRefunds).toBeDefined();
    expect(err.details?.failedRefunds?.length).toBeGreaterThan(0);
  });

  it('15. Scenario E: Post-closure customer receipt access with receiptToken succeeds while bare sessionToken fails (403)', async () => {
    // Generate scoped receiptToken for Customer A's completed order (from test 1 & 7)
    const receiptToken = await createReceiptToken(orderA1Number, restaurantId);
    expect(receiptToken).toBeDefined();

    // Bare sessionToken of the closed session must fail with UNAUTHORIZED (403)
    const accessWithSession = await getReceiptData(orderA1Number, {
      sessionToken: sessionAToken,
    });
    expect(accessWithSession.success).toBe(false);
    expect((accessWithSession as { code: string }).code).toBe('UNAUTHORIZED');

    // Scoped receiptToken allows customer to view their receipt even after the table session is closed
    const accessWithReceiptToken = await getReceiptData(orderA1Number, {
      receiptToken,
    });
    expect(accessWithReceiptToken.success).toBe(true);
    if (accessWithReceiptToken.success) {
      expect(accessWithReceiptToken.receipt.order.orderNumber).toBe(orderA1Number);
      expect(accessWithReceiptToken.receipt.pricing.total).toBe(50000);
      expect(accessWithReceiptToken.receipt.restaurant.name).toBe(`Lifecycle Bistro ${timestamp}`);
    }
  });

  it('16. Scenario F1: Concurrent order creation and session closure coordinate via row lock: either closure detects order and aborts, or order fails safely with 409', async () => {
    const tableF1 = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        tableNumber: `T-RACEF1-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });

    const sessionRes = await resolveOrCreateTableSession(restaurantId, tableF1.id);
    const verifiedSessionContext = await verifyActiveTableSession(sessionRes.sessionToken);
    expect(verifiedSessionContext).not.toBeNull();

    // Add an initial order that is SERVED and PAID so table is initially eligible for closure
    await prisma.order.create({
      data: {
        restaurantId,
        tableId: tableF1.id,
        sessionId: sessionRes.session.id,
        orderNumber: `ORD-F1-INIT-${timestamp.toString().slice(-4)}`,
        orderStatus: OrderStatus.SERVED,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.ONLINE,
        subtotal: 5000,
        tax: 0,
        total: 5000,
        items: {
          create: {
            nameSnapshot: 'Initial Item',
            priceSnapshot: 5000,
            quantity: 1,
            totalPrice: 5000,
            status: OrderItemStatus.ACTIVE,
          },
        },
      },
    });

    // Fire order creation and session closure concurrently
    const results = await Promise.allSettled([
      createSessionOrder(
        verifiedSessionContext!,
        {
          restaurantSlug,
          idempotencyKey: `idemp-racef1-${timestamp.toString().slice(-4)}`,
          items: [{ menuItemId: testMenuItemId, quantity: 1 }],
        },
      ),
      closeTableSession({
        restaurantId,
        tableId: tableF1.id,
        expectedSessionId: sessionRes.session.id,
        closedByUserId: ownerUserId,
      }),
    ]);

    const orderRes = results[0];
    const closureRes = results[1];

    if (orderRes.status === 'fulfilled') {
      // Case 1: Order creation acquired the row lock first:
      // It committed the PENDING order, so closure MUST have detected the unfulfilled order and rejected
      expect(closureRes.status).toBe('rejected');
      const err = (closureRes as PromiseRejectedResult).reason as TableSessionClosureError;
      expect(err).toBeInstanceOf(TableSessionClosureError);
      expect(err.code).toBe('CANNOT_CLOSE_SESSION');

      // Database state: Session must remain ACTIVE, table must remain OCCUPIED
      const sessionInDb = await prisma.tableSession.findUniqueOrThrow({
        where: { id: sessionRes.session.id },
      });
      expect(sessionInDb.isActive).toBe(true);
      expect(sessionInDb.status).toBe('ACTIVE');

      const tableInDb = await prisma.restaurantTable.findUniqueOrThrow({
        where: { id: tableF1.id },
      });
      expect(tableInDb.status).toBe(TableStatus.OCCUPIED);
    } else {
      // Case 2: Closure acquired the row lock first:
      // Session was closed; order creation must have been safely rejected with 409 SESSION_CLOSED_OR_EXPIRED
      expect(closureRes.status).toBe('fulfilled');
      const err = orderRes.reason as OrderOperationError;
      expect(err).toBeInstanceOf(OrderOperationError);
      expect(err.code).toBe('SESSION_CLOSED_OR_EXPIRED');
      expect(err.statusCode).toBe(409);

      // Database state: Session is CLOSED, table is AVAILABLE
      const sessionInDb = await prisma.tableSession.findUniqueOrThrow({
        where: { id: sessionRes.session.id },
      });
      expect(sessionInDb.isActive).toBe(false);
      expect(sessionInDb.status).toBe('CLOSED');

      const tableInDb = await prisma.restaurantTable.findUniqueOrThrow({
        where: { id: tableF1.id },
      });
      expect(tableInDb.status).toBe(TableStatus.AVAILABLE);

      // Verify no orphaned order was inserted
      const ordersInDb = await prisma.order.findMany({
        where: {
          sessionId: sessionRes.session.id,
          idempotencyKey: `idemp-racef1-${timestamp.toString().slice(-4)}`,
        },
      });
      expect(ordersInDb).toHaveLength(0);
    }
  });

  it('17. Scenario F2: Order creation attempted on a closed session is strictly rejected inside transaction with 409 and creates no order', async () => {
    const tableF2 = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        tableNumber: `T-RACEF2-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });

    const sessionRes = await resolveOrCreateTableSession(restaurantId, tableF2.id);
    const verifiedSessionContext = await verifyActiveTableSession(sessionRes.sessionToken);
    expect(verifiedSessionContext).not.toBeNull();

    // Staff legitimately closes the table session
    await closeTableSession({
      restaurantId,
      tableId: tableF2.id,
      expectedSessionId: sessionRes.session.id,
      closedByUserId: ownerUserId,
    });

    // Customer attempts to place an order with the closed session context
    let orderError: unknown;
    try {
      await createSessionOrder(
        verifiedSessionContext!,
        {
          restaurantSlug,
          idempotencyKey: `idemp-postclose-${timestamp.toString().slice(-4)}`,
          items: [{ menuItemId: testMenuItemId, quantity: 1 }],
        },
      );
    } catch (e) {
      orderError = e;
    }

    expect(orderError).toBeInstanceOf(OrderOperationError);
    const err = orderError as OrderOperationError;
    expect(err.code).toBe('SESSION_CLOSED_OR_EXPIRED');
    expect(err.statusCode).toBe(409);

    // Verify in database: NO order was created for this session
    const orderInDb = await prisma.order.findFirst({
      where: {
        sessionId: sessionRes.session.id,
        idempotencyKey: `idemp-postclose-${timestamp.toString().slice(-4)}`,
      },
    });
    expect(orderInDb).toBeNull();
  });

  it('18. Scenario F3: Closure detects newly committed active order inside transaction and blocks closure, keeping session ACTIVE', async () => {
    const tableF3 = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        tableNumber: `T-RACEF3-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });

    const sessionRes = await resolveOrCreateTableSession(restaurantId, tableF3.id);
    const verifiedSessionContext = await verifyActiveTableSession(sessionRes.sessionToken);
    expect(verifiedSessionContext).not.toBeNull();

    // Customer places an active order
    const orderResult = await createSessionOrder(
      verifiedSessionContext!,
      {
        restaurantSlug,
        idempotencyKey: `idemp-detect-${timestamp.toString().slice(-4)}`,
        items: [{ menuItemId: testMenuItemId, quantity: 1 }],
      },
    );
    expect(orderResult.order.id).toBeDefined();

    // Staff attempts to clear table: must fail because order is PENDING and UNPAID
    let closureError: unknown;
    try {
      await closeTableSession({
        restaurantId,
        tableId: tableF3.id,
        expectedSessionId: sessionRes.session.id,
        closedByUserId: ownerUserId,
      });
    } catch (e) {
      closureError = e;
    }

    expect(closureError).toBeInstanceOf(TableSessionClosureError);
    const err = closureError as TableSessionClosureError;
    expect(err.code).toBe('CANNOT_CLOSE_SESSION');
    expect(err.details?.activeOrders).toContain(orderResult.order.orderNumber);

    // Verify session remains active in DB
    const sessionInDb = await prisma.tableSession.findUniqueOrThrow({
      where: { id: sessionRes.session.id },
    });
    expect(sessionInDb.isActive).toBe(true);
    expect(sessionInDb.status).toBe('ACTIVE');
  });
});

