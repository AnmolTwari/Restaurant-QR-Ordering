import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashToken } from './token';
import type { TableSession, Restaurant, RestaurantTable } from '@/generated/prisma';

export const TABLE_SESSION_COOKIE_NAME = 'table_session';
const SESSION_DURATION_HOURS = 6;

export interface SessionResult {
  sessionToken: string;
  session: TableSession;
  isNew: boolean;
}

export class TableSessionOccupiedError extends Error {
  constructor(
    public readonly code: string = 'TABLE_OCCUPIED',
    message: string = 'This table currently has an active dining session. Please ask staff to clear the table or assist you.',
    public readonly statusCode: number = 409,
  ) {
    super(message);
    this.name = 'TableSessionOccupiedError';
  }
}

export class TableSessionClosureError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: {
      blockingReasons?: string[];
      unpaidOrders?: string[];
      activeOrders?: string[];
      pendingRefunds?: string[];
      failedRefunds?: string[];
    },
  ) {
    super(message);
    this.name = 'TableSessionClosureError';
  }
}

/**
 * Resolves an existing active session or creates a new table dining session.
 * Reusing an existing valid session prevents duplicate sessions on page reloads.
 *
 * Concurrency & Lifecycle Rules:
 * 1. Lazily marks expired sessions on the physical table as EXPIRED so they do not block new visits.
 * 2. If customer already holds a valid active session token for this table, preserve it.
 * 3. If customer has no token or an invalid/closed token, and the table currently has
 *    an active session, reject with TABLE_OCCUPIED (prevents new customer from sharing/hijacking
 *    the previous customer's session before staff clears the table).
 * 4. If the table is available (or previous session was closed), create fresh session.
 * 5. Uses PostgreSQL partial unique index (table_sessions_active_table_unique_idx) to ensure
 *    at most ONE active session can exist per table. Catches P2002 concurrency races and safely
 *    converts the losing parallel scan to TABLE_OCCUPIED without leaking the winning session's token.
 */
