'use client';

import React from 'react';
import { UtensilsCrossed, Plus, Check } from 'lucide-react';
import type { PublicMenuItem } from '@/types/public-menu';
import { formatMoney } from '@/lib/formatters';

interface MenuItemCardProps {
  item: PublicMenuItem & { categoryName: string };
  currency?: string;
  cartQuantity?: number;
  onAddToCart: (item: PublicMenuItem) => void;
}

export function MenuItemCard({
  item,
  currency = 'INR',
  cartQuantity = 0,
  onAddToCart,
}: MenuItemCardProps) {
  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-800 flex items-start justify-between gap-4 transition-all hover:border-slate-700">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-medium text-orange-400">
            {item.categoryName}
          </span>
          {cartQuantity > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 bg-orange-600 text-white rounded-full font-mono font-bold">
              {cartQuantity} in cart
            </span>
          )}
        </div>
        <h3 className="text-base font-bold text-white mb-1">{item.name}</h3>
        {item.description && (
          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 mb-3">
            {item.description}
          </p>
        )}
        <div className="text-base font-bold font-mono text-white">
          {formatMoney(item.price, currency)}
        </div>
      </div>

      <div className="flex flex-col items-end justify-between h-full shrink-0">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-20 h-20 rounded-xl object-cover border border-slate-800 mb-2"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-2">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
        )}

        <button
          onClick={() => onAddToCart(item)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
            cartQuantity > 0
              ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
              : 'bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/20'
          }`}
        >
          {cartQuantity > 0 ? (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Add ({cartQuantity})</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
