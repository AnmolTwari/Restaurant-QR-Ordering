'use client';

import React from 'react';
import { X, Trash2, Plus, Minus, UtensilsCrossed, Loader2, ArrowRight } from 'lucide-react';
import type { CartItem } from '@/types/orders';
import { formatMoney } from '@/lib/formatters';

interface CartDrawerProps {
  isOpen: boolean;
  items: CartItem[];
  orderNotes: string;
  currency?: string;
  subtotal: number;
  submitting: boolean;
  disabledReason?: string | null;
  onClose: () => void;
  onUpdateQuantity: (menuItemId: string, delta: number) => void;
  onUpdateItemNotes: (menuItemId: string, notes: string) => void;
  onRemoveItem: (menuItemId: string) => void;
  onOrderNotesChange: (notes: string) => void;
  onSubmitOrder: () => void;
}

export function CartDrawer({
  isOpen,
  items,
  orderNotes,
  currency = 'INR',
  subtotal,
  submitting,
  disabledReason,
  onClose,
  onUpdateQuantity,
  onUpdateItemNotes,
  onRemoveItem,
  onOrderNotesChange,
  onSubmitOrder,
}: CartDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-slate-950 border-l border-slate-800 h-full flex flex-col text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-orange-500" />
            <h2 className="text-base sm:text-lg font-bold text-white">Your Dining Cart</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-mono font-medium">
              {items.reduce((s, i) => s + i.quantity, 0)} items
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-16 text-slate-500 space-y-3">
              <UtensilsCrossed className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-sm font-medium">Your cart is empty.</p>
              <p className="text-xs text-slate-500">
                Browse our menu and tap &quot;Add&quot; on any item to get started.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.menuItemId}
                className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <span className="text-[10px] font-medium text-orange-400">
                      {item.categoryName}
                    </span>
                    <h4 className="text-sm font-semibold text-white">{item.name}</h4>
                    <div className="text-xs font-mono text-slate-300 font-semibold mt-0.5">
                      {formatMoney(item.price * item.quantity, currency)}
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => onUpdateQuantity(item.menuItemId, -1)}
                      className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-xs font-mono font-bold text-white">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(item.menuItemId, 1)}
                      className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onRemoveItem(item.menuItemId)}
                      className="p-1 hover:bg-red-950/60 rounded-lg text-slate-500 hover:text-red-400 ml-1 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Item-specific preparation note */}
                <input
                  type="text"
                  value={item.notes || ''}
                  onChange={(e) => onUpdateItemNotes(item.menuItemId, e.target.value)}
                  placeholder="Special instructions (e.g., less spicy, extra lemon)..."
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800/80 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500/40"
                />
              </div>
            ))
          )}

          {/* General Order Notes */}
          {items.length > 0 && (
            <div className="pt-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                General Kitchen Notes
              </label>
              <textarea
                rows={2}
                value={orderNotes}
                onChange={(e) => onOrderNotesChange(e.target.value)}
                placeholder="Allergies, table preferences, or delivery timing..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-none"
              />
            </div>
          )}
        </div>

        {/* Footer & Submit */}
        {items.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/40 space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Subtotal</span>
                <span className="font-mono text-slate-200">{formatMoney(subtotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Taxes & Fees</span>
                <span className="font-mono text-slate-200">{formatMoney(0, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                <span>Estimated Total</span>
                <span className="font-mono text-orange-400 text-base">
                  {formatMoney(subtotal, currency)}
                </span>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 text-center">
              Items and totals will be confirmed and logged by server-side verification.
            </p>

            <button
              onClick={onSubmitOrder}
              disabled={submitting || Boolean(disabledReason)}
              className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20 transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Placing Order...</span>
                </>
              ) : disabledReason ? (
                <span>{disabledReason}</span>
              ) : (
                <>
                  <span>Place Dine-In Order</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