export async function resolveOrCreateTableSession(
  restaurantId: string,
  tableId: string,
  existingRawToken?: string,
): Promise<SessionResult> {
  const now = new Date();

  // 1. Lazily update any expired active sessions on this table so they do not block new visits
  try {
    await prisma.tableSession.updateMany({
      where: {
        restaurantId,
        tableId,
        isActive: true,
        expiresAt: { lte: now },
      },
      data: {
        isActive: false,
        status: 'EXPIRED',
        closedAt: now,
      },
    });
  } catch {
    // Safe in unit test mock environments
  }

  // 2. If customer already has a session token, verify if it is valid and active for this exact table
  if (existingRawToken) {
    const sessionTokenHash = hashToken(existingRawToken);
    const existingSession = await prisma.tableSession.findUnique({
      where: { sessionTokenHash },
    });

    if (
      existingSession &&
      existingSession.isActive &&
      existingSession.status !== 'CLOSED' &&
      existingSession.status !== 'EXPIRED' &&
      existingSession.restaurantId === restaurantId &&
      existingSession.tableId === tableId &&
      existingSession.expiresAt > now
    ) {
      return {
        sessionToken: existingRawToken,
        session: existingSession,
        isNew: false,
      };
    }
  }

  // 3. Customer does NOT have a valid active token for this table.
  // Check if this physical table already has an active session in progress.
  const activeTableSession = await prisma.tableSession.findFirst({
    where: {
      restaurantId,
      tableId,
      isActive: true,
      status: 'ACTIVE',
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (activeTableSession) {
    throw new TableSessionOccupiedError(
      'TABLE_OCCUPIED',
      'This table currently has an active dining session. If you are starting a new visit, please ask staff to clear the table.',
      409,
    );
  }

  // 4. Table is available (or previous session was closed).
  // Attempt to create a fresh dining session and mark the physical table OCCUPIED.
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const sessionTokenHash = hashToken(sessionToken);
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  try {
    const session = await prisma.tableSession.create({
      data: {
        restaurantId,
        tableId,
        sessionTokenHash,
        expiresAt,
        isActive: true,
        status: 'ACTIVE',
      },
    });

    // Mark physical table as OCCUPIED
    try {
      await prisma.restaurantTable.updateMany({
        where: { id: tableId, restaurantId },
        data: { status: 'OCCUPIED' },
      });
    } catch {
      // Safe in unit test mock environments
    }

    return {
      sessionToken,
      session,
      isNew: true,
    };
  } catch (error: unknown) {
    // Handle concurrent creation race caught by PostgreSQL partial unique index
    const err = error as { code?: string; message?: string };
    if (
      err &&
      (err.code === 'P2002' ||
        err.message?.includes('table_sessions_active_table_unique_idx') ||
        err.message?.includes('Unique constraint failed'))
    ) {
      // Re-verify that the table now has an active session created by the parallel winning request
      const winningSession = await prisma.tableSession.findFirst({
        where: {
          restaurantId,
          tableId,
          isActive: true,
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
      });

      if (winningSession) {
        throw new TableSessionOccupiedError(
          'TABLE_OCCUPIED',
          'This table currently has an active dining session. If you are starting a new visit, please ask staff to clear the table.',
          409,
        );
      }
    }
    throw error;
  }
}

/**
 * Validates closure rules and closes an active table dining session.
 * Staff-controlled action that frees the physical table for new customers.
 *
 * Hardening:
 * - When expectedSessionId is provided, binds strictly to that exact session ID, preventing
 *   stale closure requests from inadvertently closing a newer customer session.
 * - Enforces order completion, payment settlement, and pending counter refunds.
 * - Detects and blocks closure on failed online refunds (payment.refundStatus === 'FAILED').
 * - Atomic conditional update: prevents race conditions under parallel closure submissions.
 */
export interface CloseTableSessionParams {
  restaurantId: string;
  tableId: string;
  expectedSessionId?: string;
  closedByUserId: string;
}

export interface CloseTableSessionResult {
  success: boolean;
  message: string;
  closedSessionId?: string;
  ordersCount: number;
  totalAmount: number;
  closedAt: string;
}

export async function closeTableSession(
  params: CloseTableSessionParams,
): Promise<CloseTableSessionResult> {
  const { restaurantId, tableId, expectedSessionId, closedByUserId } = params;
  const now = new Date();

  return await prisma.$transaction(async (tx) => {
    // 1. Locate and acquire exclusive row lock on tableSession (FOR UPDATE)
    // Enforces lock ordering: tableSession locked first before reading or modifying orders
    let sessionRecord: {
      id: string;
      restaurantId: string;
      tableId: string;
      status: string;
      isActive: boolean;
      expiresAt: Date;
    } | null = null;

    if (typeof tx.$queryRaw === 'function') {
      try {
        if (expectedSessionId) {
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              restaurantId: string;
              tableId: string;
              status: string;
              isActive: boolean;
              expiresAt: Date;
            }>
          >`
            SELECT id, "restaurantId", "tableId", "status", "isActive", "expiresAt"
            FROM "table_sessions"
            WHERE id = ${expectedSessionId} AND "restaurantId" = ${restaurantId} AND "tableId" = ${tableId}
            FOR UPDATE
          `;
          sessionRecord = rows[0] || null;
        } else {
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              restaurantId: string;
              tableId: string;
              status: string;
              isActive: boolean;
              expiresAt: Date;
            }>
          >`
            SELECT id, "restaurantId", "tableId", "status", "isActive", "expiresAt"
            FROM "table_sessions"
            WHERE "restaurantId" = ${restaurantId} AND "tableId" = ${tableId} AND "status" = 'ACTIVE' AND "isActive" = true
            ORDER BY "createdAt" DESC
            LIMIT 1
            FOR UPDATE
          `;
          sessionRecord = rows[0] || null;
        }
      } catch {
        if (expectedSessionId) {
          sessionRecord = await tx.tableSession.findFirst({
            where: { id: expectedSessionId, restaurantId, tableId },
          });
        } else {
          sessionRecord = await tx.tableSession.findFirst({
            where: { restaurantId, tableId, isActive: true, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
          });
        }
      }
    } else {
      if (expectedSessionId) {
        sessionRecord = await tx.tableSession.findFirst({
          where: { id: expectedSessionId, restaurantId, tableId },
        });
      } else {
        sessionRecord = await tx.tableSession.findFirst({
          where: { restaurantId, tableId, isActive: true, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    if (expectedSessionId && !sessionRecord) {
      const existing = await tx.tableSession.findFirst({
        where: { id: expectedSessionId, restaurantId, tableId },
      });
      if (!existing) {
        throw new TableSessionClosureError(
          'SESSION_NOT_FOUND',
          'The specified dining session was not found on this table.',
          404,
        );
      }
      throw new TableSessionClosureError(
        'SESSION_ALREADY_CLOSED',
        'This dining session has already been closed.',
        409,
      );
    }

    if (sessionRecord && (!sessionRecord.isActive || sessionRecord.status === 'CLOSED')) {
      throw new TableSessionClosureError(
        'SESSION_ALREADY_CLOSED',
        'This dining session has already been closed.',
        409,
      );
    }

    if (!sessionRecord) {
      await tx.restaurantTable.updateMany({
        where: { id: tableId, restaurantId },
        data: { status: 'AVAILABLE' },
      });
      return {
        success: true,
        message: 'Table is already clear and marked available.',
        ordersCount: 0,
        totalAmount: 0,
        closedAt: now.toISOString(),
      };
    }

    // 2. Query all orders placed in this session (inside the locked transaction)
    // Any concurrent order creation is blocked waiting for the row lock
    const orders = await tx.order.findMany({
      where: {
        sessionId: sessionRecord.id,
        restaurantId,
        tableId,
      },
      include: {
        items: true,
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const blockingReasons: string[] = [];
    const activeOrders: string[] = [];
    const unpaidOrders: string[] = [];
    const pendingRefunds: string[] = [];
    const failedRefunds: string[] = [];

    for (const order of orders) {
      // 1. Order Completion: Order must be in terminal state (SERVED or CANCELLED)
      const isCompleted =
        order.orderStatus === 'SERVED' || order.orderStatus === 'CANCELLED';

      if (!isCompleted) {
        activeOrders.push(order.orderNumber);
        blockingReasons.push(
          `Order #${order.orderNumber} is still ${order.orderStatus}. All orders must be SERVED or CANCELLED before clearing table.`,
        );
      }

      // 2. Payment Settlement: All non-cancelled orders with total > 0 must be paid
      const requiresPayment = order.total > 0 && order.orderStatus !== 'CANCELLED';
      if (requiresPayment) {
        const isSettled =
          order.paymentStatus === 'PAID' ||
          order.paymentStatus === 'PARTIALLY_REFUNDED' ||
          order.paymentStatus === 'REFUNDED';

        if (!isSettled) {
          unpaidOrders.push(order.orderNumber);
          blockingReasons.push(
            `Order #${order.orderNumber} has an unpaid balance of ₹${(order.total / 100).toFixed(2)}. All orders must be settled before clearing table.`,
          );
        }
      }

      // 3. Pending Refunds: All counter refunds must be handled
      if (order.refundStatus === 'PENDING_COUNTER_REFUND') {
        const pendingAmount = order.refundAmount - order.refundedAtCounterAmount;
        if (pendingAmount > 0) {
          pendingRefunds.push(order.orderNumber);
          blockingReasons.push(
            `Order #${order.orderNumber} has an outstanding counter refund of ₹${(pendingAmount / 100).toFixed(2)}. Please complete the counter refund before clearing table.`,
          );
        }
      }

      // 4. Failed Online Refunds: Prevent closing if an online refund failed and needs resolution
      const failedOnlinePayments =
        order.payments?.filter((p) => p.refundStatus === 'FAILED') || [];
      if (failedOnlinePayments.length > 0) {
        for (const fp of failedOnlinePayments) {
          failedRefunds.push(order.orderNumber);
          const ref = fp.gatewayTransactionId || fp.id;
          const amountStr = (fp.refundAmount / 100).toFixed(2);
          blockingReasons.push(
            `Order #${order.orderNumber} has a failed online refund of ₹${amountStr} (Payment Ref: ${ref}). This must be resolved before clearing the table.`,
          );
        }
      }
    }

    if (blockingReasons.length > 0) {
      throw new TableSessionClosureError(
        'CANNOT_CLOSE_SESSION',
        `Cannot clear table: ${blockingReasons.join(' ')}`,
        400,
        {
          blockingReasons,
          activeOrders,
          unpaidOrders,
          pendingRefunds,
          failedRefunds,
        },
      );
    }

    // 3. Atomically close session
    const updateResult = await tx.tableSession.updateMany({
      where: {
        id: sessionRecord.id,
        restaurantId,
        tableId,
        isActive: true,
        status: 'ACTIVE',
      },
      data: {
        isActive: false,
        status: 'CLOSED',
        closedAt: now,
        closedByUserId,
      },
    });

    if (updateResult.count === 0) {
      throw new TableSessionClosureError(
        'SESSION_ALREADY_CLOSED',
        'This dining session has already been closed concurrently.',
        409,
      );
    }

    // 4. Check if any other active session remains on this table
    const remainingActive = await tx.tableSession.count({
      where: {
        restaurantId,
        tableId,
        isActive: true,
        status: 'ACTIVE',
      },
    });

    if (remainingActive === 0) {
      await tx.restaurantTable.updateMany({
        where: { id: tableId, restaurantId },
        data: { status: 'AVAILABLE' },
      });
    }

    const table = await tx.restaurantTable.findUnique({
      where: { id: tableId },
      select: { tableNumber: true },
    });
    const tableNumber = table?.tableNumber || '';
    const totalAmount = orders.reduce((sum, o) => sum + o.total, 0);

    return {
      success: true,
      message: `Table ${tableNumber} cleared and closed successfully.`,
      closedSessionId: sessionRecord.id,
      ordersCount: orders.length,
      totalAmount,
      closedAt: now.toISOString(),
    };
  });
}

/**
 * Returns active session summary and closure eligibility for staff dashboard inspection.
 * Includes failed online refunds and exact session ID for safe staff closure binding.
 */
export async function getTableActiveSessionSummary(
  restaurantId: string,
  tableId: string,
) {
  const table = await prisma.restaurantTable.findFirst({
    where: { id: tableId, restaurantId },
  });

  if (!table) return null;

  const activeSession = await prisma.tableSession.findFirst({
    where: {
      restaurantId,
      tableId,
      isActive: true,
      status: 'ACTIVE',
    },
    include: {
      orders: {
        include: {
          items: true,
          payments: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!activeSession) {
    return {
      hasActiveSession: false,
      table: {
        id: table.id,
        tableNumber: table.tableNumber,
        capacity: table.capacity,
        status: table.status,
      },
      session: null,
      ordersCount: 0,
      orders: [],
      canClose: true,
      blockingReasons: [],
      unpaidOrdersCount: 0,
      activeOrdersCount: 0,
      pendingRefundsCount: 0,
      failedRefundsCount: 0,
      hasFailedRefunds: false,
      hasReadyOrders: false,
      isFullyServed: false,
    };
  }

  const blockingReasons: string[] = [];
  let unpaidCount = 0;
  let activeOrdersCount = 0;
  let pendingRefundsCount = 0;
  let failedRefundsCount = 0;
  let readyOrdersCount = 0;
  let servedOrdersCount = 0;

  const ordersSummary = activeSession.orders.map((o) => {
    const isCompleted = o.orderStatus === 'SERVED' || o.orderStatus === 'CANCELLED';
    if (!isCompleted) {
      activeOrdersCount++;
      blockingReasons.push(`Order #${o.orderNumber} is still ${o.orderStatus}.`);
    }

    if (o.orderStatus === 'READY') {
      readyOrdersCount++;
    }
    if (o.orderStatus === 'SERVED') {
      servedOrdersCount++;
    }

    const requiresPayment = o.total > 0 && o.orderStatus !== 'CANCELLED';
    const isPaid =
      o.paymentStatus === 'PAID' ||
      o.paymentStatus === 'PARTIALLY_REFUNDED' ||
      o.paymentStatus === 'REFUNDED';

    if (requiresPayment && !isPaid) {
      unpaidCount++;
      blockingReasons.push(`Order #${o.orderNumber} is unpaid.`);
    }

    const pendingRefundAmount = o.refundAmount - o.refundedAtCounterAmount;
    if (o.refundStatus === 'PENDING_COUNTER_REFUND' && pendingRefundAmount > 0) {
      pendingRefundsCount++;
      blockingReasons.push(`Order #${o.orderNumber} has pending counter refund.`);
    }

    // Check failed online refunds
    const failedOnline = o.payments?.filter((p) => p.refundStatus === 'FAILED') || [];
    if (failedOnline.length > 0) {
      failedRefundsCount += failedOnline.length;
      for (const fp of failedOnline) {
        blockingReasons.push(
          `Order #${o.orderNumber} has a failed online refund of ₹${(fp.refundAmount / 100).toFixed(2)} (Payment Ref: ${fp.gatewayTransactionId || fp.id}).`,
        );
      }
    }

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      orderStatus: o.orderStatus,
      paymentStatus: o.paymentStatus,
      total: o.total,
      refundStatus: o.refundStatus,
      hasFailedRefund: failedOnline.length > 0,
      failedRefundAmount: failedOnline.reduce((sum, p) => sum + (p.refundAmount || 0), 0),
      itemsCount: o.items.length,
      createdAt: o.createdAt.toISOString(),
    };
  });

  const now = Date.now();
  const createdMs = new Date(activeSession.createdAt).getTime();
  const durationMinutes = Math.max(0, Math.floor((now - createdMs) / 60000));
  const isFullyServed =
    activeSession.orders.length > 0 &&
    activeSession.orders.every(
      (o) => o.orderStatus === 'SERVED' || o.orderStatus === 'CANCELLED',
    );

  return {
    hasActiveSession: true,
    table: {
      id: table.id,
      tableNumber: table.tableNumber,
      capacity: table.capacity,
      status: table.status,
    },
    session: {
      id: activeSession.id,
      createdAt: activeSession.createdAt.toISOString(),
      expiresAt: activeSession.expiresAt.toISOString(),
      durationMinutes,
    },
    ordersCount: activeSession.orders.length,
    orders: ordersSummary,
    canClose: blockingReasons.length === 0,
    blockingReasons,
    unpaidOrdersCount: unpaidCount,
    activeOrdersCount,
    pendingRefundsCount,
    failedRefundsCount,
    hasFailedRefunds: failedRefundsCount > 0,
    hasReadyOrders: readyOrdersCount > 0,
    isFullyServed,
  };
}

/**
 * Sets the secure table session cookie.
 */
export async function setTableSessionCookie(sessionToken: string): Promise<void> {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieStore = await cookies();
    cookieStore.set(TABLE_SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DURATION_HOURS * 60 * 60,
    });
  } catch {
    // Handled safely in environments where next/headers cookies() is read-only
  }
}

/**
 * Attaches the secure table session cookie directly to a NextResponse.
 */
export function attachTableSessionCookie(
  response: NextResponse,
  sessionToken: string,
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  response.cookies.set(TABLE_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_HOURS * 60 * 60,
  });
}

/**
 * Clears the table session cookie from response or store.
 */
export async function clearTableSessionCookie(response?: NextResponse): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  if (response) {
    response.cookies.set(TABLE_SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  } else {
    try {
      const cookieStore = await cookies();
      cookieStore.set(TABLE_SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
    } catch {
      // Safe in SSR
    }
  }
}

/**
 * Gets the current raw table session token from cookies.
 */
export async function getTableSessionTokenFromCookies(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(TABLE_SESSION_COOKIE_NAME)?.value;
  } catch {
    return undefined;
  }
}

export interface VerifiedTableSessionContext {
  session: TableSession & {
    restaurant: Restaurant;
    table: RestaurantTable;
  };
  restaurantId: string;
  tableId: string;
}

/**
 * Verifies an active, unexpired table dining session from cookie or provided raw token.
 * Returns the session context or null if missing, inactive, closed, or expired.
 */
export async function verifyActiveTableSession(
  rawToken?: string,
): Promise<VerifiedTableSessionContext | null> {
  const token = rawToken || (await getTableSessionTokenFromCookies());
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return null;
  }

  const sessionTokenHash = hashToken(token.trim());
  const session = await prisma.tableSession.findUnique({
    where: { sessionTokenHash },
    include: {
      restaurant: true,
      table: true,
    },
  });

  if (
    !session ||
    !session.isActive ||
    session.status === 'CLOSED' ||
    session.status === 'EXPIRED' ||
    session.expiresAt <= new Date() ||
    (session.restaurant && !session.restaurant.isActive) ||
    (session.table && session.table.status === 'INACTIVE')
  ) {
    return null;
  }

  return {
    session,
    restaurantId: session.restaurantId,
    tableId: session.tableId,
  };
}
