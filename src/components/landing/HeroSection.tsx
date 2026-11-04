import React from 'react';
import Link from 'next/link';
import { ChevronRight, Sparkles, ArrowDown } from 'lucide-react';
import { ProductPreview } from './ProductPreview';

export function HeroSection() {
  return (
    <section className="relative pt-12 pb-20 lg:pt-20 lg:pb-28 overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-orange-600/10 via-amber-500/5 to-transparent blur-3xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Feature Pill */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 shadow-inner">
            <span className="flex h-2 w-2 rounded-full bg-orange-400" />
            <span className="font-medium">Modern Restaurant QR Management</span>
            <span className="text-slate-500">·</span>
            <span className="text-orange-400 font-semibold">Zero Guest App Required</span>
          </div>
        </div>

        {/* Hero Title & Subtext */}
        <div className="text-center max-w-4xl mx-auto space-y-6">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.12]">
            Smarter Ordering.{' '}
            <span className="block mt-1 sm:mt-2 bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-200">
              Smoother Restaurant Operations.
            </span>
          </h1>

          <p className="text-base sm:text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-normal">
            Let customers scan, browse your menu and order directly from their tables.
            Manage orders, payments and kitchen operations from one simple platform.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
            <Link
              href="/register"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm shadow-xl shadow-orange-600/25 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <span>Get Started Free</span>
              <ChevronRight className="w-4 h-4" />
            </Link>

            <Link
              href="#features"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white font-medium text-sm border border-slate-800 shadow-sm flex items-center justify-center gap-2 transition-colors"
            >
              <span>Explore Features</span>
              <ArrowDown className="w-4 h-4 text-slate-400" />
            </Link>
          </div>

          {/* Micro trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500 pt-2 font-medium">
            <span>✓ Instant QR generation</span>
            <span>✓ Real-time KDS display</span>
            <span>✓ Cash & Razorpay payments</span>
            <span>✓ Multi-role staff access</span>
          </div>
        </div>

        {/* Realistic Product Preview */}
        <ProductPreview />
      </div>
    </section>
  );
}
