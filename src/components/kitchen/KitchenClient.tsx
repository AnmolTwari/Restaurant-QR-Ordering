'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChefHat, AlertCircle } from 'lucide-react';
import { OrderStatus } from '@/types';
import type { RestaurantSummary } from '@/types/dashboard';
import type { StaffOrderDetails } from '@/types/orders';

import { KitchenHeader } from '@/components/kitchen/KitchenHeader';
import { KitchenOrderCard } from '@/components/kitchen/KitchenOrderCard';

interface KitchenClientProps {
  initialRestaurants: RestaurantSummary[];
  initialActiveRestaurant: RestaurantSummary;
  initialOrders: StaffOrderDetails[];
}

export function KitchenClient({
  initialRestaurants,
  initialActiveRestaurant,
  initialOrders,
}: KitchenClientProps) {
  const [restaurants] = useState<RestaurantSummary[]>(initialRestaurants);
  const [activeRestaurant, setActiveRestaurant] = useState<RestaurantSummary>(
    initialActiveRestaurant,
  );
  const [orders, setOrders] = useState<StaffOrderDetails[]>(initialOrders);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'active' | 'ready' | 'all'>('active');

  const fetchOrders = useCallback(async () => {
    if (!activeRestaurant) return;
    try {
      const res = await fetch(`/api/v1/restaurants/${activeRestaurant.id}/orders?limit=60`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOrders(data.data.orders);
        setError(null);
      } else {
        setError(data.error?.message || 'Failed to fetch kitchen orders.');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [activeRestaurant]);

  // 5-second polling loop
  useEffect(() => {
    if (activeRestaurant) {
      const interval = setInterval(() => {
        void fetchOrders();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeRestaurant, fetchOrders]);

  async function handleUpdateStatus(orderId: string, status: OrderStatus) {
    if (!activeRestaurant) return;
    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/v1/restaurants/${activeRestaurant.id}/orders/${orderId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to update order status.');
      }
      await fetchOrders();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelOrder(orderId: string) {
    if (!activeRestaurant) return;
    const reason = prompt('Enter a cancellation reason (optional):');
    if (reason === null) return;

    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/v1/restaurants/${activeRestaurant.id}/orders/${orderId}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to cancel order.');
      }
      await fetchOrders();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  const activeOrders = orders.filter((o) =>
    [OrderStatus.PENDING, OrderStatus.ACCEPTED, OrderStatus.PREPARING].includes(
      o.orderStatus,
    ),
  );

  const readyOrders = orders.filter((o) => o.orderStatus === OrderStatus.READY);

  const displayedOrders =
    activeFilter === 'active'
      ? activeOrders
      : activeFilter === 'ready'
      ? readyOrders
      : orders.filter(
          (o) =>
            o.orderStatus !== OrderStatus.SERVED &&
            o.orderStatus !== OrderStatus.CANCELLED,
        );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <KitchenHeader
        restaurants={restaurants}
        activeRestaurant={activeRestaurant}
        activeFilter={activeFilter}
        activeCount={activeOrders.length}
        readyCount={readyOrders.length}
        onSelectRestaurant={setActiveRestaurant}
        onSelectFilter={setActiveFilter}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        {error && (
          <div className="p-4 mb-6 rounded-2xl bg-red-950/80 border border-red-800 text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {displayedOrders.length === 0 ? (
          <div className="glass-panel rounded-3xl p-16 text-center border border-slate-800 my-12 max-w-md mx-auto">
            <ChefHat className="w-14 h-14 text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">
              {activeFilter === 'ready' ? 'No orders waiting for service' : 'All caught up!'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {activeFilter === 'ready'
                ? 'Cooked dishes marked ready will appear here for waiters to serve.'
                : 'Incoming customer orders from table QR codes will appear in real time.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {displayedOrders.map((order) => (
              <KitchenOrderCard
                key={order.id}
                order={order}
                actionLoading={actionLoading}
                onUpdateStatus={handleUpdateStatus}
                onCancelOrder={handleCancelOrder}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
