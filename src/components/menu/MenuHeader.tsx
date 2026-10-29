'use client';

import React from 'react';
import { UtensilsCrossed, MapPin, Phone } from 'lucide-react';
import type { PublicMenuData } from '@/types/public-menu';

interface MenuHeaderProps {
  restaurant: PublicMenuData['restaurant'];
  table: PublicMenuData['table'];
}

export function MenuHeader({ restaurant, table }: MenuHeaderProps) {
  return (
    <header className="relative bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border-b border-slate-800/80 px-4 pt-8 pb-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold">
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Dine-In Menu</span>
          </div>

          {/* Table Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-white shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Table {table.tableNumber}</span>
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {restaurant.name}
        </h1>

        {restaurant.description && (
          <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
            {restaurant.description}
          </p>
        )}

        {(restaurant.address || restaurant.phone) && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-800/60">
            {restaurant.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate max-w-xs">{restaurant.address}</span>
              </span>
            )}
            {restaurant.phone && (
              <span className="flex items-center gap-1.5">
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
