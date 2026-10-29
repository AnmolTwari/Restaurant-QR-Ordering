'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { PaymentsMetrics } from '@/components/dashboard/payments/PaymentsMetrics';
import { PaymentsFilters } from '@/components/dashboard/payments/PaymentsFilters';
import { PaymentsTable, type PaymentItem } from '@/components/dashboard/payments/PaymentsTable';

interface PaymentsTabProps {
  restaurantId: string;
  restaurantSlug: string;
  userRole?: string;
}

export function PaymentsTab({
  restaurantId,
  restaurantSlug,
}: PaymentsTabProps) {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchPayments = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (statusFilter !== 'ALL') query.set('status', statusFilter);
      if (methodFilter !== 'ALL') query.set('method', methodFilter);

      const res = await fetch(
        `/api/v1/restaurants/${restaurantId}/payments?${query.toString()}`,
      );
      const data = await res.json();
      if (data.success && data.data?.payments) {
        setPayments(data.data.payments);
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load payments.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId, statusFilter, methodFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPayments();
  };

  const handleReconcile = async (paymentId: string) => {
    try {
      setReconcilingId(paymentId);
      setMessage(null);
      const res = await fetch(
        `/api/v1/restaurants/${restaurantId}/payments/${paymentId}/reconcile`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (data.success && data.data?.reconciliation) {
        const recon = data.data.reconciliation;
        setMessage({
          type: recon.reconciled ? 'success' : 'error',
          text:
            recon.message ||
            (recon.reconciled
              ? 'Reconciliation completed.'
              : recon.error || 'Reconciliation failed.'),
        });
        fetchPayments();
      } else {
        setMessage({
          type: 'error',
          text: data.error?.message || 'Reconciliation request failed.',
        });
      }
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Network error during reconciliation.',
      });
    } finally {
      setReconcilingId(null);
    }
  };

  // Metrics
  const totalSettledRevenue = payments
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + p.amount, 0);

  const paidCount = payments.filter((p) => p.status === 'PAID').length;
  const pendingCount = payments.filter((p) => p.status === 'PENDING').length;
  const counterCount = payments.filter((p) => p.method === 'COUNTER' && p.status === 'PAID').length;
  const onlineCount = payments.filter((p) => p.method === 'ONLINE' && p.status === 'PAID').length;

  // Filtered list
  const filteredPayments = payments.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.orderNumber.toLowerCase().includes(q) ||
      p.tableNumber.toLowerCase().includes(q) ||
      (p.gatewayTransactionId && p.gatewayTransactionId.toLowerCase().includes(q)) ||
      (p.counterStaffName && p.counterStaffName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner / Metrics */}
      <PaymentsMetrics
        totalSettledRevenue={totalSettledRevenue}
        paidCount={paidCount}
        pendingCount={pendingCount}
        counterCount={counterCount}
        onlineCount={onlineCount}
      />

      {/* Alert Banner */}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-xs underline font-medium ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Controls & Filters */}
      <PaymentsFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        methodFilter={methodFilter}
        onMethodFilterChange={setMethodFilter}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />

      {/* Payments Table */}
      <PaymentsTable
        payments={filteredPayments}
        loading={loading}
        reconcilingId={reconcilingId}
        restaurantSlug={restaurantSlug}
        onReconcile={handleReconcile}
      />
    </div>
  );
}
