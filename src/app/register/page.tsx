import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UtensilsCrossed } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const user = await getCurrentUser();

  if (user) {
    const memberCount = await prisma.restaurantMembership.count({
      where: { userId: user.id },
    });

    if (memberCount > 0) {
      redirect('/dashboard');
    } else {
      redirect('/onboarding');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 relative overflow-hidden py-12">
      {/* Background ambient glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-orange-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 group-hover:scale-105 transition-transform">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <span className="font-bold text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-amber-200 to-slate-100">
              DineFlow QR
            </span>
          </Link>
          <h1 className="text-xl font-semibold text-white mt-6">Create your account</h1>
          <p className="text-sm text-slate-400 mt-1">Get started with QR ordering for your restaurant</p>
        </div>

        {/* Client Interactive Registration Form */}
        <RegisterForm />
      </div>
    </div>
  );
}
