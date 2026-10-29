'use client';

import React from 'react';
import { FolderTree, Menu } from 'lucide-react';
import type { Category, MenuItem, RestaurantTableData, RestaurantSummary } from '@/types/dashboard';
import { formatMoney } from '@/lib/formatters';

interface OverviewTabProps {
  categories: Category[];
  menuItems: MenuItem[];
  tables: RestaurantTableData[];
  activeRestaurant: RestaurantSummary | null;
}

export function OverviewTab({
  categories,
  menuItems,
  tables,
  activeRestaurant,
}: OverviewTabProps) {
  const activeCategoriesCount = categories.filter((c) => c.isActive).length;
  const availableItemsCount = menuItems.filter((i) => i.isAvailable).length;
  const unavailableItemsCount = menuItems.length - availableItemsCount;
  const activeTablesCount = tables.filter((t) => t.status !== 'INACTIVE').length;

  return (
    <div className="space-y-8">
      {/* Stat Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Menu Categories</div>
          <div className="text-3xl font-bold text-white mt-2">{activeCategoriesCount}</div>
          <div className="text-xs text-slate-500 mt-1">
            {categories.length - activeCategoriesCount} deactivated
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="text-xs text-emerald-400 font-medium">Available Menu Items</div>
          <div className="text-3xl font-bold text-white mt-2">{availableItemsCount}</div>
          <div className="text-xs text-slate-500 mt-1">Ready for guest ordering</div>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="text-xs text-orange-400 font-medium">Dining Tables</div>
          <div className="text-3xl font-bold text-white mt-2">{activeTablesCount}</div>
          <div className="text-xs text-slate-500 mt-1">
            {tables.filter((t) => t.hasActiveQr).length} with active QR codes
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="text-xs text-amber-400 font-medium">Unavailable Items</div>
          <div className="text-3xl font-bold text-white mt-2">{unavailableItemsCount}</div>
          <div className="text-xs text-slate-500 mt-1">Temporarily sold out</div>
        </div>
      </div>

      {/* Quick Actions & Menu Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6 border border-slate-800">
          <h3 className="font-semibold text-white text-base mb-4 flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-orange-400" />
            <span>Recent Categories</span>
          </h3>

          {categories.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              No categories created yet. Click &quot;Add Category&quot; above.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {categories.slice(0, 5).map((cat) => (
                <div key={cat.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-200">{cat.name}</div>
                    {cat.description && (
                      <div className="text-xs text-slate-500 truncate max-w-xs">{cat.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                      {cat.itemCount} items
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        cat.isActive
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-6 border border-slate-800">
          <h3 className="font-semibold text-white text-base mb-4 flex items-center gap-2">
            <Menu className="w-4 h-4 text-orange-400" />
            <span>Recent Menu Items</span>
          </h3>

          {menuItems.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              No menu items created yet. Add categories and items to build your menu.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {menuItems.slice(0, 5).map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-200">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.category.name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-semibold text-orange-400">
                      {formatMoney(item.price, activeRestaurant?.currency)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        item.isAvailable
                          ? 'bg-emerald-950/60 text-emerald-400'
                          : 'bg-amber-950/60 text-amber-400'
                      }`}
                    >
                      {item.isAvailable ? 'Available' : 'Sold Out'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
