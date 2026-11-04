import React from 'react';
import { Store, QrCode, Smartphone, ChefHat, CheckSquare } from 'lucide-react';

const STEPS = [
  {
    step: '01',
    icon: Store,
    title: 'Set up your restaurant and menu',
    description:
      'Configure your restaurant details, create custom categories, add dishes with accurate pricing, descriptions, and dietary badges in your management dashboard.',
  },
  {
    step: '02',
    icon: QrCode,
    title: 'Generate QR codes for tables',
    description:
      'Instantly generate cryptographically secure QR codes for each physical table. Download and print table tents or stickers with one click.',
  },
  {
    step: '03',
    icon: Smartphone,
    title: 'Customers scan and order',
    description:
      'Guests scan the table QR code using their smartphone camera. A secure dining session is established with the live digital menu ready to browse and order.',
  },
  {
    step: '04',
    icon: ChefHat,
    title: 'Kitchen receives orders',
    description:
      'Orders arrive immediately at the Kitchen Display System with preparation timers, special instructions, and item breakdowns for chef stations.',
  },
  {
    step: '05',
    icon: CheckSquare,
    title: 'Staff manage orders and payments',
    description:
      'Waiters deliver dishes, cashiers settle cash or online bills directly, and staff clear tables atomically so the next guest gets a fresh session.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 lg:py-28 border-t border-slate-800/80 bg-slate-950/40 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider">
            Workflow
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            How DineFlow Powers Your Service
          </h2>
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed">
            From setup to payment settlement, experience a seamless 5-step operational flow
            designed for speed, accuracy, and guest satisfaction.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="relative rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-between hover:border-slate-700 transition-colors group"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <span className="font-mono text-2xl font-black text-slate-700 group-hover:text-orange-500/60 transition-colors">
                      {item.step}
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-slate-800 text-orange-400 flex items-center justify-center group-hover:bg-orange-500/10 transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white mb-2 leading-snug">
                    {item.title}
                  </h3>

                  <p className="text-xs text-slate-400 leading-relaxed font-normal">
                    {item.description}
                  </p>
                </div>

                <div className="pt-4 mt-6 border-t border-slate-800/60 text-[11px] font-semibold text-orange-400/90 flex items-center gap-1">
                  <span>Step {item.step} Complete</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
