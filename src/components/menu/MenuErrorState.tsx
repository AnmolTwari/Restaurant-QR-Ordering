'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface MenuErrorStateProps {
  error: string | null;
}

export function MenuErrorState({ error }: MenuErrorStateProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="glass-panel max-w-md w-full rounded-3xl p-8 border border-red-900/40 text-center shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-red-950/60 border border-red-800/60 text-red-400 flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">QR Code Access Error</h1>
        <p className="text-sm text-slate-400 leading-relaxed mb-6">
          {error || 'Unable to load menu for this table. The QR code may have rotated or expired.'}
        </p>
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 text-left space-y-2">
          <p className="font-semibold text-slate-200">How to proceed:</p>
          <p>1. Please scan the QR code sticker placed on your table again.</p>
          <p>2. If the issue persists, inform your waiter to refresh the table QR code.</p>
        </div>
      </div>
    </div>
  );
}
