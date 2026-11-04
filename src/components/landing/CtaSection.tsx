import React from 'react';
import Link from 'next/link';
import { ChevronRight, LogIn, Sparkles } from 'lucide-react';

export function CtaSection() {
  return (
    <section className="py-20 lg:py-28 border-t border-slate-800/80 relative overflow-hidden">
      {/* Background radial gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-orange-600/10 via-amber-500/5 to-transparent pointer-events-none -z-10" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 sm:p-12 lg:p-16 backdrop-blur-xl shadow-2xl relative">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold uppercase tracking-wider mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ready for Smarter Restaurant Service?</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight max-w-2xl mx-auto leading-tight mb-4">
            Transform Your Dining Experience Today
          </h2>

          <p className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto leading-relaxed mb-8">
            Set up your digital menu, generate secure table QR codes, and connect your kitchen
            in minutes. Zero hardware requirements.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <Link
              href="/register"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm shadow-xl shadow-orange-600/25 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <span>Get Started Free</span>
              <ChevronRight className="w-4 h-4" />
            </Link>

            <Link
              href="/login"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 hover:text-white font-medium text-sm border border-slate-800 flex items-center justify-center gap-2 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In to Existing Account</span>
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500 font-medium">
            <span>✓ No credit card required</span>
            <span>✓ Instant QR token generation</span>
            <span>✓ Multi-tenant data isolation</span>
          </div>
        </div>
      </div>
    </section>
  );
}
