'use client';

import React from 'react';
import Link from 'next/link';
import { Printer, ArrowLeft, MessageSquareShare } from 'lucide-react';
import { buildWhatsAppShareUrl } from '@/lib/billing/whatsapp';

interface ReceiptActionsProps {
  restaurantSlug: string;
  restaurantName?: string;
  orderNumber?: string;
  invoiceNumber?: string | null;
  totalFormatted?: string;
  billUrl?: string;
}

export function ReceiptActions({
  restaurantSlug,
  restaurantName,
  orderNumber,
  invoiceNumber,
  totalFormatted,
  billUrl,
}: ReceiptActionsProps) {
  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const targetUrl =
      billUrl || (typeof window !== 'undefined' ? window.location.href : '');

    const waUrl = buildWhatsAppShareUrl({
      restaurantName: restaurantName || 'Restaurant',
      orderNumber: orderNumber || '',
      invoiceNumber: invoiceNumber || null,
      totalFormatted: totalFormatted || '',
      billUrl: targetUrl,
    });

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="max-w-md mx-auto mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <Link
        href={`/m/${restaurantSlug}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Menu
      </Link>

      <div className="flex items-center gap-2">
        <button
          onClick={handleShareWhatsApp}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors px-3.5 py-2 rounded-xl shadow-sm"
          title="Share bill on WhatsApp"
        >
          <MessageSquareShare className="w-3.5 h-3.5 text-emerald-600" />
          <span>Share WhatsApp</span>
        </button>

        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors px-3.5 py-2 rounded-xl shadow-sm"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print</span>
        </button>
      </div>
    </div>
  );
}
