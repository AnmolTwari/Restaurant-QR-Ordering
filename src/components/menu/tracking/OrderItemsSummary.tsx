'use client';

import React from 'react';
import { formatMoney } from '@/lib/formatters';
import { OrderItemStatus } from '@/types';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface OrderItemData {
  id: string;
  nameSnapshot: string;
  quantity: number;
  priceSnapshot: number;
  totalPrice: number;
  notes?: string | null;
  status?: OrderItemStatus | string;
  cancelReason?: string | null;
  cancelNote?: string | null;
}

interface OrderItemsSummaryProps {
  items: OrderItemData[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  refundAmount?: number;
  refundedAtCounterAmount?: number;
  refundStatus?: string | null;
}

export function OrderItemsSummary({
  items,
  subtotal,
  tax,
  total,
  currency,
  refundAmount = 0,
  refundedAtCounterAmount = 0,
  refundStatus,
}: OrderItemsSummaryProps) {
  const pendingRefund = refundAmount - refundedAtCounterAmount;
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
        Ordered Items
      </h3>

      <div className="divide-y divide-slate-100">
        {items.map((item) => {
          const isCancelled = item.status === OrderItemStatus.CANCELLED;

          return (
            <div
              key={item.id}
              className={`py-2.5 flex items-start justify-between text-xs ${
                isCancelled ? 'opacity-70' : ''
              }`}
            >
              <div>
                <div
                  className={`font-semibold ${
                    isCancelled ? 'line-through text-slate-400' : 'text-slate-900'
                  }`}
                >
                  {item.quantity}x {item.nameSnapshot}
                </div>

                {isCancelled && (
                  <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-rose-50 text-[10px] font-bold text-rose-600 border border-rose-200">
                    <span>Cancelled: {item.cancelReason || 'Unavailable'}</span>
                    {item.cancelNote && <span className="font-normal italic">({item.cancelNote})</span>}
                  </div>
                )}

                {item.notes && !isCancelled && (
                  <div className="text-[11px] text-slate-400 italic mt-0.5">
                    &ldquo;{item.notes}&rdquo;
                  </div>
                )}
              </div>

              <div
                className={`font-medium ${
                  isCancelled ? 'line-through text-slate-400' : 'text-slate-900'
                }`}
              >
                {formatMoney(item.totalPrice, currency)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs text-slate-600">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatMoney(subtotal, currency)}</span>
        </div>
        {tax > 0 && (
          <div className="flex justify-between">
            <span>Taxes & Charges</span>
            <span>{formatMoney(tax, currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-100">
          <span>Payable Total</span>
          <span>{formatMoney(total, currency)}</span>
        </div>

        {refundStatus === 'PENDING_COUNTER_REFUND' && pendingRefund > 0 && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold text-amber-900">
                Your item was cancelled. Please visit the counter for your refund:
              </span>
              <span className="ml-1 font-extrabold text-amber-950">
                {formatMoney(pendingRefund, currency)}
              </span>
              <p className="text-[11px] text-amber-800/90 mt-0.5">
                Staff will complete your counter refund for cancelled items.
              </p>
            </div>
          </div>
        )}

        {refundStatus === 'REFUNDED_AT_COUNTER' && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2.5 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold text-emerald-900">
                Counter refund completed:
              </span>
              <span className="ml-1 font-bold text-emerald-950">
                {formatMoney(refundedAtCounterAmount || refundAmount, currency)} returned at counter
              </span>
              <p className="text-[11px] text-emerald-700/90 mt-0.5">
                The refund amount was handed over to you at the restaurant counter.
              </p>
            </div>
          </div>
        )}

        {refundStatus === 'SUCCEEDED' && refundAmount > 0 && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">Refund Processed: </span>
              <span>{formatMoney(refundAmount, currency)}</span>
              <p className="text-[11px] text-emerald-700/80 mt-0.5">
                Gateway refund initiated successfully back to original payment source.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
