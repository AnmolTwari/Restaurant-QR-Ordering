'use client';

import React from 'react';
import Link from 'next/link';
import { Printer, ArrowLeft } from 'lucide-react';

interface ReceiptActionsProps {
  restaurantSlug: string;
}

export function ReceiptActions({ restaurantSlug }: ReceiptActionsProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-md mx-auto mb-4 flex items-center justify-between print:hidden">
      <Link
        href={`/m/${restaurantSlug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Menu
      </Link>
      <button
        onClick={handlePrint}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors px-4 py-1.5 rounded-lg shadow-sm"
      >
        <Printer className="w-4 h-4" />
        Print Receipt
      </button>
    </div>
  );
}
