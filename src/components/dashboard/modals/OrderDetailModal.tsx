'use client';

import React from 'react';
import {
  X,
  CheckCircle2,
  ChefHat,
  BellRing,
  UtensilsCrossed,
  History,
  CreditCard,
} from 'lucide-react';
import { OrderStatus } from '@/types';
import type { StaffOrderDetails } from '@/types/orders';
import { formatMoney } from '@/lib/formatters';
import { OrderCounterRefundCard } from './OrderCounterRefundCard';

interface OrderDetailModalProps {
  isOpen: boolean;
  order: StaffOrderDetails | null;
  currency?: string;
  actionLoading: boolean;
  onClose: () => void;
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onCancelOrder: (orderId: string) => Promise<void>;
  onSettleCounter?: (orderId: string, amount: number) => Promise<void>;
  onRefundCounter?: (orderId: string) => Promise<void>;
}

export function OrderDetailModal({
  isOpen,
  order,
  currency = 'INR',
  actionLoading,
  onClose,
  onUpdateStatus,
  onCancelOrder,
  onSettleCounter,
  onRefundCounter,
}: OrderDetailModalProps) {
  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel rounded-3xl border border-slate-800 p-6 sm:p-7 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto space-y-6 text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-white">{order.orderNumber}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-bold border border-orange-500/20">
                Table {order.table.tableNumber}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Received at {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
              {new Date(order.createdAt).toLocaleDateString()}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status & Payment Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Order Status
            </span>
            <div className="font-bold text-sm text-white flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  order.orderStatus === OrderStatus.SERVED
                    ? 'bg-purple-400'
                    : order.orderStatus === OrderStatus.READY
                    ? 'bg-emerald-400'
                    : order.orderStatus === OrderStatus.PREPARING
                    ? 'bg-orange-400'
                    : order.orderStatus === OrderStatus.ACCEPTED
                    ? 'bg-blue-400'
                    : order.orderStatus === OrderStatus.PENDING
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-red-400'
                }`}
              />
              <span>{order.orderStatus}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Payment Status
            </span>
            <div className="font-bold text-sm text-white flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  order.paymentStatus === 'PAID'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border border-amber-800'
                }`}
              >
                {order.paymentStatus}
              </span>
              <span className="text-xs text-slate-400">({order.paymentMethod})</span>
            </div>
          </div>
        </div>

        {/* Ordered Items Breakdown */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Order Items ({order.items.reduce((s, i) => s + i.quantity, 0)})
          </h4>

          <div className="divide-y divide-slate-800/80 rounded-2xl bg-slate-900/60 border border-slate-800 p-4">
            {order.items.map((item) => {
              const isCancelled = item.status === 'CANCELLED';
              return (
                <div
                  key={item.id}
                  className={`py-2.5 flex items-start justify-between gap-3 text-xs ${
                    isCancelled ? 'opacity-65' : ''
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${isCancelled ? 'line-through text-slate-400' : 'text-white'}`}>
                        {item.quantity}x {item.nameSnapshot}
                      </span>
                      {isCancelled && (
                        <span className="px-1.5 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-800 text-[10px] font-bold">
                          Cancelled
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400">
                      ({formatMoney(item.priceSnapshot, currency)} each)
                    </span>
                    {item.notes && !isCancelled && (
                      <p className="text-[11px] text-amber-400/90 font-medium italic mt-0.5">
                        Prep Note: {item.notes}
                      </p>
                    )}
                    {isCancelled && item.cancelReason && (
                      <p className="text-[11px] text-red-400/90 font-medium italic mt-0.5">
                        Reason: {item.cancelReason} {item.cancelNote ? `(${item.cancelNote})` : ''}
                      </p>
                    )}
                  </div>
                  <span className={`font-mono font-bold ${isCancelled ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                    {formatMoney(item.totalPrice, currency)}
                  </span>
                </div>
              );
            })}

            <div className="pt-3 mt-2 flex items-center justify-between text-sm font-bold text-white border-t border-slate-800">
              <span>Payable Total</span>
              <span className="font-mono text-orange-400 text-base">
                {formatMoney(order.total, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Counter Refund Card */}
        <OrderCounterRefundCard
          order={order}
          currency={currency}
          actionLoading={actionLoading}
          onRefundCounter={onRefundCounter}
        />

        {order.notes && (
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <span className="font-bold text-slate-300">Customer Table Note:</span>
            <p className="text-slate-400 mt-0.5 italic">{order.notes}</p>
          </div>
        )}

        {/* Audit History Timeline */}
        {order.statusHistory && order.statusHistory.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              <span>Status History</span>
            </h4>

            <div className="space-y-1.5 text-xs text-slate-400 bg-slate-900/40 p-3 rounded-xl border border-slate-800/80">
              {order.statusHistory.map((h) => (
                <div key={h.id} className="flex items-center justify-between py-1 border-b border-slate-800/50 last:border-none">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">{h.toStatus}</span>
                    <span className="text-[11px] text-slate-500">— {h.note}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {order.orderStatus === OrderStatus.PENDING && (
              <button
                onClick={() => onUpdateStatus(order.id, OrderStatus.ACCEPTED)}
                disabled={actionLoading}
                className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Accept</span>
              </button>
            )}

            {order.orderStatus === OrderStatus.ACCEPTED && (
              <button
                onClick={() => onUpdateStatus(order.id, OrderStatus.PREPARING)}
                disabled={actionLoading}
                className="py-2 px-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <ChefHat className="w-3.5 h-3.5" />
                <span>Start Prep</span>
              </button>
            )}

            {order.orderStatus === OrderStatus.PREPARING && (
              <button
                onClick={() => onUpdateStatus(order.id, OrderStatus.READY)}
                disabled={actionLoading}
                className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>Mark Ready</span>
              </button>
            )}

            {order.orderStatus === OrderStatus.READY && (
              <button
                onClick={() => onUpdateStatus(order.id, OrderStatus.SERVED)}
                disabled={actionLoading}
                className="py-2 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>Mark Served</span>
              </button>
            )}

            {order.orderStatus !== OrderStatus.SERVED && order.orderStatus !== OrderStatus.CANCELLED && (
              <button
                onClick={() => onCancelOrder(order.id)}
                disabled={actionLoading}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 text-xs font-semibold"
              >
                Cancel Order
              </button>
            )}

            {onSettleCounter && order.paymentStatus !== 'PAID' && order.orderStatus !== OrderStatus.CANCELLED && (
              <button
                onClick={() => onSettleCounter(order.id, order.total)}
                disabled={actionLoading}
                className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Settle Counter ({formatMoney(order.total, currency)})</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 rounded-xl"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
