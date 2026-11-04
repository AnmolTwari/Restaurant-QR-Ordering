'use client';

import React from 'react';
import { UtensilsCrossed, Receipt, MapPin, Phone } from 'lucide-react';
import type { PublicMenuData } from '@/types/public-menu';

interface MenuHeaderProps {
  restaurant: PublicMenuData['restaurant'];
  table: PublicMenuData['table'];
  onOpenOrders?: () => void;
  ordersCount?: number;
}

export function MenuHeader({
  restaurant,
  table,
  onOpenOrders,
  ordersCount = 0,
}: MenuHeaderProps) {
  return (
    <header className="relative bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border-b border-slate-800/80 px-3 sm:px-4 py-3 sm:py-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-2.5">
          {/* Restaurant Branding */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-xl font-extrabold text-white tracking-tight truncate">
                {restaurant.name}
              </h1>
            </div>
            {restaurant.description && (
              <p className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5 max-w-md">
                {restaurant.description}
              </p>
            )}
          </div>

          {/* Actions & Table Badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {onOpenOrders && (
              <button
                type="button"
                onClick={onOpenOrders}
                className="inline-flex items-center gap-1 sm:gap-1.5 min-h-[32px] sm:min-h-[34px] px-2.5 sm:px-3 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-orange-400 shadow-sm active:scale-95 transition-all touch-manipulation"
                title="View active table orders"
              >
                <Receipt className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span className="hidden xs:inline sm:inline">Orders</span>
                {ordersCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-orange-500 text-white text-[10px] font-extrabold">
                    {ordersCount}
                  </span>
                )}
              </button>
            )}

            {/* Table Badge */}
            <div className="inline-flex items-center gap-1.5 min-h-[32px] sm:min-h-[34px] px-2.5 sm:px-3 py-1 rounded-full bg-slate-800/95 border border-slate-700 text-xs font-bold text-white shadow-sm shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>Table {table.tableNumber}</span>
            </div>
          </div>
        </div>

        {/* Desktop-only secondary address line if provided */}
        {(restaurant.address || restaurant.phone) && (
          <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 mt-2.5 pt-2 border-t border-slate-800/60">
            {restaurant.address && (
              <span className="flex items-center gap-1.5 truncate">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate max-w-xs">{restaurant.address}</span>
              </span>
            )}
            {restaurant.phone && (
              <span className="flex items-center gap-1.5 shrink-0">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{restaurant.phone}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
