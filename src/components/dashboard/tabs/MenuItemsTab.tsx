'use client';

import React from 'react';
import { Menu, Plus, Edit2 } from 'lucide-react';
import type { Category, MenuItem } from '@/types/dashboard';
import { formatMoney } from '@/lib/formatters';

interface MenuItemsTabProps {
  categories: Category[];
  menuItems: MenuItem[];
  selectedCategoryFilter: string;
  currency?: string;
  onSelectCategoryFilter: (filter: string) => void;
  onOpenCreateItem: () => void;
  onEditItem: (item: MenuItem) => void;
  onToggleAvailability: (item: MenuItem) => void;
}

export function MenuItemsTab({
  categories,
  menuItems,
  selectedCategoryFilter,
  currency,
  onSelectCategoryFilter,
  onOpenCreateItem,
  onEditItem,
  onToggleAvailability,
}: MenuItemsTabProps) {
  const filteredMenuItems = menuItems.filter((item) => {
    if (selectedCategoryFilter === 'all') return true;
    return item.categoryId === selectedCategoryFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Menu Items</h2>
          <p className="text-xs text-slate-400">Manage dishes, prices and real-time kitchen availability</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Category filter */}
          <select
            value={selectedCategoryFilter}
            onChange={(e) => onSelectCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-xs text-white rounded-xl px-3 py-2 focus:outline-none"
          >
            <option value="all">All Categories ({menuItems.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            onClick={onOpenCreateItem}
            className="px-3.5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-xl flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Item</span>
          </button>
        </div>
      </div>

      {filteredMenuItems.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center border border-slate-800">
          <Menu className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-medium text-white mb-1">No items found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
            {selectedCategoryFilter === 'all'
              ? 'Start building your menu by adding dishes and drinks.'
              : 'No items in this selected category.'}
          </p>
          {categories.length > 0 && (
            <button
              onClick={onOpenCreateItem}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-xl"
            >
              Add Menu Item
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMenuItems.map((item) => (
            <div
              key={item.id}
              className={`glass-card rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                item.isAvailable ? 'border-slate-800' : 'border-amber-950/60 opacity-75'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-orange-400 font-medium">
                    {item.category.name}
                  </span>
                  <button
                    onClick={() => onToggleAvailability(item)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                      item.isAvailable
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-900/60'
                        : 'bg-amber-950/60 text-amber-400 border border-amber-800/60 hover:bg-amber-900/60'
                    }`}
                  >
                    {item.isAvailable ? 'In Stock' : 'Sold Out'}
                  </button>
                </div>

                <h3 className="text-base font-semibold text-white mb-1">{item.name}</h3>
                {item.description && (
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3">{item.description}</p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between mt-3">
                <div className="font-mono text-base font-bold text-white">
                  {formatMoney(item.price, currency)}
                </div>

                <button
                  onClick={() => onEditItem(item)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
