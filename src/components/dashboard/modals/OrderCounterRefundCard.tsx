'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import { formatMoney } from '@/lib/formatters';
import type { StaffOrderDetails } from '@/types/orders';

interface OrderCounterRefundCardProps {
  order: StaffOrderDetails;
  currency: string;
  actionLoading: boolean;
  onRefundCounter?: (orderId: string) => Promise<void>;
}

export function OrderCounterRefundCard({
  order,
  currency,
  actionLoading,
  onRefundCounter,
}: OrderCounterRefundCardProps) {
  const [refunding, setRefunding] = useState(false);

  const pendingRefund = (order.refundAmount ?? 0) - (order.refundedAtCounterAmount ?? 0);

  const handleConfirmRefund = async () => {
    if (!order || !onRefundCounter) return;
    const formattedAmount = formatMoney(pendingRefund, currency);
    const confirmed = window.confirm(
      `Confirm Counter Refund:\n\nOrder #${order.orderNumber}\nAmount: ${formattedAmount}\nPayment Method: ${order.paymentMethod}\n\nHave you returned this money to the customer at the counter?`,
    );
    if (!confirmed) return;

    setRefunding(true);
    try {
      await onRefundCounter(order.id);
    } finally {
      setRefunding(false);
    }
  };

  if (order.refundStatus === 'PENDING_COUNTER_REFUND' && pendingRefund > 0) {
    return (
      <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/80 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h5 className="text-sm font-bold text-amber-200">
              Counter Refund Required: {formatMoney(pendingRefund, currency)}
            </h5>
            <p className="text-xs text-amber-300/80">
              One or more items were cancelled from this paid order. Please return this amount to the customer at the counter.
            </p>
            <div className="text-[11px] text-slate-300 pt-1">
              <span className="text-slate-400">Original Payment:</span>{' '}
              <span className="font-semibold text-white">{order.paymentMethod}</span>
            </div>
          </div>
        </div>
        {onRefundCounter && (
          <div className="pt-2 flex justify-end">
            <button
              onClick={handleConfirmRefund}
              disabled={actionLoading || refunding}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-600/20"
            >
              {refunding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CreditCard className="w-3.5 h-3.5" />
              )}
              <span>Mark Refund Paid ({formatMoney(pendingRefund, currency)})</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  if (order.refundStatus === 'REFUNDED_AT_COUNTER') {
    return (
      <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div className="text-xs">
          <span className="font-bold text-emerald-300">
            Counter Refund Completed:{' '}
            {formatMoney(order.refundedAtCounterAmount ?? order.refundAmount ?? 0, currency)} returned to customer
          </span>
          {order.refundCompletedAt && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              Settled at {new Date(order.refundCompletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
              on {new Date(order.refundCompletedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
}

