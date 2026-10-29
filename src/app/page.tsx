import Link from 'next/link';
import {
  UtensilsCrossed,
  QrCode,
  ChefHat,
  LayoutDashboard,
  Database,
  Layers,
  Server,
  Activity,
  CheckCircle2,
  ChevronRight,
  Terminal,
} from 'lucide-react';
import { getSystemHealth } from '@/lib/db-health';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const health = await getSystemHealth();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-orange-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      {/* Top Navbar */}
      <header className="relative z-10 border-b border-slate-800/80 glass-panel">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-amber-200 to-slate-100">
                DineFlow QR
              </span>
              <span className="ml-2 text-xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">
                Phase 5 Live
              </span>
            </div>
          </div>

          {/* Actions & Health Badge */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                health.status === 'ok'
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                  : 'bg-amber-950/60 text-amber-400 border-amber-800/60'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  health.status === 'ok'
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-amber-400'
                }`}
              />
              {health.status === 'ok' ? (
                <span>
                  System Online {health.database.latencyMs ? `(${health.database.latencyMs}ms)` : ''}
                </span>
              ) : (
                <span>Postgres Ready</span>
              )}
            </div>

            <Link
              href="/login"
              className="text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-xl hover:bg-slate-900 transition-colors hidden sm:inline"
            >
              Sign In
            </Link>

            <Link
              href="/dashboard"
              className="text-xs font-medium bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white px-3.5 py-1.5 rounded-xl shadow-lg shadow-orange-600/20 transition-all flex items-center gap-1.5"
            >
              <span>Dashboard</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 flex flex-col justify-center">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400 mb-6 shadow-inner">
            <Activity className="w-3.5 h-3.5 text-orange-400" />
            <span>Phase 5: Online Payments, Counter Settlement, Receipts & KDS Active</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight mb-5">
            Multi-Tenant QR Ordering
            <span className="block mt-2 bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-200">
              Built for Scale & Precision
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-400 leading-relaxed mb-8">
            Zero-install guest ordering, synchronized kitchen displays, waiter coordination,
            and strict tenant isolation with transactional consistency.
          </p>

          <div className="flex items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="px-5 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-medium text-sm shadow-xl shadow-orange-600/20 flex items-center gap-2 transition-all"
            >
              <span>Open Owner Dashboard</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
            <Link
              href="/register"
              className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-medium text-sm border border-slate-800 transition-colors"
            >
              Register New Restaurant
            </Link>
          </div>
        </div>

        {/* 4 Required Experiences Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-14">
          {/* Card 1: Customer QR Menu */}
          <div className="glass-card rounded-2xl p-6 transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center mb-4">
                <QrCode className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Customer QR Menu</h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">
                Mobile-optimized guest dining view with table session validation, live cart calculation, and instant payment dispatch.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-orange-400 font-medium">
              <span>Milestone: Phase 3</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>

          {/* Card 2: Owner Dashboard */}
          <Link
            href="/dashboard"
            className="glass-card rounded-2xl p-6 transition-all duration-200 flex flex-col justify-between hover:border-amber-500/50 group"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <LayoutDashboard className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2 group-hover:text-amber-400 transition-colors">
                Owner Dashboard
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">
                Restaurant profiles, categorized menu items, availability toggles, and cryptographic table QR generation.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-amber-400 font-medium">
              <span>Open Dashboard</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Card 3: Kitchen Display System (KDS) */}
          <div className="glass-card rounded-2xl p-6 transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                <ChefHat className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Kitchen Display</h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">
                Live queue with ticket timers, station filtering, and atomic status transitions (Pending → Accepted → Preparing → Ready).
              </p>
            </div>
            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-emerald-400 font-medium">
              <span>Milestone: Phase 4</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>

          {/* Card 4: Waiter / Cashier Terminal */}
          <div className="glass-card rounded-2xl p-6 transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
                <UtensilsCrossed className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Waiter & Cashier</h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">
                Table occupancy monitoring, manual counter payment settlements, and instant customer service call handling.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-indigo-400 font-medium">
              <span>Milestone: Phase 5</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Foundation Technical Verification Section */}
        <div className="glass-panel rounded-2xl p-6 sm:p-8 max-w-4xl mx-auto w-full border border-slate-800/80">
          <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-orange-400" />
              <h3 className="font-semibold text-white text-base sm:text-lg">
                Phase 1 Technical Foundation Status
              </h3>
            </div>
            <div className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Next.js 14 App Router
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/70">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-200">Full-Stack Framework</p>
                <p className="text-xs text-slate-400">Next.js 14 App Router with React 18 & TypeScript</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/70">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-200">REST API & Health Endpoints</p>
                <p className="text-xs text-slate-400">/api/v1/health & /health with DB latency check</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/70">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-200">Shared Domain Contracts</p>
                <p className="text-xs text-slate-400">UserRole, OrderStatus, PaymentStatus, TableStatus</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/70">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-200">Database & ORM Layer</p>
                <p className="text-xs text-slate-400">PostgreSQL + Prisma with 13 Core Models & Multi-Tenancy</p>
              </div>
            </div>
          </div>

          {/* Quick CLI Commands */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300">
            <div className="flex items-center gap-2 mb-2 text-slate-400">
              <Terminal className="w-4 h-4 text-orange-400" />
              <span>Available Project Commands</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><span className="text-orange-400">pnpm dev</span> — Run Next.js full-stack dev server</div>
              <div><span className="text-orange-400">pnpm typecheck</span> — Run TypeScript typecheck</div>
              <div><span className="text-orange-400">pnpm test</span> — Run automated test suite</div>
              <div><span className="text-orange-400">pnpm db:generate</span> — Generate Prisma client</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 py-6 text-center text-xs text-slate-400">
        <p>QR Restaurant Ordering SaaS — Built in accordance with PROJECT_BRIEF.md</p>
      </footer>
    </main>
  );
}
