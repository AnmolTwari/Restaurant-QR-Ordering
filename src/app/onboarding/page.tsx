import React from 'react';
import { redirect } from 'next/navigation';
import { Store } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const memberCount = await prisma.restaurantMembership.count({
    where: { userId: user.id },
  });

  if (memberCount > 0) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 relative overflow-hidden py-12">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-orange-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-xl relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-xs text-orange-400 mb-4 font-medium">
            <Store className="w-3.5 h-3.5" />
            <span>Step 2: Restaurant Onboarding</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Configure Your Restaurant
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Set up your brand profile. You will automatically receive full owner permissions.
          </p>
        </div>

        {/* Client Interactive Onboarding Form */}
        <OnboardingForm />
      </div>
    </div>
  );
}
