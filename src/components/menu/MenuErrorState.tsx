'use client';

import React from 'react';
import { UtensilsCrossed, AlertTriangle, RefreshCw } from 'lucide-react';

interface MenuErrorStateProps {
  error: string | null;
  code?: string;
}

export function MenuErrorState({ error, code }: MenuErrorStateProps) {
  const isOccupied =
    code === 'TABLE_OCCUPIED' ||
    (error && (error.toLowerCase().includes('in use') || error.toLowerCase().includes('active dining session')));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
      <div
        className={`glass-panel max-w-sm sm:max-w-md w-full rounded-3xl p-6 sm:p-8 text-center shadow-2xl border ${
          isOccupied
            ? 'border-amber-800/50 bg-slate-900/90'
            : 'border-red-900/40 bg-slate-900/90'
        }`}
      >
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border ${
            isOccupied
              ? 'bg-amber-950/60 border-amber-800/60 text-amber-400'
              : 'bg-red-950/60 border-red-800/60 text-red-400'
          }`}
        >
          {isOccupied ? (
            <UtensilsCrossed className="w-7 h-7" />
          ) : (
            <AlertTriangle className="w-7 h-7" />
          )}
        </div>

        <h1 className="text-lg sm:text-xl font-bold text-white mb-2">
          {isOccupied ? 'Table Currently in Use' : 'Unable to Open Menu'}
        </h1>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
          {error ||
            (isOccupied
              ? 'This table is currently in use. Please ask a team member for assistance.'
              : 'Unable to load menu for this table. Please scan the QR code again.')}
        </p>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-xs text-slate-400 text-left space-y-2 mb-6">
          <p className="font-semibold text-slate-200">
            {isOccupied ? 'What to do next:' : 'How to proceed:'}
          </p>
          {isOccupied ? (
            <>
              <p>• If you just sat down at this table, please ask our team to clear it for you.</p>
              <p>• Once staff clears the table, tap the button below to start dining.</p>
            </>
          ) : (
            <>
              <p>• Please scan the table QR code again.</p>
              <p>• If the problem continues, please ask our team for assistance.</p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`w-full min-h-[44px] py-3 px-4 rounded-xl text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all touch-manipulation ${
            isOccupied
              ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
              : 'bg-orange-600 hover:bg-orange-500 shadow-orange-600/20'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          <span>{isOccupied ? 'Check Table Availability' : 'Retry'}</span>
        </button>
      </div>
    </div>
  );
}
