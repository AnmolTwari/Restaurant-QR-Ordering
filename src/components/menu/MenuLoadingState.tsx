'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export function MenuLoadingState() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-12 h-12 rounded-2xl bg-orange-600/10 border border-orange-500/20 text-orange-500 flex items-center justify-center mb-4">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
      <p className="text-sm font-medium text-slate-300">Loading digital menu...</p>
      <p className="text-xs text-slate-500 mt-1">Verifying your table session</p>
    </div>
  );
}
