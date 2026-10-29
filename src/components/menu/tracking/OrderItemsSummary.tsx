'use client';

import React from 'react';
import { formatMoney } from '@/lib/formatters';

interface OrderItemData {
  id: string;
  nameSnapshot: string;
  quantity: number;
  priceSnapshot: number;
  totalPrice: number;
  notes?: string | null;
}

interface OrderItemsSummaryProps {
  items: OrderItemData[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
}

export function OrderItemsSummary({
  items,
  subtotal,
  tax,
  total,
  currency,
}: OrderItemsSummaryProps) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
        Ordered Items
      </h3>

      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <div key={item.id} className="py-2.5 flex items-start justify-between text-xs">
            <div>
              <div className="font-semibold text-slate-900">
                {item.quantity}x {item.nameSnapshot}
              </div>
              {item.notes && (
                <div className="text-[11px] text-slate-400 italic mt-0.5">
                  &ldquo;{item.notes}&rdquo;
                </div>
              )}
            </div>
            <div className="font-medium text-slate-900">
              {formatMoney(item.totalPrice, currency)}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs text-slate-600">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatMoney(subtotal, currency)}</span>
        </div>
        {tax > 0 && (
          <div className="flex justify-between">
            <span>Taxes & Charges</span>
            <span>{formatMoney(tax, currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-100">
          <span>Total</span>
          <span>{formatMoney(total, currency)}</span>
        </div>
      </div>
    </div>
  );
}
