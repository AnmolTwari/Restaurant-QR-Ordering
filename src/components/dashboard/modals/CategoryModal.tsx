'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { Category } from '@/types/dashboard';

interface CategoryModalProps {
  isOpen: boolean;
  editingCategory: Category | null;
  defaultSortOrder: number;
  loading: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string | null; sortOrder: number }) => Promise<void>;
}

export function CategoryModal({
  isOpen,
  editingCategory,
  defaultSortOrder,
  loading,
  onClose,
  onSave,
}: CategoryModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (editingCategory) {
      setName(editingCategory.name);
      setDescription(editingCategory.description || '');
      setSortOrder(editingCategory.sortOrder);
    } else {
      setName('');
      setDescription('');
      setSortOrder(defaultSortOrder);
    }
  }, [editingCategory, defaultSortOrder, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onSave({
      name: name.trim(),
      description: description.trim() || null,
      sortOrder,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm print:hidden">
      <div className="glass-panel rounded-2xl border border-slate-800 p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-base font-semibold text-white mb-4">
          {editingCategory ? 'Edit Category' : 'Create New Category'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="modalCatName">
              Category Name *
            </label>
            <input
              id="modalCatName"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Starters & Appetizers"
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="modalCatDesc">
              Description
            </label>
            <textarea
              id="modalCatDesc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Freshly prepped appetizers and small plates"
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="modalCatSort">
              Display Sort Order
            </label>
            <input
              id="modalCatSort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{editingCategory ? 'Update Category' : 'Create Category'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
