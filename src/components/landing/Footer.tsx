import React from 'react';
import Link from 'next/link';
import { UtensilsCrossed, Shield, CheckCircle2 } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 py-12 text-slate-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand & Description */}
          <div className="md:col-span-2 space-y-3">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
                <UtensilsCrossed className="w-4 h-4" />
              </div>
              <span className="font-bold text-base text-white tracking-tight">
                DineFlow
              </span>
            </Link>

            <p className="text-slate-400 max-w-sm leading-relaxed text-xs">
              Modern contactless QR ordering and management platform for restaurants.
              Streamline guest orders, sync kitchen displays, and simplify table turnover.
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Platform Active · High Concurrency PostgreSQL</span>
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Product
            </h4>
            <ul className="space-y-2 text-slate-400 text-xs">
              <li>
                <Link href="#features" className="hover:text-white transition-colors">
                  Platform Features
                </Link>
              </li>
              <li>
                <Link href="#how-it-works" className="hover:text-white transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="#benefits" className="hover:text-white transition-colors">
                  Restaurant Benefits
                </Link>
              </li>
              <li>
                <Link href="/health" className="hover:text-white transition-colors">
                  System Health Check
                </Link>
              </li>
            </ul>
          </div>

          {/* Workspace Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Workspace
            </h4>
            <ul className="space-y-2 text-slate-400 text-xs">
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  Staff Sign In
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-white transition-colors">
                  Register Restaurant
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-white transition-colors">
                  Management Dashboard
                </Link>
              </li>
              <li>
                <Link href="/kitchen" className="hover:text-white transition-colors">
                  Kitchen Display (KDS)
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500 text-[11px]">
          <p>© {currentYear} DineFlow QR Ordering SaaS. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cryptographic Session Isolation</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
