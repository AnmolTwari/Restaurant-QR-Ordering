'use client';

import React from 'react';
import Link from 'next/link';
import { UtensilsCrossed, Store, LogOut } from 'lucide-react';
import type { RestaurantSummary } from '@/types/dashboard';

interface DashboardHeaderProps {
  restaurants: RestaurantSummary[];
  activeRestaurant: RestaurantSummary | null;
  currentUser: { id: string; fullName: string; email: string } | null;
  onSelectRestaurant: (restaurant: RestaurantSummary) => void;
  onLogout: () => void;
}

export function DashboardHeader({
  restaurants,
  activeRestaurant,
  currentUser,
  onSelectRestaurant,
  onLogout,
}: DashboardHeaderProps) {
  return (
    <header className="border-b border-slate-800 glass-panel sticky top-0 z-30 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-amber-200 to-slate-100 hidden sm:inline">
              DineFlow
            </span>
          </Link>

          {/* Restaurant Selector */}
          {restaurants.length > 0 && activeRestaurant && (
            <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
              <Store className="w-4 h-4 text-orange-400 shrink-0" />
              <select
                value={activeRestaurant.id}
                onChange={(e) => {
                  const found = restaurants.find((r) => r.id === e.target.value);
                  if (found) onSelectRestaurant(found);
                }}
                className="bg-slate-900 border border-slate-800 text-xs sm:text-sm text-white font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.role})
                  </option>
                ))}
              </select>
              <Link
                href="/onboarding"
                className="text-xs text-orange-400 hover:text-orange-300 font-medium px-2 py-1 rounded bg-orange-500/10 border border-orange-500/20 hidden md:inline"
              >
                + New
              </Link>
            </div>
          )}
        </div>

        {/* User profile & Logout */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-medium text-white">{currentUser?.fullName}</div>
            <div className="text-[11px] text-slate-400">{currentUser?.email}</div>
          </div>
          <button
            onClick={onLogout}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-red-400 hover:border-red-900/60 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
