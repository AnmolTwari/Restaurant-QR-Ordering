import React from 'react';
import {
  UtensilsCrossed,
  Clock,
  CheckCircle2,
  ChefHat,
  Sparkles,
  ShoppingBag,
  QrCode,
  ShieldCheck,
} from 'lucide-react';

export function ProductPreview() {
  return (
    <div className="relative w-full max-w-6xl mx-auto mt-12 lg:mt-16">
      {/* Decorative background glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-orange-600/10 via-amber-500/5 to-transparent rounded-3xl blur-2xl -z-10" />

      {/* Main Container with subtle border */}
      <div className="relative rounded-3xl border border-slate-800/80 bg-slate-900/60 p-4 sm:p-6 lg:p-8 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Mockup Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <div className="h-4 w-px bg-slate-800 hidden sm:block" />
            <span className="text-xs font-mono text-slate-400 hidden sm:inline">
              dineflow.app/dashboard · live operational view
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Table 04 Active</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium">
              <ChefHat className="w-3.5 h-3.5 text-orange-400" />
              <span>KDS Synchronized</span>
            </div>
          </div>
        </div>

        {/* Dual Experience Grid: Left = Staff / KDS; Right = Customer Mobile Experience */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left Column: Staff Operations & Kitchen Display (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Kitchen Display & Table Queue</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20 font-mono">
                    Real-Time
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tickets auto-populate when customers tap Order at their table.
                </p>
              </div>
            </div>

            {/* Simulated Live Order Ticket */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 sm:p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-xs">
                    T4
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-white">#ORD-261104</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        PREPARING
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>Placed 2m ago</span>
                      <span>·</span>
                      <span className="text-slate-300 font-medium">Table 04 (Main Dining)</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-400">Order Total</span>
                  <div className="font-mono font-bold text-sm text-white">₹550.00</div>
                </div>
              </div>

              {/* Ticket Items */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/50">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-slate-800 text-orange-400 font-bold flex items-center justify-center text-[11px]">
                      1×
                    </span>
                    <span className="font-medium text-slate-200">Paneer Tikka</span>
                    <span className="text-[10px] text-amber-400/90 italic">
                      (Extra mint chutney)
                    </span>
                  </div>
                  <span className="font-mono text-slate-400">₹320.00</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/50">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-slate-800 text-orange-400 font-bold flex items-center justify-center text-[11px]">
                      2×
                    </span>
                    <span className="font-medium text-slate-200">Butter Naan</span>
                  </div>
                  <span className="font-mono text-slate-400">₹120.00</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/50">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-slate-800 text-orange-400 font-bold flex items-center justify-center text-[11px]">
                      1×
                    </span>
                    <span className="font-medium text-slate-200">Mango Lassi</span>
                  </div>
                  <span className="font-mono text-slate-400">₹110.00</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Verified session · Cryptographic QR match</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium">
                    Mark Ready
                  </span>
                  <span className="px-3 py-1.5 rounded-lg bg-emerald-600/90 text-white text-xs font-semibold">
                    Clear Table Ready
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Multi-Table Indicator Bar */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 text-center">
                <span className="text-[11px] text-slate-400 block">Table 01</span>
                <span className="text-xs font-bold text-emerald-400">Available</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 text-center">
                <span className="text-[11px] text-slate-400 block">Table 02</span>
                <span className="text-xs font-bold text-amber-400">Occupied · ₹850</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-orange-500/30 text-center bg-orange-500/5">
                <span className="text-[11px] text-orange-300 block">Table 04</span>
                <span className="text-xs font-bold text-white">Dining · ₹550</span>
              </div>
            </div>
          </div>

          {/* Right Column: Customer Mobile Menu Phone Frame (5 Cols) */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-[310px] rounded-[36px] border-[6px] border-slate-800 bg-slate-950 p-4 shadow-2xl">
              {/* Phone Speaker & Notch */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-800 rounded-full flex items-center justify-center">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-900 mr-2" />
                <span className="w-8 h-1 bg-slate-700 rounded-full" />
              </div>

              {/* Mobile Content Area */}
              <div className="pt-5 space-y-3.5">
                {/* Guest Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-orange-600 flex items-center justify-center text-white">
                      <UtensilsCrossed className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block leading-tight">
                        The Spice Bistro
                      </span>
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Table 04 · Active
                      </span>
                    </div>
                  </div>
                  <div className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                    <QrCode className="w-4 h-4" />
                  </div>
                </div>

                {/* Dietary Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[10px]">
                  <span className="px-2.5 py-1 rounded-full bg-orange-600 text-white font-medium shrink-0">
                    Starters
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-900 text-slate-300 border border-slate-800 shrink-0">
                    Mains
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-900 text-slate-300 border border-slate-800 shrink-0">
                    Breads
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-900 text-slate-300 border border-slate-800 shrink-0">
                    Drinks
                  </span>
                </div>

                {/* Dish Item Card 1 */}
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 border border-emerald-500 rounded-sm flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        </span>
                        <span className="text-xs font-bold text-white">Paneer Tikka</span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-1">
                        Cottage cheese grilled with bell peppers
                      </p>
                    </div>
                    <span className="text-xs font-bold font-mono text-emerald-400">₹320</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">
                      Chef Special
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white">
                      Added (1)
                    </span>
                  </div>
                </div>

                {/* Dish Item Card 2 */}
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 border border-emerald-500 rounded-sm flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        </span>
                        <span className="text-xs font-bold text-white">Butter Naan</span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-1">
                        Traditional tandoor baked flatbread
                      </p>
                    </div>
                    <span className="text-xs font-bold font-mono text-slate-300">₹60</span>
                  </div>
                  <div className="flex items-center justify-end pt-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white">
                      + Add
                    </span>
                  </div>
                </div>

                {/* Floating Cart Indicator */}
                <div className="p-2.5 rounded-2xl bg-orange-600 text-white flex items-center justify-between shadow-lg shadow-orange-600/30">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-bold">1 item · ₹320.00</span>
                  </div>
                  <span className="text-[10px] font-bold bg-white text-orange-600 px-2 py-0.5 rounded-lg">
                    View Cart →
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights Ribbon */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Zero App Downloads</p>
              <p className="text-[11px] text-slate-400">Works in any mobile browser</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <ChefHat className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Live Kitchen Sync</p>
              <p className="text-[11px] text-slate-400">Instant ticket display & timers</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Protected Dining Sessions</p>
              <p className="text-[11px] text-slate-400">No cross-customer bill leakage</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
