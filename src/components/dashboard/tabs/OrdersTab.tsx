'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@/types';
import type { StaffOrderDetails } from '@/types/orders';
import { OrderDetailModal } from '@/components/dashboard/modals/OrderDetailModal';
import { OrdersFilterBar } from '@/components/dashboard/orders/OrdersFilterBar';
import { OrdersTable } from '@/components/dashboard/orders/OrdersTable';

interface OrdersTabProps {
  restaurantId: string;
  currency?: string;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export function OrdersTab({ restaurantId, currency = 'INR', onNotify }: OrdersTabProps) {
  const [orders, setOrders] = useState<StaffOrderDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Order for Modal
  const [selectedOrder, setSelectedOrder] = useState<StaffOrderDetails | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const url =
        selectedFilter === 'all'
          ? `/api/v1/restaurants/${restaurantId}/orders`
          : `/api/v1/restaurants/${restaurantId}/orders?status=${selectedFilter}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setOrders(data.data.orders);
      } else {
        onNotify('error', data.error?.message || 'Failed to fetch orders.');
      }
    } catch {
      onNotify('error', 'Network error fetching orders.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId, selectedFilter, onNotify]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  async function handleUpdateStatus(orderId: string, status: OrderStatus) {
    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/v1/restaurants/${restaurantId}/orders/${orderId}/status`,
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
      onNotify('success', `Order status updated to ${status}`);
      await fetchOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(data.data.order);
      }
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelOrder(orderId: string) {
    const reason = prompt('Reason for cancelling order (optional):');
    if (reason === null) return;

    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/v1/restaurants/${restaurantId}/orders/${orderId}/cancel`,
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
      onNotify('success', 'Order cancelled successfully.');
      await fetchOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(null);
      }
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSettleCounter(orderId: string, amount: number) {
    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/v1/restaurants/${restaurantId}/orders/${orderId}/settle-counter`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to settle order at counter.');
      }
      onNotify('success', 'Order payment settled successfully at counter.');
      await fetchOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({
          ...selectedOrder,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.COUNTER,
        });
      }
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      o.table.tableNumber.toLowerCase().includes(q) ||
      o.items.some((i) => i.nameSnapshot.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <OrdersFilterBar
        selectedFilter={selectedFilter}
        onFilterChange={setSelectedFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <OrdersTable
        orders={filteredOrders}
        loading={loading}
        selectedFilter={selectedFilter}
        currency={currency}
        onSelectOrder={setSelectedOrder}
      />

      {/* Order Detail Modal */}
      <OrderDetailModal
        isOpen={!!selectedOrder}
        order={selectedOrder}
        currency={currency}
        actionLoading={actionLoading}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={handleUpdateStatus}
        onCancelOrder={handleCancelOrder}
        onSettleCounter={handleSettleCounter}
      />
    </div>
  );
}
