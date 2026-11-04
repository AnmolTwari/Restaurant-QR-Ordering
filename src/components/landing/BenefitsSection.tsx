import React from 'react';
import { Clock, ChefHat, LayoutGrid, Layers, ArrowUpRight } from 'lucide-react';

const OWNER_BENEFITS = [
  {
    icon: Clock,
    title: 'Less Manual Order Taking',
    tagline: 'Faster turnaround, fewer order mistakes',
    description:
      'Servers spend less time writing down orders by hand and repeating tickets. Guests order at their own pace directly from their phone, resulting in faster ordering cycles and higher average check sizes.',
    impact: 'Up to 35% faster guest seating-to-order turnaround',
  },
  {
    icon: ChefHat,
    title: 'Better Kitchen Coordination',
    tagline: 'Direct-to-station ticket routing',
    description:
      'Kitchen staff receive clear digital tickets with item notes, modifications, and exact order timestamps. Eliminates handwritten illegible tickets, lost orders, and miscommunicated guest requirements.',
    impact: 'Zero lost tickets & synchronized preparation timers',
  },
  {
    icon: LayoutGrid,
    title: 'Easier Table Management',
    tagline: 'Real-time dining session awareness',
    description:
      'Staff monitor live table status (Available, Occupied, Settle Pending) at a glance. When a table is cleared, the session is atomically closed, guaranteeing that subsequent guests never see previous bills.',
    impact: 'Instant table clearance with zero session crosstalk',
  },
  {
    icon: Layers,
    title: 'Centralized Restaurant Operations',
    tagline: 'One unified workspace for the whole team',
    description:
      'Role-based permissions for Owners, Managers, Cashiers, Waiters, and Kitchen staff. One integrated platform handles menus, table QR tokens, live tickets, cash counter settlements, and itemized receipts.',
    impact: 'Strict multi-role authorization & tenant isolation',
  },
];

export function BenefitsSection() {
  return (
    <section id="benefits" className="py-20 lg:py-28 border-t border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            Owner Value
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Designed to Boost Efficiency and Margins
          </h2>
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed">
            DineFlow is built from the ground up to address real dining friction points:
            labor shortages, kitchen delays, order inaccuracies, and payment bottlenecks.
          </p>
        </div>

        {/* Benefits 2x2 Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {OWNER_BENEFITS.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div
                key={benefit.title}
                className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 sm:p-8 flex flex-col justify-between hover:border-slate-700 transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                      <span>Key Benefit</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-1.5">
                    {benefit.title}
                  </h3>
                  <p className="text-xs font-semibold text-orange-400/90 mb-4 font-mono">
                    {benefit.tagline}
                  </p>

                  <p className="text-sm text-slate-400 leading-relaxed mb-6 font-normal">
                    {benefit.description}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs font-medium text-emerald-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>{benefit.impact}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
