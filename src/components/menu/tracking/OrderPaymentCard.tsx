'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { formatMoney } from '@/lib/formatters';

interface RazorpayInstance {
  open: () => void;
}

interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

interface OrderPaymentCardProps {
  orderNumber: string;
  orderTotal: number;
  currency: string;
  restaurantSlug: string;
  paymentStatus: string;
  paymentMethod?: string;
  onPaymentSuccess: () => Promise<void>;
}

export function OrderPaymentCard({
  orderNumber,
  orderTotal,
  currency,
  restaurantSlug,
  paymentStatus,
  paymentMethod,
  onPaymentSuccess,
}: OrderPaymentCardProps) {
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const isPaid = paymentStatus === 'PAID';

  async function handlePayOnline() {
    setPaying(true);
    setPaymentError(null);

    try {
      if (typeof window !== 'undefined' && !window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Razorpay checkout SDK'));
          document.body.appendChild(script);
        });
      }

      const res = await fetch(`/api/v1/public/orders/${orderNumber}/pay`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Could not initiate online payment.');
      }

      const { gatewayOrderId, amount, currency: orderCurrency, keyId, restaurantName } = data.data;

      if (!keyId) {
        throw new Error('Payment gateway key is not configured for this restaurant.');
      }

      const options = {
        key: keyId,
        amount,
        currency: orderCurrency,
        name: restaurantName,
        description: `Payment for Order #${orderNumber}`,
        order_id: gatewayOrderId,
        handler: async function (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) {
          try {
            const verifyRes = await fetch(
              `/api/v1/public/orders/${orderNumber}/verify-payment`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(response),
              },
            );
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.success) {
              throw new Error(verifyData.error?.message || 'Signature verification failed.');
            }
            await onPaymentSuccess();
          } catch (err: unknown) {
            setPaymentError(err instanceof Error ? err.message : 'Verification failed.');
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: function () {
            setPaying(false);
          },
        },
        theme: {
          color: '#ea580c',
        },
      };

      if (!window.Razorpay) {
        throw new Error('Razorpay SDK failed to initialize');
      }
      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : 'Payment error occurred.');
      setPaying(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-800">Payment Status</h3>
        </div>

        <span
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
            isPaid
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}
        >
          {isPaid ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>PAID ({paymentMethod || 'VERIFIED'})</span>
            </>
          ) : (
            <span>UNPAID</span>
          )}
        </span>
      </div>

      {paymentError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{paymentError}</span>
        </div>
      )}

      {isPaid ? (
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-emerald-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Payment settled & verified.</span>
          </div>
          <Link
            href={`/m/${restaurantSlug}/receipt/${orderNumber}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>View Receipt</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={handlePayOnline}
            disabled={paying}
            className="w-full py-3 px-4 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {paying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Launching Gateway...</span>
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                <span>Pay Online ({formatMoney(orderTotal, currency)})</span>
              </>
            )}
          </button>
          <p className="text-[11px] text-slate-400 text-center">
            Or settle in cash / UPI at counter with restaurant staff.
          </p>
        </div>
      )}
    </div>
  );
}
