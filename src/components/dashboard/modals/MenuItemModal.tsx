'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { Category, MenuItem } from '@/types/dashboard';

interface MenuItemModalProps {
  isOpen: boolean;
  editingItem: MenuItem | null;
  categories: Category[];
  currency?: string;
  loading: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string | null;
    categoryId: string;
    priceMajor: string;
    imageUrl: string | null;
    isAvailable: boolean;
  }) => Promise<void>;
}

export function MenuItemModal({
  isOpen,
  editingItem,
  categories,
  currency = 'INR',
  loading,
  onClose,
  onSave,
}: MenuItemModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priceMajor, setPriceMajor] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setDescription(editingItem.description || '');
      setCategoryId(editingItem.categoryId);
      setPriceMajor((editingItem.price / 100).toString());
      setImageUrl(editingItem.imageUrl || '');
      setIsAvailable(editingItem.isAvailable);
    } else {
      setName('');
      setDescription('');
      setCategoryId(categories[0]?.id || '');
      setPriceMajor('');
      setImageUrl('');
      setIsAvailable(true);
    }
  }, [editingItem, categories, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !categoryId || !priceMajor) return;
    await onSave({
      name: name.trim(),
      description: description.trim() || null,
      categoryId,
      priceMajor,
      imageUrl: imageUrl.trim() || null,
      isAvailable,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm print:hidden">
      <div className="glass-panel rounded-2xl border border-slate-800 p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-semibold text-white mb-4">
          {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="modalItemName">
              Item Name *
            </label>
            <input
              id="modalItemName"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Truffle Mushroom Risotto"
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="modalItemCategory">
                Category *
              </label>
              <select
                id="modalItemCategory"
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="modalItemPrice">
                Price ({currency}) *
              </label>
              <input
                id="modalItemPrice"
                type="number"
                step="0.01"
                min="0"
                required
                value={priceMajor}
                onChange={(e) => setPriceMajor(e.target.value)}
                placeholder="250.00"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="modalItemDesc">
              Description
            </label>
            <textarea
              id="modalItemDesc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Arborio rice cooked with wild porcini mushrooms, parmesan and white truffle oil."
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="modalItemImage">
              Image URL (optional)
            </label>
            <input
              id="modalItemImage"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>

          <div className="flex items-center gap-3 py-2">
            <input
              id="modalItemAvailable"
              type="checkbox"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
              className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 bg-slate-900 border-slate-800"
            />
            <label htmlFor="modalItemAvailable" className="text-xs text-slate-300 select-none">
              Available for customers to order immediately
            </label>
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
              disabled={loading || !name.trim() || !priceMajor}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{editingItem ? 'Update Item' : 'Add Item'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
