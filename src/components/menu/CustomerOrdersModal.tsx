'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  Receipt,
  Clock,
  ArrowRight,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { OrderStatus, PaymentStatus, OrderItemStatus } from '@/types';
import type { PublicOrderTracking } from '@/types/orders';
import { formatMoney } from '@/lib/formatters';

interface CustomerOrdersModalProps {
  isOpen: boolean;
  restaurantSlug: string;
  currency: string;
  sessionReady: boolean;
  sessionError?: string | null;
  onClose: () => void;
  onSelectOrder: (orderNumber: string) => void;
}

export function CustomerOrdersModal({
  isOpen,
  restaurantSlug,
  currency,
  sessionReady,
  sessionError,
  onClose,
  onSelectOrder,
}: CustomerOrdersModalProps) {
  const [orders, setOrders] = useState<PublicOrderTracking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!sessionReady) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/public/orders?restaurantSlug=${encodeURIComponent(restaurantSlug)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to load your table orders.');
      }
      setOrders(data.data.orders || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [restaurantSlug, sessionReady]);

  useEffect(() => {
    if (isOpen) {
      void fetchOrders();
    }
  }, [isOpen, fetchOrders]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">My Table Orders</h2>
              <p className="text-[11px] text-slate-400">
                {orders.length} {orders.length === 1 ? 'order' : 'orders'} in this session
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void fetchOrders()}
              disabled={loading || !sessionReady}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
              title="Refresh Orders"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {/* Expired / Invalid Session State */}
          {!sessionReady && (
            <div className="p-4 rounded-2xl bg-amber-950/60 border border-amber-800/60 text-amber-200 space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-amber-100">Active Session Required</p>
                  <p className="mt-0.5 text-amber-300/80">
                    {sessionError ||
                      'Your table session is invalid or has expired. Please rescan your table QR code to view and track your orders.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && orders.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin mb-3" />
              <p className="text-xs">Loading orders for your table...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Empty Orders State */}
          {!loading && sessionReady && orders.length === 0 && !error && (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-white">No orders placed yet</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Items you order from this table will appear here so you can track kitchen preparation and payments.
              </p>
            </div>
          )}

          {/* Orders List */}
          {orders.map((order) => {
            const isCancelled = order.orderStatus === OrderStatus.CANCELLED;
            const isServed = order.orderStatus === OrderStatus.SERVED;
            const isPaid = order.paymentStatus === PaymentStatus.PAID;
            const isPartiallyRefunded = order.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED;

            const activeItems = order.items.filter((i) => i.status !== OrderItemStatus.CANCELLED);
            const cancelledItems = order.items.filter((i) => i.status === OrderItemStatus.CANCELLED);

            return (
              <div
                key={order.id}
                className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-white">
                      #{order.orderNumber}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>•</span>
                      <span>Table {order.table.tableNumber}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {/* Status Pill */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                        isCancelled
                          ? 'bg-rose-950/50 text-rose-400 border-rose-800'
                          : isServed
                          ? 'bg-purple-950/50 text-purple-300 border-purple-800'
                          : order.orderStatus === OrderStatus.READY
                          ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800'
                          : order.orderStatus === OrderStatus.PREPARING
                          ? 'bg-orange-950/50 text-orange-300 border-orange-800'
                          : 'bg-blue-950/50 text-blue-300 border-blue-800'
                      }`}
                    >
                      {order.orderStatus}
                    </span>

                    {/* Payment Pill */}
                    <span
                      className={`text-[10px] font-semibold ${
                        isPaid
                          ? 'text-emerald-400'
                          : isPartiallyRefunded
                          ? 'text-cyan-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {isPaid ? 'PAID' : isPartiallyRefunded ? 'PARTIALLY REFUNDED' : 'UNPAID'}
                    </span>

                    {order.refundStatus === 'PENDING_COUNTER_REFUND' && (
                      <span className="text-[9px] font-bold text-amber-300 bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-800/80 animate-pulse">
                        Refund Pending at Counter
                      </span>
                    )}

                    {order.refundStatus === 'REFUNDED_AT_COUNTER' && (
                      <span className="text-[9px] font-semibold text-emerald-300 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-800/80">
                        Refund Settled at Counter
                      </span>
                    )}
                  </div>
                </div>

                {/* Items Summary Preview */}
                <div className="text-xs text-slate-300 space-y-0.5 border-t border-slate-900 pt-2">
                  {activeItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-[11px]">
                      <span className="truncate max-w-[240px]">
                        {item.quantity}x {item.nameSnapshot}
                      </span>
                      <span className="text-slate-400 font-mono">
                        {formatMoney(item.totalPrice, currency)}
                      </span>
                    </div>
                  ))}
                  {cancelledItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-[11px] text-rose-400/80 line-through">
                      <span className="truncate max-w-[240px]">
                        {item.quantity}x {item.nameSnapshot} (Cancelled)
                      </span>
                      <span className="font-mono">{formatMoney(item.totalPrice, currency)}</span>
                    </div>
                  ))}
                </div>

                {/* Card Footer: Total & Track Button */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-900">
                  <div className="text-xs">
                    <span className="text-slate-400 mr-1.5">Total:</span>
                    <span className="font-mono font-bold text-white">
                      {formatMoney(order.total, currency)}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      onClose();
                      onSelectOrder(order.orderNumber);
                    }}
                    className="py-1.5 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-orange-600/30 transition-all"
                  >
                    <span>Track Order</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

