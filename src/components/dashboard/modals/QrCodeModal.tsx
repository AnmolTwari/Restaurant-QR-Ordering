'use client';

import React, { useState } from 'react';
import {
  QrCode,
  Loader2,
  Copy,
  CheckCircle2,
  Printer,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { RestaurantTableData, RestaurantSummary } from '@/types/dashboard';

interface QrCodeModalProps {
  isOpen: boolean;
  table: RestaurantTableData | null;
  restaurant: RestaurantSummary | null;
  qrDataUrl: string;
  qrMenuUrl: string;
  loading: boolean;
  onClose: () => void;
  onRotate: () => Promise<void>;
  onRevoke: () => Promise<void>;
}

export function QrCodeModal({
  isOpen,
  table,
  restaurant,
  qrDataUrl,
  qrMenuUrl,
  loading,
  onClose,
  onRotate,
  onRevoke,
}: QrCodeModalProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!isOpen || !table) return null;

  function handleCopyMenuUrl() {
    if (!qrMenuUrl) return;
    void navigator.clipboard.writeText(qrMenuUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  }

  function handlePrintQrStand() {
    window.print();
  }

  return (
    <>
      {/* On-Screen Modal View */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md print:hidden">
        <div className="glass-panel rounded-3xl border border-slate-800 p-6 sm:p-8 w-full max-w-md shadow-2xl relative text-center">
          {/* Table & QR Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold mb-3">
            <QrCode className="w-3.5 h-3.5" />
            <span>Table {table.tableNumber}</span>
          </div>

          <h3 className="text-xl font-bold text-white mb-1">
            {restaurant?.name}
          </h3>
          <p className="text-xs text-slate-400 mb-6">
            Customers scan this code on their mobile device to open the digital menu.
          </p>

          {/* QR Image Box */}
          <div className="p-4 bg-white rounded-2xl inline-block shadow-xl mb-5">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code for Table ${table.tableNumber}`}
                className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}
          </div>

          {/* Public URL Box */}
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 mb-6 text-left">
            <span className="text-[11px] font-mono text-slate-400 truncate flex-1 pl-2">
              {qrMenuUrl}
            </span>
            <button
              onClick={handleCopyMenuUrl}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1 shrink-0"
            >
              {copiedUrl ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              onClick={handlePrintQrStand}
              className="py-2.5 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-orange-600/20"
            >
              <Printer className="w-4 h-4" />
              <span>Print Stand</span>
            </button>

            <a
              href={qrMenuUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-medium text-xs flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Test Menu</span>
            </a>
          </div>

          {/* Security Actions (Rotate & Revoke) */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <button
              onClick={onRotate}
              disabled={loading}
              className="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
              title="Invalidates previous QR code and generates a new one"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Rotate Token</span>
            </button>

            <button
              onClick={onRevoke}
              disabled={loading}
              className="text-red-400 hover:text-red-300 font-medium flex items-center gap-1"
              title="Revokes QR code access immediately"
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Revoke QR</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* PRINT-FRIENDLY QR STAND VIEW (Visible only during window.print()) */}
      <div className="hidden print:flex flex-col items-center justify-center min-h-screen bg-white text-black p-8 text-center">
        <div className="border-4 border-black p-10 rounded-3xl max-w-md w-full">
          <h1 className="text-3xl font-black uppercase tracking-tight mb-2">
            {restaurant?.name}
          </h1>
          <div className="text-xl font-bold bg-black text-white py-2 px-6 rounded-full inline-block mb-6">
            TABLE {table.tableNumber}
          </div>

          <div className="p-4 border-2 border-dashed border-gray-400 rounded-2xl mb-6 inline-block">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt={`QR Table ${table.tableNumber}`}
                className="w-64 h-64 mx-auto"
              />
            )}
          </div>

          <p className="text-lg font-bold text-gray-900 mb-1">
            Scan with your phone camera
          </p>
          <p className="text-sm text-gray-600">
            View our full digital menu and place your order
          </p>
        </div>
      </div>
    </>
  );
}
