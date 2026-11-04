'use client';

import React from 'react';
import {
  Plus,
  QrCode,
  LayoutDashboard,
  FolderTree,
  Menu,
  ClipboardList,
  CreditCard,
  Receipt,
} from 'lucide-react';
import type { DashboardTab, RestaurantSummary } from '@/types/dashboard';

interface DashboardTabsNavProps {
  activeRestaurant: RestaurantSummary | null;
  activeTab: DashboardTab;
  categoriesCount: number;
  itemsCount: number;
  tablesCount: number;
  onSelectTab: (tab: DashboardTab) => void;
  onOpenAddCategory: () => void;
  onOpenAddTable: () => void;
  onOpenAddItem: () => void;
}

export function DashboardTabsNav({
  activeRestaurant,
  activeTab,
  categoriesCount,
  itemsCount,
  tablesCount,
  onSelectTab,
  onOpenAddCategory,
  onOpenAddTable,
  onOpenAddItem,
}: DashboardTabsNavProps) {
  return (
    <div className="border-b border-slate-800/80 bg-slate-900/40 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {activeRestaurant?.name}
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">
                {activeRestaurant?.role}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Menu Slug:{' '}
              <span className="text-slate-300 font-mono">/m/{activeRestaurant?.slug}</span> • Currency:{' '}
              <span className="text-slate-300 font-mono">{activeRestaurant?.currency}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAddCategory}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-orange-400" />
              <span>Add Category</span>
            </button>

            <button
              onClick={onOpenAddTable}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <QrCode className="w-3.5 h-3.5 text-orange-400" />
              <span>Add Table</span>
            </button>

            <button
              onClick={onOpenAddItem}
              className="px-3.5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-xl shadow-lg shadow-orange-600/20 flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Menu Item</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => onSelectTab('overview')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => onSelectTab('categories')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'categories'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>Categories ({categoriesCount})</span>
          </button>

          <button
            onClick={() => onSelectTab('items')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'items'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Menu className="w-4 h-4" />
            <span>Menu Items ({itemsCount})</span>
          </button>

          <button
            onClick={() => onSelectTab('tables')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'tables'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Tables & QR Codes ({tablesCount})</span>
          </button>

          <button
            onClick={() => onSelectTab('orders')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'orders'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Live Orders</span>
          </button>

          <button
            onClick={() => onSelectTab('payments')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'payments'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Payments & Reconciliation</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-orange-950/60 text-orange-400 border border-orange-500/30 rounded font-semibold">
              P5
            </span>
          </button>

          <button
            onClick={() => onSelectTab('billing')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'billing'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Billing & Taxes</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 rounded font-semibold">
              P9
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
