'use client';

import React from 'react';
import { UtensilsCrossed, Plus } from 'lucide-react';
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
    <div className="glass-card rounded-2xl p-3.5 sm:p-4 border border-slate-800/80 hover:border-slate-700/80 flex items-stretch justify-between gap-3 sm:gap-4 transition-all">
      {/* Left Details */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[11px] font-semibold text-orange-400 truncate">
              {item.categoryName}
            </span>
            {cartQuantity > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 bg-orange-600 text-white rounded-full font-mono font-bold">
                {cartQuantity} in cart
              </span>
            )}
          </div>

          <h3 className="text-sm sm:text-base font-bold text-white leading-snug line-clamp-2 mb-1">
            {item.name}
          </h3>

          {item.description && (
            <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 mb-2">
              {item.description}
            </p>
          )}
        </div>

        <div className="text-sm sm:text-base font-extrabold font-mono text-white pt-1">
          {formatMoney(item.price, currency)}
        </div>
      </div>

      {/* Right Image & Thumb-Friendly Add Button */}
      <div className="flex flex-col items-end justify-between shrink-0 w-20 sm:w-24">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover border border-slate-800 mb-2"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-2">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
        )}

        <button
          type="button"
          onClick={() => onAddToCart(item)}
          className={`w-full min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1 transition-all active:scale-95 touch-manipulation ${
            cartQuantity > 0
              ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-orange-600/30'
              : 'bg-orange-600/15 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/25'
          }`}
          aria-label={`Add ${item.name} to cart`}
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>{cartQuantity > 0 ? `(${cartQuantity})` : 'Add'}</span>
        </button>
      </div>
    </div>
  );
}
