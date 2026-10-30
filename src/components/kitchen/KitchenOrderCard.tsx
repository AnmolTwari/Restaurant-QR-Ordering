'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle2,
  ChefHat,
  BellRing,
  UtensilsCrossed,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { OrderStatus, OrderItemStatus } from '@/types';
import type { StaffOrderDetails } from '@/types/orders';

interface KitchenOrderCardProps {
  order: StaffOrderDetails;
  actionLoading: boolean;
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onCancelOrder: (orderId: string) => Promise<void>;
  onRequestCancelItem: (
    orderId: string,
    orderNumber: string,
    item: { id: string; nameSnapshot: string; quantity: number },
  ) => void;
}

export function KitchenOrderCard({
  order,
  actionLoading,
  onUpdateStatus,
  onCancelOrder,
  onRequestCancelItem,
}: KitchenOrderCardProps) {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  useEffect(() => {
    function calculateElapsed() {
      const created = new Date(order.createdAt).getTime();
      const now = Date.now();
      setElapsedMinutes(Math.max(0, Math.floor((now - created) / (1000 * 60))));
    }
    calculateElapsed();
    const interval = setInterval(calculateElapsed, 30000);
    return () => clearInterval(interval);
  }, [order.createdAt]);

  // Color urgency
  const urgencyColor =
    elapsedMinutes > 15
      ? 'bg-red-950/80 text-red-300 border-red-800'
      : elapsedMinutes > 8
      ? 'bg-amber-950/80 text-amber-300 border-amber-800'
      : 'bg-slate-900 text-slate-300 border-slate-800';

  return (
    <div
      className={`rounded-2xl border flex flex-col justify-between overflow-hidden shadow-xl transition-all ${
        order.orderStatus === OrderStatus.READY
          ? 'bg-emerald-950/30 border-emerald-800/80'
          : order.orderStatus === OrderStatus.PREPARING
          ? 'bg-orange-950/20 border-orange-800/80'
          : 'bg-slate-900/90 border-slate-800'
      }`}
    >
      {/* Top Banner */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <span>TABLE {order.table.tableNumber}</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {order.orderNumber}
          </span>
        </div>

        {/* Elapsed Timer */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono text-xs font-bold ${urgencyColor}`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{elapsedMinutes}m ago</span>
        </div>
      </div>

      {/* Item List */}
      <div className="p-4 flex-1 space-y-3">
        <div className="space-y-2">
          {order.items.map((item) => {
            const isCancelled = item.status === OrderItemStatus.CANCELLED;
            const canCancelItem =
              !isCancelled &&
              order.orderStatus !== OrderStatus.SERVED &&
              order.orderStatus !== OrderStatus.CANCELLED;

            return (
              <div
                key={item.id}
                className={`p-2.5 rounded-xl border transition-all ${
                  isCancelled
                    ? 'bg-rose-950/20 border-rose-900/40 opacity-75'
                    : 'bg-slate-950/70 border-slate-800/70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span
                      className={`text-sm font-bold ${
                        isCancelled ? 'line-through text-slate-500' : 'text-white'
                      }`}
                    >
                      <span
                        className={`font-extrabold mr-1.5 ${
                          isCancelled ? 'text-slate-500' : 'text-orange-400'
                        }`}
                      >
                        {item.quantity}x
                      </span>
                      {item.nameSnapshot}
                    </span>

                    {isCancelled && item.cancelReason && (
                      <div className="mt-1 text-[11px] font-semibold text-rose-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        <span>Cancelled: {item.cancelReason}</span>
                      </div>
                    )}
                  </div>

                  {canCancelItem && (
                    <button
                      type="button"
                      onClick={() =>
                        onRequestCancelItem(order.id, order.orderNumber, {
                          id: item.id,
                          nameSnapshot: item.nameSnapshot,
                          quantity: item.quantity,
                        })
                      }
                      disabled={actionLoading}
                      className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-800 text-[11px] font-medium text-slate-400 hover:text-rose-300 transition-colors"
                      title="Cancel item"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {item.notes && !isCancelled && (
                  <div className="mt-1.5 px-2 py-1 rounded bg-amber-950/50 border border-amber-800/50 text-[11px] font-semibold text-amber-300 flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                    <span>{item.notes}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* General Kitchen Notes */}
        {order.notes && (
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <span className="font-bold text-slate-300">Special Order Note:</span>
            <p className="text-slate-400 mt-0.5 italic">{order.notes}</p>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/50 flex items-center gap-2">
        {order.orderStatus === OrderStatus.PENDING && (
          <button
            onClick={() => onUpdateStatus(order.id, OrderStatus.ACCEPTED)}
            disabled={actionLoading}
            className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/20 transition-all"
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>Accept Order</span>
          </button>
        )}

        {order.orderStatus === OrderStatus.ACCEPTED && (
          <button
            onClick={() => onUpdateStatus(order.id, OrderStatus.PREPARING)}
            disabled={actionLoading}
            className="flex-1 py-2.5 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-orange-600/20 transition-all"
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ChefHat className="w-4 h-4" />
            )}
            <span>Start Cooking</span>
          </button>
        )}

        {order.orderStatus === OrderStatus.PREPARING && (
          <button
            onClick={() => onUpdateStatus(order.id, OrderStatus.READY)}
            disabled={actionLoading}
            className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all"
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <BellRing className="w-4 h-4" />
            )}
            <span>Mark Ready</span>
          </button>
        )}

        {order.orderStatus === OrderStatus.READY && (
          <button
            onClick={() => onUpdateStatus(order.id, OrderStatus.SERVED)}
            disabled={actionLoading}
            className="flex-1 py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/20 transition-all"
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UtensilsCrossed className="w-4 h-4" />
            )}
            <span>Mark Served</span>
          </button>
        )}

        <button
          onClick={() => onCancelOrder(order.id)}
          disabled={actionLoading}
          className="p-2.5 rounded-xl bg-slate-900 hover:bg-red-950/70 border border-slate-800 hover:border-red-900 text-slate-400 hover:text-red-400 text-xs font-semibold transition-colors"
          title="Cancel Order"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
