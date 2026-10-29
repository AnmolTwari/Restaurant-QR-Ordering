'use client';

import React from 'react';
import { FolderTree, Plus, Edit2 } from 'lucide-react';
import type { Category } from '@/types/dashboard';

interface CategoriesTabProps {
  categories: Category[];
  onOpenCreate: () => void;
  onEditCategory: (category: Category) => void;
  onToggleStatus: (category: Category) => void;
}

export function CategoriesTab({
  categories,
  onOpenCreate,
  onEditCategory,
  onToggleStatus,
}: CategoriesTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Menu Categories</h2>
          <p className="text-xs text-slate-400">Group your menu items into clear guest sections</p>
        </div>
        <button
          onClick={onOpenCreate}
          className="px-3.5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-xl flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Category</span>
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center border border-slate-800">
          <FolderTree className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-medium text-white mb-1">No categories yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
            Create categories such as &quot;Starters&quot;, &quot;Main Course&quot;, &quot;Beverages&quot;, or &quot;Desserts&quot;.
          </p>
          <button
            onClick={onOpenCreate}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-xl"
          >
            Create First Category
          </button>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-medium">Category Name</th>
                <th className="py-3.5 px-4 font-medium">Description</th>
                <th className="py-3.5 px-4 font-medium">Order</th>
                <th className="py-3.5 px-4 font-medium">Items</th>
                <th className="py-3.5 px-4 font-medium">Status</th>
                <th className="py-3.5 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-white">{cat.name}</td>
                  <td className="py-3.5 px-4 text-slate-400 truncate max-w-xs">
                    {cat.description || '—'}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-400">{cat.sortOrder}</td>
                  <td className="py-3.5 px-4">{cat.itemCount}</td>
                  <td className="py-3.5 px-4">
                    <button
                      onClick={() => onToggleStatus(cat)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        cat.isActive
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => onEditCategory(cat)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="Edit Category"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
