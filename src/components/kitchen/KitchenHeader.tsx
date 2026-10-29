'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChefHat, ArrowLeft, RefreshCw, Clock } from 'lucide-react';
import type { RestaurantSummary } from '@/types/dashboard';

interface KitchenHeaderProps {
  restaurants: RestaurantSummary[];
  activeRestaurant: RestaurantSummary | null;
  activeFilter: 'active' | 'ready' | 'all';
  activeCount: number;
  readyCount: number;
  onSelectRestaurant: (restaurant: RestaurantSummary) => void;
  onSelectFilter: (filter: 'active' | 'ready' | 'all') => void;
}

export function KitchenHeader({
  restaurants,
  activeRestaurant,
  activeFilter,
  activeCount,
  readyCount,
  onSelectRestaurant,
  onSelectFilter,
}: KitchenHeaderProps) {
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3.5 sticky top-0 z-30 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Branding & Restaurant Selector */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-600/30">
            <ChefHat className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base sm:text-lg text-white tracking-tight">
                Kitchen Display System
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>

            {restaurants.length > 0 && activeRestaurant && (
              <select
                value={activeRestaurant.id}
                onChange={(e) => {
                  const found = restaurants.find((r) => r.id === e.target.value);
                  if (found) onSelectRestaurant(found);
                }}
                className="bg-slate-950 border border-slate-800 text-xs text-orange-400 font-semibold rounded-lg px-2 py-0.5 mt-0.5 focus:outline-none"
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Center: Filter Pills */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => onSelectFilter('active')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              activeFilter === 'active'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            In Kitchen ({activeCount})
          </button>

          <button
            onClick={() => onSelectFilter('ready')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              activeFilter === 'ready'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Ready for Table ({readyCount})
          </button>

          <button
            onClick={() => onSelectFilter('all')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              activeFilter === 'all'
                ? 'bg-slate-800 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Orders
          </button>
        </div>

        {/* Right: Real-time clock & polling status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-sm font-bold text-white">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>{currentTime || '--:--:--'}</span>
          </div>

          <div
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400"
            title="Auto-refreshing every 5 seconds"
          >
            <RefreshCw className="w-4 h-4 animate-spin text-orange-400" />
          </div>
        </div>
      </div>
    </header>
  );
}
