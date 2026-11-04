import { prisma } from '@/lib/prisma';
import { verifyActiveTableSession } from '@/lib/qr/session';
import { getCurrentUser } from '@/lib/auth/session';
import { createReceiptToken, verifyReceiptToken } from './receipt-token';

export interface ReceiptData {
  restaurant: {
    name: string;
    slug: string;
    phone: string | null;
    address: string | null;
    legalName?: string | null;
    gstin?: string | null;
    state?: string | null;
    stateCode?: string | null;
  };
  order: {
    orderNumber: string;
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    createdAt: string;
    orderStatus: string;
    paymentStatus: string;
    paymentMethod: string;
    tableNumber: string;
  };
  payment: {
    id: string;
    amount: number;
    method: string;
    status: string;
    gatewayProvider: string | null;
    transactionReference: string | null;
    paidAt: string | null;
  } | null;
  items: Array<{
    id: string;
    name: string;
    unitPrice: number;
    quantity: number;
    totalPrice: number;
    notes: string | null;
  }>;
  pricing: {
    subtotal: number;
    discountAmount: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    tax: number;
    serviceCharge: number;
    packagingCharge: number;
    customCharge: number;
    total: number;
    isTaxInclusive: boolean;
    currency: string;
  };
  receiptToken?: string;
  disclaimer: string;
}

export type ReceiptResult =
  | { success: true; receipt: ReceiptData }
  | { success: false; error: string; code: 'NOT_FOUND' | 'UNAUTHORIZED' | 'SERVER_ERROR' };

export interface GetReceiptOptions {
  sessionToken?: string;
  receiptToken?: string;
}

/**
 * Server-side helper to load verified, tenant-isolated receipt data.
 * Checks active guest dining session, authenticated staff membership,
 * or a narrowly scoped, cryptographic receiptToken.
 */
export async function getReceiptData(
  orderNumber: string,
  options?: GetReceiptOptions | string,
): Promise<ReceiptResult> {
  const opts: GetReceiptOptions =
    typeof options === 'string'
      ? { sessionToken: options }
      : options || {};
  try {
    const normalizedOrderNumber = orderNumber.toUpperCase();

    const order = await prisma.order.findFirst({
      where: { orderNumber: normalizedOrderNumber },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            phone: true,
            address: true,
            currency: true,
            billingConfig: true,
          },
        },
        invoice: true,
        table: {
          select: {
            id: true,
            tableNumber: true,
          },
        },
        items: {
          select: {
            id: true,
            nameSnapshot: true,
            priceSnapshot: true,
            quantity: true,
            totalPrice: true,
            notes: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        payments: {
          where: { status: 'PAID' },
          select: {
            id: true,
            method: true,
            status: true,
            amount: true,
            gatewayProvider: true,
            gatewayTransactionId: true,
            paidAt: true,
          },
          orderBy: { paidAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      return { success: false, error: 'Order not found.', code: 'NOT_FOUND' };
    }

    // Authorization check
    let isAuthorized = false;

    // 1. Check table dining session (cookie or sessionToken)
    const guestSession = await verifyActiveTableSession(opts.sessionToken);
    if (
      guestSession &&
      guestSession.restaurantId === order.restaurantId &&
      guestSession.tableId === order.tableId &&
      guestSession.session.id === order.sessionId
    ) {
      isAuthorized = true;
    }

    // 2. Check staff auth (staff session cookie)
    if (!isAuthorized) {
      const staffUser = await getCurrentUser();
      if (staffUser) {
        const membership = await prisma.restaurantMembership.findFirst({
          where: {
            userId: staffUser.id,
            restaurantId: order.restaurantId,
            isActive: true,
          },
        });
        if (membership) {
          isAuthorized = true;
        }
      }
    }

    // 3. Check scoped receipt token (least-privilege read access)
    if (!isAuthorized && opts.receiptToken) {
      const tokenCheck = await verifyReceiptToken(
        opts.receiptToken,
        normalizedOrderNumber,
      );
      if (tokenCheck.valid && tokenCheck.restaurantId === order.restaurantId) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return {
        success: false,
        error:
          'You are not authorized to view this receipt. A valid dining session, staff login, or receipt token is required.',
        code: 'UNAUTHORIZED',
      };
    }

    const latestPayment = order.payments[0] || null;
    const config = order.restaurant.billingConfig;
    const snapshot = (order.billingSnapshot || order.invoice?.billingSnapshot) as Record<string, unknown> | null;

    const legalName = (snapshot?.legalName as string) || config?.legalName || order.restaurant.name;
    const displayName = (snapshot?.displayName as string) || config?.displayName || order.restaurant.name;
    const gstin = (snapshot?.gstin as string) || config?.gstin || null;
    const state = (snapshot?.state as string) || config?.state || null;
    const stateCode = (snapshot?.stateCode as string) || config?.stateCode || null;

    const receipt: ReceiptData = {
      restaurant: {
        name: displayName,
        slug: order.restaurant.slug,
        phone: order.restaurant.phone,
        address: order.restaurant.address,
        legalName,
        gstin,
        state,
        stateCode,
      },
      order: {
        orderNumber: order.orderNumber,
        invoiceNumber: order.invoice?.invoiceNumber || order.invoiceNumber || null,
        invoiceDate: order.invoice?.generatedAt ? order.invoice.generatedAt.toISOString() : null,
        createdAt: order.createdAt.toISOString(),
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        tableNumber: order.table.tableNumber,
      },
      payment: latestPayment
        ? {
            id: latestPayment.id,
            amount: latestPayment.amount,
            method: latestPayment.method,
            status: latestPayment.status,
            gatewayProvider: latestPayment.gatewayProvider,
            transactionReference: latestPayment.gatewayTransactionId,
            paidAt: latestPayment.paidAt ? latestPayment.paidAt.toISOString() : null,
          }
        : null,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.nameSnapshot,
        unitPrice: item.priceSnapshot,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        notes: item.notes,
      })),
      pricing: {
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        taxableAmount: order.taxableAmount,
        cgst: order.cgst,
        sgst: order.sgst,
        igst: order.igst,
        tax: order.tax,
        serviceCharge: order.serviceCharge,
        packagingCharge: order.packagingCharge,
        customCharge: order.customCharge,
        total: order.total,
        isTaxInclusive: Boolean(snapshot?.taxInclusive || config?.taxInclusive),
        currency: order.restaurant.currency || 'INR',
      },
      receiptToken: await createReceiptToken(order.orderNumber, order.restaurantId),
      disclaimer: gstin
        ? 'Tax Invoice issued in accordance with applicable Goods and Services Tax (GST) rules.'
        : 'This bill is a customer proof of payment and order summary. Not a tax invoice under GST.',
    };

    return { success: true, receipt };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error';
    return { success: false, error: message, code: 'SERVER_ERROR' };
  }
}
