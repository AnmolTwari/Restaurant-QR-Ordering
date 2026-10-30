'use client';

import React, { useState } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

export type CancellationReason =
  | 'Item unavailable'
  | 'Ingredient out of stock'
  | 'Equipment issue'
  | 'Other';

interface CancelItemModalProps {
  isOpen: boolean;
  orderNumber: string;
  item: { id: string; nameSnapshot: string; quantity: number } | null;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: (reason: CancellationReason, note?: string) => Promise<void>;
}

const CANCELLATION_REASONS: CancellationReason[] = [
  'Item unavailable',
  'Ingredient out of stock',
  'Equipment issue',
  'Other',
];

export function CancelItemModal({
  isOpen,
  orderNumber,
  item,
  isLoading,
  onClose,
  onConfirm,
}: CancelItemModalProps) {
  const [selectedReason, setSelectedReason] = useState<CancellationReason>('Item unavailable');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !item) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await onConfirm(selectedReason, note.trim() || undefined);
      setNote('');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl text-slate-100 relative">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-5 right-5 p-1 text-slate-400 hover:text-white rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Cancel Order Item</h2>
            <p className="text-xs text-slate-400">Order #{orderNumber}</p>
          </div>
        </div>

        <div className="p-3 mb-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs">
          <span className="text-slate-400">Target Item: </span>
          <span className="font-bold text-white">
            {item.quantity}x {item.nameSnapshot}
          </span>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-300 mb-2">
              Reason for Cancellation <span className="text-rose-400">*</span>
            </label>
            <div className="space-y-2">
              {CANCELLATION_REASONS.map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    selectedReason === reason
                      ? 'bg-rose-950/30 border-rose-600/60 text-white font-medium'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                    className="text-rose-600 focus:ring-rose-500 h-3.5 w-3.5"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1.5">
              Additional Note (optional)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Ran out of mushrooms during dinner rush"
              maxLength={200}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
            >
              Keep Item
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 transition-all"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Confirm Cancel</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

