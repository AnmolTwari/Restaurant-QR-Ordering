'use client';

import React from 'react';
import Link from 'next/link';
import { ChefHat, ExternalLink, Search } from 'lucide-react';
import { OrderStatus } from '@/types';

interface OrdersFilterBarProps {
  selectedFilter: string;
  onFilterChange: (filter: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All Orders' },
  { id: 'pending_refunds', label: 'Pending Refunds' },
  { id: OrderStatus.PENDING, label: 'Pending' },
  { id: OrderStatus.ACCEPTED, label: 'Accepted' },
  { id: OrderStatus.PREPARING, label: 'Preparing' },
  { id: OrderStatus.READY, label: 'Ready' },
  { id: OrderStatus.SERVED, label: 'Served' },
  { id: OrderStatus.CANCELLED, label: 'Cancelled' },
];

export function OrdersFilterBar({
  selectedFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
}: OrdersFilterBarProps) {
  return (
    <div className="space-y-4">
      {/* Top Banner & Quick Link to KDS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Live Orders & Ticket Management</h2>
          <p className="text-xs text-slate-400">
            Monitor incoming dining tickets, track kitchen status, and handle table service
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/kitchen"
            target="_blank"
            className="px-3.5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-orange-600/20"
          >
            <ChefHat className="w-4 h-4" />
            <span>Launch Kitchen Display (KDS)</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel rounded-2xl p-3 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Status Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => onFilterChange(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                selectedFilter === f.id
                  ? 'bg-orange-600 text-white font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search order #, table, item..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
