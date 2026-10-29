'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { OrderStatus } from '@/types';
import type { PublicOrderTracking } from '@/types/orders';
import { OrderTimeline } from '@/components/menu/tracking/OrderTimeline';
import { OrderPaymentCard } from '@/components/menu/tracking/OrderPaymentCard';
import { OrderItemsSummary } from '@/components/menu/tracking/OrderItemsSummary';

interface OrderTrackingViewProps {
  orderNumber: string;
  onBackToMenu: () => void;
}

export function OrderTrackingView({
  orderNumber,
  onBackToMenu,
}: OrderTrackingViewProps) {
  const [order, setOrder] = useState<PublicOrderTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/public/orders/${orderNumber}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to fetch order details.');
      }
      setOrder(data.data.order);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    void fetchOrder();
    const interval = setInterval(() => {
      void fetchOrder();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  async function handleCancelOrder() {
    if (!order) return;
    if (
      !confirm(
        'Are you sure you want to cancel this order? This action cannot be undone.',
      )
    ) {
      return;
    }

    setCancelling(true);
    try {
      const res = await fetch(`/api/v1/public/orders/${orderNumber}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to cancel order.');
      }
      await fetchOrder();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-orange-600 animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-medium">Loading your order status...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-sm w-full text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-800 mb-1">Order Not Found</h2>
          <p className="text-xs text-slate-500 mb-4">{error || 'Could not find this order ticket.'}</p>
          <button
            onClick={onBackToMenu}
            className="w-full py-2.5 px-4 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800"
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  const isCancelled = order.orderStatus === OrderStatus.CANCELLED;
  const canCancel = order.orderStatus === OrderStatus.PENDING;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3.5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button
            onClick={onBackToMenu}
            className="p-1.5 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h1 className="text-sm font-bold text-slate-900">{order.restaurant.name}</h1>
            <p className="text-[11px] text-slate-500">
              Table {order.table.tableNumber} • Order #{order.orderNumber}
            </p>
          </div>
          <button
            onClick={() => void fetchOrder()}
            className="p-1.5 -mr-1 text-slate-500 hover:text-slate-800 rounded-lg"
            title="Refresh Status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Cancelled Alert Banner */}
        {isCancelled && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3">
            <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-rose-900">Order Cancelled</h3>
              <p className="text-[11px] text-rose-700 mt-0.5">
                This order was cancelled and will not be prepared.
              </p>
            </div>
          </div>
        )}

        {/* Status Step Progression */}
        {!isCancelled && <OrderTimeline currentStatus={order.orderStatus} />}

        {/* Payment Card & Online Pay / Receipt */}
        <OrderPaymentCard
          orderNumber={order.orderNumber}
          orderTotal={order.total}
          currency={order.restaurant.currency}
          restaurantSlug={order.restaurant.slug}
          paymentStatus={order.paymentStatus}
          paymentMethod={order.paymentMethod}
          onPaymentSuccess={fetchOrder}
        />

        {/* Order Items Breakdown */}
        <OrderItemsSummary
          items={order.items}
          subtotal={order.subtotal}
          tax={order.tax}
          total={order.total}
          currency={order.restaurant.currency}
        />

        {/* Cancel Order Action */}
        {canCancel && (
          <div className="pt-2">
            <button
              onClick={handleCancelOrder}
              disabled={cancelling}
              className="w-full py-2.5 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors border border-rose-200"
            >
              {cancelling ? 'Cancelling order...' : 'Cancel Order'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
