'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Receipt,
  Loader2,
  Trash2,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import type { RestaurantTableData } from '@/types/dashboard';
import { formatMoney } from '@/lib/formatters';

interface SessionOrderSummary {
  id: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  total: number;
  refundStatus: string | null;
  hasFailedRefund?: boolean;
  failedRefundAmount?: number;
  itemsCount: number;
  createdAt: string;
}

interface TableSessionSummary {
  hasActiveSession: boolean;
  table: {
    id: string;
    tableNumber: string;
    capacity: number;
    status: string;
  };
  session: {
    id: string;
    createdAt: string;
    expiresAt: string;
    durationMinutes: number;
  } | null;
  ordersCount: number;
  orders: SessionOrderSummary[];
  canClose: boolean;
  blockingReasons: string[];
  unpaidOrdersCount: number;
  activeOrdersCount: number;
  pendingRefundsCount: number;
  failedRefundsCount?: number;
  hasFailedRefunds?: boolean;
  hasReadyOrders: boolean;
  isFullyServed: boolean;
}

interface ClearTableModalProps {
  isOpen: boolean;
  table: RestaurantTableData | null;
  restaurantId: string;
  currency?: string;
  onClose: () => void;
  onCleared: () => Promise<void>;
  notify: (type: 'success' | 'error', message: string) => void;
}

export function ClearTableModal({
  isOpen,
  table,
  restaurantId,
  currency = 'INR',
  onClose,
  onCleared,
  notify,
}: ClearTableModalProps) {
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [summary, setSummary] = useState<TableSessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!table || !restaurantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/restaurants/${restaurantId}/tables/${table.id}/session-summary`,
        { cache: 'no-store' },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to fetch table session details');
      }
      setSummary(data.data.summary);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [table, restaurantId]);

  useEffect(() => {
    if (isOpen) {
      void fetchSummary();
    } else {
      setSummary(null);
      setError(null);
    }
  }, [isOpen, fetchSummary]);

  if (!isOpen || !table) return null;

  async function handleConfirmClear() {
    if (!table || clearing) return;
    setClearing(true);
    try {
      const res = await fetch(
        `/api/v1/restaurants/${restaurantId}/tables/${table.id}/close-session`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedSessionId: summary?.session?.id,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 409 && data.error?.code === 'SESSION_ALREADY_CLOSED') {
          notify('success', 'This table session has already been closed.');
          onClose();
          await onCleared();
          return;
        }
        throw new Error(
          data.error?.message || 'Failed to clear table and close session.',
        );
      }

      notify('success', `Table ${table.tableNumber} is now cleared and available for new guests.`);
      onClose();
      await onCleared();
    } catch (err) {
      notify('error', (err as Error).message);
      setError((err as Error).message);
    } finally {
      setClearing(false);
    }
  }

  const totalSessionAmount =
    summary?.orders.reduce((sum, o) => sum + o.total, 0) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Clear Table {table.tableNumber}
              </h2>
              <p className="text-xs text-slate-400">
                Close active dining session & make table available
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={clearing}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin mb-3" />
              <p className="text-xs">Checking table orders and settlement status...</p>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && summary && (
            <>
              {/* Session Overview Stats */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Duration
                  </span>
                  <span className="text-sm font-black text-white mt-0.5 flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{summary.session?.durationMinutes || 0}m</span>
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Orders
                  </span>
                  <span className="text-sm font-black text-white mt-0.5">
                    {summary.ordersCount}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Bill
                  </span>
                  <span className="text-sm font-black text-emerald-400 mt-0.5">
                    {formatMoney(totalSessionAmount, currency)}
                  </span>
                </div>
              </div>

              {/* Failed Online Refund Warning Banner */}
              {summary.hasFailedRefunds && (
                <div className="p-3.5 rounded-2xl bg-rose-950/70 border border-rose-800 text-rose-200 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-xs text-rose-100">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Failed Online Refund Detected</span>
                  </div>
                  <p className="text-[11px] text-rose-300/90">
                    One or more online refund transactions failed to process. Review payment records and resolve failed refunds before clearing the table.
                  </p>
                </div>
              )}

              {/* Blocking Reasons Banner */}
              {!summary.canClose && (
                <div className="p-4 rounded-2xl bg-amber-950/60 border border-amber-800 text-amber-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-amber-100">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Table Cannot Be Cleared Yet</span>
                  </div>
                  <ul className="text-xs space-y-1 pl-6 list-disc text-amber-200/90">
                    {summary.blockingReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-amber-300/80 pt-1 border-t border-amber-800/60">
                    All food must be marked served and all payments settled before clearing table.
                  </p>
                </div>
              )}

              {/* Ready to close banner */}
              {summary.canClose && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    All orders are completed and payments are fully settled. Safe to clear.
                  </span>
                </div>
              )}

              {/* Session Orders List */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Session Orders ({summary.orders.length})
                </h3>

                {summary.orders.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">
                    No orders placed in this session.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {summary.orders.map((order) => {
                      const isServed = order.orderStatus === 'SERVED';
                      const isCancelled = order.orderStatus === 'CANCELLED';
                      const isPaid =
                        order.paymentStatus === 'PAID' ||
                        order.paymentStatus === 'PARTIALLY_REFUNDED' ||
                        order.paymentStatus === 'REFUNDED';

                      return (
                        <div
                          key={order.id}
                          className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-white">
                                #{order.orderNumber}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                ({order.itemsCount} {order.itemsCount === 1 ? 'item' : 'items'})
                              </span>
                            </div>
                            <span className="text-[11px] font-semibold text-emerald-400">
                              {formatMoney(order.total, currency)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                                isServed
                                  ? 'bg-purple-950/50 text-purple-300 border-purple-800'
                                  : isCancelled
                                  ? 'bg-rose-950/50 text-rose-400 border-rose-800'
                                  : order.orderStatus === 'READY'
                                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800'
                                  : 'bg-orange-950/50 text-orange-300 border-orange-800'
                              }`}
                            >
                              {order.orderStatus}
                            </span>

                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                isPaid
                                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                                  : 'bg-rose-950/40 text-rose-400 border-rose-800/60'
                              }`}
                            >
                              {order.paymentStatus}
                            </span>

                            {order.hasFailedRefund && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border bg-rose-950/80 text-rose-300 border-rose-700">
                                Refund Failed
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={clearing}
            className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={() => void handleConfirmClear()}
            disabled={clearing || loading || (summary ? !summary.canClose : true)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg transition-all ${
              summary?.canClose
                ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/20'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            {clearing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            <span>
              {clearing
                ? 'Clearing Table...'
                : summary?.canClose
                ? 'Clear Table & Close Session'
                : 'Resolve Issues to Clear Table'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

