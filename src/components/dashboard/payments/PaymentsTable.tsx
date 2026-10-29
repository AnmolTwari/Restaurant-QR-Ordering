'use client';

import React from 'react';
import {
  CreditCard,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Receipt,
} from 'lucide-react';
import { formatMoney } from '@/lib/formatters';

export interface PaymentItem {
  id: string;
  orderId: string;
  orderNumber: string;
  tableNumber: string;
  orderStatus: string;
  amount: number;
  currency: string;
  method: 'ONLINE' | 'COUNTER';
  status: 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED';
  gatewayProvider: string | null;
  gatewayTransactionId: string | null;
  gatewayOrderId: string | null;
  paidAt: string | null;
  createdAt: string;
  counterStaffName: string | null;
  counterStaffRole: string | null;
  counterReference: string | null;
}

interface PaymentsTableProps {
  payments: PaymentItem[];
  loading: boolean;
  reconcilingId: string | null;
  restaurantSlug: string;
  onReconcile: (paymentId: string) => void;
}

export function PaymentsTable({
  payments,
  loading,
  reconcilingId,
  restaurantSlug,
  onReconcile,
}: PaymentsTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-slate-500 text-sm">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Loading payment records...
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-slate-500">
        <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="font-medium text-slate-700">No payment records found</p>
        <p className="text-xs text-slate-400 mt-1">
          Payments settled online or at counter will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Order Ref</th>
              <th className="py-3 px-4">Table</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Method</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Staff / Gateway Ref</th>
              <th className="py-3 px-4">Date & Time</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => {
              const isPaid = p.status === 'PAID';
              const isPending = p.status === 'PENDING';
              const isFailed = p.status === 'FAILED';
              const isRefunded = p.status === 'REFUNDED';

              return (
                <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-slate-900">
                    #{p.orderNumber}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    Table {p.tableNumber}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    {formatMoney(p.amount, p.currency)}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        p.method === 'ONLINE'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-purple-50 text-purple-700'
                      }`}
                    >
                      {p.method === 'ONLINE' ? 'Online' : 'Counter'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        isPaid
                          ? 'bg-emerald-50 text-emerald-700'
                          : isPending
                          ? 'bg-amber-50 text-amber-700'
                          : isFailed
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isPaid && <CheckCircle2 className="w-3 h-3" />}
                      {isPending && <Clock className="w-3 h-3" />}
                      {isFailed && <XCircle className="w-3 h-3" />}
                      {isRefunded && <RotateCcw className="w-3 h-3" />}
                      {p.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    {p.method === 'COUNTER' ? (
                      <div>
                        <span className="font-medium text-slate-900">
                          {p.counterStaffName || 'Staff'}
                        </span>{' '}
                        {p.counterStaffRole && (
                          <span className="text-[10px] text-slate-400">
                            ({p.counterStaffRole})
                          </span>
                        )}
                        {p.counterReference && (
                          <div className="text-[10px] font-mono text-slate-500 truncate max-w-[140px]">
                            Ref: {p.counterReference}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <span className="font-mono text-[11px] text-slate-600 truncate block max-w-[140px]">
                          {p.gatewayTransactionId || p.gatewayOrderId || 'Pending'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {p.gatewayProvider || 'RAZORPAY'}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                    {new Date(p.paidAt || p.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    {new Date(p.paidAt || p.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.method === 'ONLINE' && (isPending || isFailed) && (
                        <button
                          onClick={() => onReconcile(p.id)}
                          disabled={reconcilingId === p.id}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-colors"
                          title="Recheck verified status with Razorpay"
                        >
                          <RotateCcw
                            className={`w-3 h-3 ${
                              reconcilingId === p.id ? 'animate-spin' : ''
                            }`}
                          />
                          Reconcile
                        </button>
                      )}

                      <a
                        href={`/m/${restaurantSlug}/receipt/${p.orderNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors"
                      >
                        <Receipt className="w-3 h-3" />
                        Receipt
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
