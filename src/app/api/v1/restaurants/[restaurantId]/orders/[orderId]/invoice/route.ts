import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import {
  getOrGenerateInvoiceForOrder,
  buildWhatsAppShareUrl,
} from '@/lib/billing/billing-engine';
import { createReceiptToken } from '@/lib/orders/receipt-token';
import { formatMoney } from '@/lib/formatters';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    restaurantId: string;
    orderId: string;
  }>;
}

const GenerateInvoiceSchema = z.object({
  customerPhone: z.string().max(25).optional().nullable(),
});

/**
 * POST /api/v1/restaurants/[restaurantId]/orders/[orderId]/invoice
 * Generates or retrieves an authoritative tax invoice for an order.
 * Prevents duplicate invoice assignment.
 */
export async function POST(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
      UserRole.CASHIER,
      UserRole.WAITER,
    ]);

    const body = await req.json().catch(() => ({}));
    const validated = GenerateInvoiceSchema.parse(body);

    const invoice = await getOrGenerateInvoiceForOrder({
      restaurantId: restaurant.id,
      orderId: params.orderId,
      customerPhone: validated.customerPhone,
    });

    const receiptToken = await createReceiptToken(
      invoice.order.orderNumber,
      restaurant.id,
    );

    const origin = req.nextUrl.origin;
    const billUrl = `${origin}/m/${restaurant.slug}/receipt/${invoice.order.orderNumber}?receiptToken=${receiptToken}`;

    const whatsappUrl = buildWhatsAppShareUrl({
      phone: validated.customerPhone || invoice.customerPhone,
      restaurantName: restaurant.name,
      orderNumber: invoice.order.orderNumber,
      invoiceNumber: invoice.invoiceNumber,
      totalFormatted: formatMoney(invoice.totalAmount, invoice.currency),
      billUrl,
    });

    return apiSuccess({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderNumber: invoice.order.orderNumber,
        tableNumber: invoice.order.table.tableNumber,
        subtotal: invoice.subtotal,
        discountAmount: invoice.discountAmount,
        taxableAmount: invoice.taxableAmount,
        cgst: invoice.cgst,
        sgst: invoice.sgst,
        igst: invoice.igst,
        totalTax: invoice.totalTax,
        serviceCharge: invoice.serviceCharge,
        packagingCharge: invoice.packagingCharge,
        customCharge: invoice.customCharge,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
        paymentStatus: invoice.order.paymentStatus,
        paymentMethod: invoice.order.paymentMethod,
        generatedAt: invoice.generatedAt.toISOString(),
        customerPhone: invoice.customerPhone,
        billingSnapshot: invoice.billingSnapshot,
      },
      billUrl,
      whatsappUrl,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/v1/restaurants/[restaurantId]/orders/[orderId]/invoice
 * Retrieves existing invoice if present.
 */
export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
      UserRole.CASHIER,
      UserRole.WAITER,
    ]);

    const invoice = await getOrGenerateInvoiceForOrder({
      restaurantId: restaurant.id,
      orderId: params.orderId,
    });

    const receiptToken = await createReceiptToken(
      invoice.order.orderNumber,
      restaurant.id,
    );

    const origin = req.nextUrl.origin;
    const billUrl = `${origin}/m/${restaurant.slug}/receipt/${invoice.order.orderNumber}?receiptToken=${receiptToken}`;

    const whatsappUrl = buildWhatsAppShareUrl({
      phone: invoice.customerPhone,
      restaurantName: restaurant.name,
      orderNumber: invoice.order.orderNumber,
      invoiceNumber: invoice.invoiceNumber,
      totalFormatted: formatMoney(invoice.totalAmount, invoice.currency),
      billUrl,
    });

    return apiSuccess({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderNumber: invoice.order.orderNumber,
        tableNumber: invoice.order.table.tableNumber,
        subtotal: invoice.subtotal,
        discountAmount: invoice.discountAmount,
        taxableAmount: invoice.taxableAmount,
        cgst: invoice.cgst,
        sgst: invoice.sgst,
        igst: invoice.igst,
        totalTax: invoice.totalTax,
        serviceCharge: invoice.serviceCharge,
        packagingCharge: invoice.packagingCharge,
        customCharge: invoice.customCharge,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
        paymentStatus: invoice.order.paymentStatus,
        paymentMethod: invoice.order.paymentMethod,
        generatedAt: invoice.generatedAt.toISOString(),
        customerPhone: invoice.customerPhone,
        billingSnapshot: invoice.billingSnapshot,
      },
      billUrl,
      whatsappUrl,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
