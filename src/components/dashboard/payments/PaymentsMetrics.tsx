'use client';

import React from 'react';
import {
  CreditCard,
  Clock,
  User,
  ShieldCheck,
} from 'lucide-react';
import { formatMoney } from '@/lib/formatters';

interface PaymentsMetricsProps {
  totalSettledRevenue: number;
  paidCount: number;
  pendingCount: number;
  counterCount: number;
  onlineCount: number;
}

export function PaymentsMetrics({
  totalSettledRevenue,
  paidCount,
  pendingCount,
  counterCount,
  onlineCount,
}: PaymentsMetricsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Settled Revenue
          </span>
          <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </span>
        </div>
        <div className="mt-2 text-2xl font-bold text-slate-900">
          {formatMoney(totalSettledRevenue)}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {paidCount} paid transactions
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Pending / Unsettled
          </span>
          <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </span>
        </div>
        <div className="mt-2 text-2xl font-bold text-amber-600">
          {pendingCount}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Awaiting customer or gateway action
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Counter Payments
          </span>
          <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <User className="w-4 h-4" />
          </span>
        </div>
        <div className="mt-2 text-2xl font-bold text-slate-900">
          {counterCount}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Cash / Counter settlement
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Online Payments
          </span>
          <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <CreditCard className="w-4 h-4" />
          </span>
        </div>
        <div className="mt-2 text-2xl font-bold text-slate-900">
          {onlineCount}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Razorpay gateway transactions
        </div>
      </div>
    </div>
  );
}
