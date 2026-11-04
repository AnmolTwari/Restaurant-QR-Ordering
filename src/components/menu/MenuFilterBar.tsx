'use client';

import React from 'react';
import { Search } from 'lucide-react';
import type { PublicCategory } from '@/types/public-menu';

interface MenuFilterBarProps {
  searchQuery: string;
  selectedCategory: string;
  totalItemsCount: number;
  categories: PublicCategory[];
  onSearchChange: (query: string) => void;
  onSelectCategory: (categoryId: string) => void;
}

export function MenuFilterBar({
  searchQuery,
  selectedCategory,
  totalItemsCount,
  categories,
  onSearchChange,
  onSelectCategory,
}: MenuFilterBarProps) {
  return (
    <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-4 py-2 sm:py-2.5">
      <div className="max-w-2xl mx-auto space-y-2 sm:space-y-2.5">
        {/* Search Box */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search dishes, drinks, starters..."
            className="w-full pl-8 sm:pl-9 pr-3.5 py-1.5 sm:py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
        </div>

        {/* Category Pills (horizontally scrollable on mobile) */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none py-0.5 scroll-smooth touch-pan-x overscroll-x-contain">
          <button
            type="button"
            onClick={() => onSelectCategory('all')}
            className={`min-h-[32px] sm:min-h-[34px] px-3 sm:px-3.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all touch-manipulation active:scale-95 shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
          >
            All ({totalItemsCount})
          </button>

          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`min-h-[32px] sm:min-h-[34px] px-3 sm:px-3.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all touch-manipulation active:scale-95 shrink-0 ${
                selectedCategory === cat.id
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                  : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              {cat.name} ({cat.items.length})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
