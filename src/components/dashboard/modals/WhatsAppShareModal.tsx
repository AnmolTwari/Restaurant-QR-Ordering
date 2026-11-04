'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  MessageSquare,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  FileText,
  AlertCircle,
} from 'lucide-react';

interface WhatsAppShareModalProps {
  isOpen: boolean;
  orderId: string;
  orderNumber: string;
  restaurantId: string;
  restaurantName?: string;
  totalFormatted: string;
  initialInvoiceNumber?: string | null;
  onClose: () => void;
  onInvoiceAssigned?: (invoiceNumber: string) => void;
}

export function WhatsAppShareModal({
  isOpen,
  orderId,
  orderNumber,
  restaurantId,
  restaurantName = 'DineFlow Restaurant',
  totalFormatted,
  initialInvoiceNumber,
  onClose,
  onInvoiceAssigned,
}: WhatsAppShareModalProps) {
  const [phone, setPhone] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(initialInvoiceNumber || null);
  const [billUrl, setBillUrl] = useState<string>('');
  const [whatsappUrl, setWhatsappUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fetchingExisting, setFetchingExisting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing invoice if present
  const checkExistingInvoice = useCallback(async () => {
    if (!isOpen || !orderId || !restaurantId) return;
    setFetchingExisting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/restaurants/${restaurantId}/orders/${orderId}/invoice`,
        { cache: 'no-store' },
      );
      const data = await res.json();
      if (res.ok && data.success && data.data.invoice) {
        setInvoiceNumber(data.data.invoice.invoiceNumber);
        if (data.data.invoice.customerPhone) {
          setPhone(data.data.invoice.customerPhone);
        }
        if (data.data.billUrl) setBillUrl(data.data.billUrl);
        if (data.data.whatsappUrl) setWhatsappUrl(data.data.whatsappUrl);
      }
    } catch {
      // Non-critical background lookup
    } finally {
      setFetchingExisting(false);
    }
  }, [isOpen, orderId, restaurantId]);

  useEffect(() => {
    if (isOpen) {
      void checkExistingInvoice();
    } else {
      setError(null);
      setCopied(false);
    }
  }, [isOpen, checkExistingInvoice]);

  if (!isOpen) return null;

  async function handleShareWhatsApp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/v1/restaurants/${restaurantId}/orders/${orderId}/invoice`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerPhone: phone.trim() || null,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to prepare bill invoice.');
      }

      const generatedInvoice = data.data.invoice;
      const targetWhatsappUrl = data.data.whatsappUrl;
      const targetBillUrl = data.data.billUrl;

      setInvoiceNumber(generatedInvoice.invoiceNumber);
      setBillUrl(targetBillUrl);
      setWhatsappUrl(targetWhatsappUrl);

      if (onInvoiceAssigned) {
        onInvoiceAssigned(generatedInvoice.invoiceNumber);
      }

      // Open WhatsApp Web / App
      if (targetWhatsappUrl) {
        window.open(targetWhatsappUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate WhatsApp share link.');
    } finally {
      setLoading(false);
    }
  }

  function handleCopyPreview() {
    const previewText = `🧾 *Bill for Order #${orderNumber}*\nRestaurant: *${restaurantName}*\nInvoice: ${
      invoiceNumber || 'INV-Pending'
    }\nTotal Amount: *${totalFormatted}*\n\nView your digital receipt & tax invoice:\n${
      billUrl || window.location.origin
    }\n\nThank you for dining with us!`;

    void navigator.clipboard.writeText(previewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel rounded-3xl border border-slate-800 p-6 sm:p-7 w-full max-w-lg shadow-2xl space-y-5 text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Share Bill on WhatsApp</h3>
              <p className="text-xs text-slate-400">
                Order #{orderNumber} • {totalFormatted}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-950/50 border border-red-800/80 text-xs text-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleShareWhatsApp} className="space-y-4">
          {/* Phone Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Customer WhatsApp Number
            </label>
            <div className="relative">
              <input
                type="tel"
                placeholder="e.g. 9876543210 (or with country code)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              10-digit Indian numbers automatically default to <span className="font-mono text-slate-300">+91</span>. You can also leave blank to open WhatsApp with the prefilled message.
            </p>
          </div>

          {/* Invoice status badge */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300">Invoice Number:</span>
            </div>
            {fetchingExisting ? (
              <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Checking...
              </span>
            ) : invoiceNumber ? (
              <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/80">
                {invoiceNumber}
              </span>
            ) : (
              <span className="text-amber-400 text-[11px] font-medium">
                Auto-assigned on share
              </span>
            )}
          </div>

          {/* WhatsApp Message Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">
                Live Message Preview
              </label>
              <button
                type="button"
                onClick={handleCopyPreview}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-900/40 text-xs font-mono text-slate-300 space-y-1 leading-relaxed relative">
              <div className="absolute top-2 right-2 text-[10px] text-emerald-500/80 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/30">
                WhatsApp Preview
              </div>
              <p className="font-bold text-white">🧾 Bill for Order #{orderNumber}</p>
              <p>Restaurant: <span className="text-slate-200">{restaurantName}</span></p>
              <p>Invoice: <span className="text-emerald-400">{invoiceNumber || 'INV-Pending'}</span></p>
              <p>Total Amount: <span className="font-bold text-white">{totalFormatted}</span></p>
              <p className="pt-1 text-[11px] text-slate-400">
                View your digital receipt & tax invoice:
              </p>
              <p className="text-emerald-400 truncate text-[11px]">
                {billUrl || '(Digital Receipt Link will be attached)'}
              </p>
              <p className="pt-1 text-[10px] text-slate-500 italic">
                Thank you for dining with us!
              </p>
            </div>
          </div>

          {/* Dialog Action Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Preparing Bill...</span>
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in WhatsApp</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
