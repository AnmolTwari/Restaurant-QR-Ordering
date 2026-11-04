import React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  AlertCircle,
  Receipt as ReceiptIcon,
  ArrowLeft,
  FileText,
} from 'lucide-react';
import { formatMoney } from '@/lib/formatters';
import { getReceiptData } from '@/lib/orders/receipt';
import { ReceiptActions } from '@/components/receipt/ReceiptActions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    slug: string;
    orderNumber: string;
  }>;
  searchParams?: Promise<{
    receiptToken?: string;
  }>;
}

export default async function CustomerReceiptPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const result = await getReceiptData(params.orderNumber, {
    receiptToken: searchParams?.receiptToken,
  });

  if (!result.success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-sm w-full text-center">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Receipt Unavailable</h2>
          <p className="text-sm text-slate-600 mb-6">{result.error}</p>
          <Link
            href={`/m/${params.slug}`}
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Menu
          </Link>
        </div>
      </div>
    );
  }

  const receipt = result.receipt;
  const isPaid = receipt.order.paymentStatus === 'PAID';
  const isRefunded =
    receipt.order.paymentStatus === 'REFUNDED' ||
    receipt.order.paymentStatus === 'PARTIALLY_REFUNDED';
  const currency = receipt.pricing.currency || 'INR';

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 sm:px-6">
      {/* Top action bar with WhatsApp share */}
      <ReceiptActions
        restaurantSlug={params.slug}
        restaurantName={receipt.restaurant.name}
        orderNumber={receipt.order.orderNumber}
        invoiceNumber={receipt.order.invoiceNumber}
        totalFormatted={formatMoney(receipt.pricing.total, currency)}
      />

      {/* Main Printable Bill / Invoice Card */}
      <div
        id="printable-receipt"
        className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 print:border-none print:shadow-none print:p-0 print:max-w-none text-slate-800"
      >
        {/* Header with Business & GST details */}
        <div className="text-center pb-6 border-b border-dashed border-slate-300">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mx-auto mb-2 print:hidden">
            <ReceiptIcon className="w-6 h-6" />
          </div>

          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {receipt.restaurant.name}
          </h1>

          {receipt.restaurant.legalName &&
            receipt.restaurant.legalName !== receipt.restaurant.name && (
              <p className="text-xs text-slate-500 font-medium">
                ({receipt.restaurant.legalName})
              </p>
            )}

          {receipt.restaurant.gstin && (
            <div className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-mono text-slate-700">
              <span className="font-semibold text-slate-900">GSTIN:</span>
              <span>{receipt.restaurant.gstin}</span>
            </div>
          )}

          {receipt.restaurant.address && (
            <p className="text-xs text-slate-500 mt-1.5 flex items-center justify-center gap-1">
              <MapPin className="w-3 h-3 inline print:hidden text-slate-400" />
              {receipt.restaurant.address}
              {receipt.restaurant.state && `, ${receipt.restaurant.state}`}
              {receipt.restaurant.stateCode && ` (Code: ${receipt.restaurant.stateCode})`}
            </p>
          )}

          {receipt.restaurant.phone && (
            <p className="text-xs text-slate-500 flex items-center justify-center gap-1 mt-0.5">
              <Phone className="w-3 h-3 inline print:hidden text-slate-400" />
              {receipt.restaurant.phone}
            </p>
          )}
        </div>

        {/* Invoice & Order Meta */}
        <div className="py-4 border-b border-dashed border-slate-300 text-xs grid grid-cols-2 gap-y-2">
          {receipt.order.invoiceNumber ? (
            <div>
              <span className="text-slate-500 block">Invoice No</span>
              <span className="font-mono font-bold text-slate-900 text-xs">
                {receipt.order.invoiceNumber}
              </span>
            </div>
          ) : (
            <div>
              <span className="text-slate-500 block">Order Ref</span>
              <span className="font-semibold text-slate-900">
                #{receipt.order.orderNumber}
              </span>
            </div>
          )}

          <div className="text-right">
            <span className="text-slate-500 block">Table</span>
            <span className="font-semibold text-slate-900">
              Table {receipt.order.tableNumber}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block">Date & Time</span>
            <span className="text-slate-700">
              {new Date(receipt.order.createdAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}{' '}
              {new Date(receipt.order.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="text-right">
            <span className="text-slate-500 block">Payment Status</span>
            <span
              className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full text-[10px] ${
                isPaid
                  ? 'bg-emerald-50 text-emerald-700'
                  : isRefunded
                  ? 'bg-purple-50 text-purple-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {isPaid ? (
                <>
                  <CheckCircle2 className="w-3 h-3 inline" />
                  PAID (CASH)
                </>
              ) : isRefunded ? (
                <>
                  <CheckCircle2 className="w-3 h-3 inline" />
                  {receipt.order.paymentStatus}
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3 inline" />
                  UNPAID
                </>
              )}
            </span>
          </div>

          {receipt.order.invoiceNumber && (
            <div className="col-span-2 pt-1 border-t border-slate-100 flex items-center justify-between">
              <span className="text-slate-500">Order Reference:</span>
              <span className="font-mono font-medium text-slate-700">
                #{receipt.order.orderNumber}
              </span>
            </div>
          )}

          {receipt.payment?.transactionReference && (
            <div className="col-span-2 pt-1 border-t border-slate-100">
              <span className="text-slate-500">Txn Ref: </span>
              <span className="font-mono text-[11px] text-slate-700">
                {receipt.payment.transactionReference}
              </span>{' '}
              <span className="text-slate-400">({receipt.payment.method})</span>
            </div>
          )}
        </div>

        {/* Itemized list */}
        <div className="py-4 border-b border-dashed border-slate-300">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left font-medium pb-2">Item</th>
                <th className="text-center font-medium pb-2">Qty</th>
                <th className="text-right font-medium pb-2">Price</th>
                <th className="text-right font-medium pb-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipt.items.map((item) => (
                <tr key={item.id} className="text-slate-700">
                  <td className="py-2 pr-2">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    {item.notes && (
                      <div className="text-[11px] text-slate-400 italic">
                        Note: {item.notes}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-center text-slate-600">{item.quantity}</td>
                  <td className="py-2 text-right text-slate-600">
                    {formatMoney(item.unitPrice, currency)}
                  </td>
                  <td className="py-2 text-right font-medium text-slate-900">
                    {formatMoney(item.totalPrice, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Transparent Bill Breakdown */}
        <div className="py-4 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Items Subtotal</span>
            <span>{formatMoney(receipt.pricing.subtotal, currency)}</span>
          </div>

          {receipt.pricing.discountAmount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount</span>
              <span>-{formatMoney(receipt.pricing.discountAmount, currency)}</span>
            </div>
          )}

          {receipt.pricing.taxableAmount > 0 && (
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>Taxable Value</span>
              <span>{formatMoney(receipt.pricing.taxableAmount, currency)}</span>
            </div>
          )}

          {receipt.pricing.serviceCharge > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Service Charge</span>
              <span>{formatMoney(receipt.pricing.serviceCharge, currency)}</span>
            </div>
          )}

          {receipt.pricing.packagingCharge > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Packaging Charge</span>
              <span>{formatMoney(receipt.pricing.packagingCharge, currency)}</span>
            </div>
          )}

          {receipt.pricing.customCharge > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Additional Charge</span>
              <span>{formatMoney(receipt.pricing.customCharge, currency)}</span>
            </div>
          )}

          {/* GST Breakdown */}
          {receipt.pricing.cgst > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>
                CGST {receipt.pricing.isTaxInclusive ? '(Included)' : ''}
              </span>
              <span>{formatMoney(receipt.pricing.cgst, currency)}</span>
            </div>
          )}

          {receipt.pricing.sgst > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>
                SGST {receipt.pricing.isTaxInclusive ? '(Included)' : ''}
              </span>
              <span>{formatMoney(receipt.pricing.sgst, currency)}</span>
            </div>
          )}

          {receipt.pricing.igst > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>
                IGST {receipt.pricing.isTaxInclusive ? '(Included)' : ''}
              </span>
              <span>{formatMoney(receipt.pricing.igst, currency)}</span>
            </div>
          )}

          <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
            <span>Total Payable</span>
            <span className="font-mono text-base">
              {formatMoney(receipt.pricing.total, currency)}
            </span>
          </div>
        </div>

        {/* Footer / Disclaimer */}
        <div className="pt-4 border-t border-dashed border-slate-300 text-center space-y-1">
          <p className="text-[11px] text-slate-400 leading-tight">
            {receipt.disclaimer}
          </p>
          <p className="text-[11px] text-slate-500 pt-1">
            Thank you for dining with us!
          </p>
        </div>
      </div>
    </div>
  );
}
