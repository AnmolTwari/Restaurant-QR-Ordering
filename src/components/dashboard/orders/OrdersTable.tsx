'use client';

import React from 'react';
import { ClipboardList, Loader2, Eye } from 'lucide-react';
import { OrderStatus } from '@/types';
import type { StaffOrderDetails } from '@/types/orders';
import { formatMoney } from '@/lib/formatters';

interface OrdersTableProps {
  orders: StaffOrderDetails[];
  loading: boolean;
  selectedFilter: string;
  currency: string;
  onSelectOrder: (order: StaffOrderDetails) => void;
}

export function OrdersTable({
  orders,
  loading,
  selectedFilter,
  currency,
  onSelectOrder,
}: OrdersTableProps) {
  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center border border-slate-800">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-2" />
        <p className="text-xs text-slate-400">Loading orders...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center border border-slate-800">
        <ClipboardList className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h3 className="text-base font-medium text-white mb-1">No orders found</h3>
        <p className="text-xs text-slate-400">
          {selectedFilter !== 'all'
            ? `No orders matching status "${selectedFilter}".`
            : 'Customer orders placed from table QR codes will appear here.'}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
          <tr>
            <th className="py-3.5 px-4 font-medium">Order #</th>
            <th className="py-3.5 px-4 font-medium">Table</th>
            <th className="py-3.5 px-4 font-medium">Items</th>
            <th className="py-3.5 px-4 font-medium">Total</th>
            <th className="py-3.5 px-4 font-medium">Payment</th>
            <th className="py-3.5 px-4 font-medium">Status</th>
            <th className="py-3.5 px-4 font-medium">Placed</th>
            <th className="py-3.5 px-4 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70 text-slate-300">
          {orders.map((ord) => (
            <tr key={ord.id} className="hover:bg-slate-900/40 transition-colors">
              <td className="py-3.5 px-4 font-mono font-bold text-white">
                {ord.orderNumber}
              </td>
              <td className="py-3.5 px-4 font-bold text-orange-400">
                Table {ord.table.tableNumber}
              </td>
              <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate">
                {ord.items.map((i) => `${i.quantity}x ${i.nameSnapshot}`).join(', ')}
              </td>
              <td className="py-3.5 px-4 font-mono font-bold text-white">
                {formatMoney(ord.total, currency)}
              </td>
              <td className="py-3.5 px-4">
                <div className="flex flex-col gap-1 items-start">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      ord.paymentStatus === 'PAID'
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                        : 'bg-amber-950/60 text-amber-400 border border-amber-800'
                    }`}
                  >
                    {ord.paymentStatus}
                  </span>
                  {ord.refundStatus === 'PENDING_COUNTER_REFUND' && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800 animate-pulse whitespace-nowrap">
                      Refund Pending
                    </span>
                  )}
                  {ord.refundStatus === 'REFUNDED_AT_COUNTER' && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800 whitespace-nowrap">
                      Refunded
                    </span>
                  )}
                </div>
              </td>
              <td className="py-3.5 px-4">
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                    ord.orderStatus === OrderStatus.SERVED
                      ? 'bg-purple-950/60 text-purple-400 border border-purple-800'
                      : ord.orderStatus === OrderStatus.READY
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                      : ord.orderStatus === OrderStatus.PREPARING
                      ? 'bg-orange-950/60 text-orange-400 border border-orange-800'
                      : ord.orderStatus === OrderStatus.ACCEPTED
                      ? 'bg-blue-950/60 text-blue-400 border border-blue-800'
                      : ord.orderStatus === OrderStatus.PENDING
                      ? 'bg-amber-950/60 text-amber-400 border border-amber-800'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {ord.orderStatus}
                </span>
              </td>
              <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                {new Date(ord.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td className="py-3.5 px-4 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => onSelectOrder(ord)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
                    title="View Details"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Details</span>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
