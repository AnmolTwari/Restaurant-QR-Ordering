import React from 'react';
import {
  QrCode,
  BookOpen,
  Activity,
  ChefHat,
  Users2,
  Banknote,
  Receipt,
  CheckCircle,
} from 'lucide-react';

const PRODUCT_FEATURES = [
  {
    icon: QrCode,
    title: 'QR-Based Table Ordering',
    badge: 'Guest Experience',
    description:
      'Generate secure 256-bit cryptographic QR codes for every dining table. Guests scan with any camera to start an isolated dining session without installing an app or registering.',
    highlight: 'Cryptographic session tokens & zero crosstalk',
  },
  {
    icon: BookOpen,
    title: 'Digital Menu Management',
    badge: 'Menu Control',
    description:
      'Organize items by categories, set precise pricing, specify dietary badges (Veg, Non-Veg, Vegan, Gluten-Free), and toggle live dish availability instantly across all tables.',
    highlight: 'Real-time out-of-stock toggles',
  },
  {
    icon: Activity,
    title: 'Live Order Tracking',
    badge: 'Real-Time Sync',
    description:
      'Guests view live progress of their dishes as tickets move from order placement through kitchen acceptance, preparation, and serving, with complete status history.',
    highlight: 'Instant order status timeline',
  },
  {
    icon: ChefHat,
    title: 'Kitchen Display System (KDS)',
    badge: 'Kitchen Workflow',
    description:
      'Kitchen staff manage live order queues with ticket timers, custom chef notes, item-level cancellations, and atomic state transitions (Pending → Preparing → Ready → Served).',
    highlight: 'Station sync with preparation timers',
  },
  {
    icon: Users2,
    title: 'Table & Dining Session Lifecycle',
    badge: 'Session Security',
    description:
      'Enforce strict table session lifecycle management. Staff clear tables atomically upon completion, ensuring new guests at the same table never see a previous customer’s orders.',
    highlight: 'Atomic session closure & clearance checks',
  },
  {
    icon: Banknote,
    title: 'Cash & Counter Payments',
    badge: 'Dual Payments',
    description:
      'Settle cash payments directly from the Clear Table modal or register. Supports both in-person counter settlement and Razorpay online checkout with HMAC verification.',
    highlight: 'Staff settlement audit & receipt verification',
  },
  {
    icon: Receipt,
    title: 'Order Management & Receipts',
    badge: 'Auditing',
    description:
      'View comprehensive order histories, filter by date and status, and generate cryptographically scoped printable customer receipts with exact tax breakdowns.',
    highlight: 'Itemized receipts & payment reconciliation',
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 lg:py-28 border-t border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold uppercase tracking-wider">
            Capabilities
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Engineered for Modern Dining & Operational Excellence
          </h2>
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed">
            Every feature is purpose-built to accelerate table turns, eliminate ordering bottlenecks,
            and provide total transactional reliability for restaurant teams.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PRODUCT_FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between hover:border-orange-500/30 transition-all duration-200 group ${
                  idx === 0 ? 'md:col-span-2 lg:col-span-1' : ''
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700/50">
                      {feature.badge}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2 group-hover:text-orange-300 transition-colors">
                    {feature.title}
                  </h3>

                  <p className="text-sm text-slate-400 leading-relaxed mb-6 font-normal">
                    {feature.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800/80 flex items-center gap-2 text-xs text-slate-300 font-medium">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-slate-300">{feature.highlight}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
