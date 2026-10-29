import React from 'react';
import { redirect } from 'next/navigation';
import { getDashboardInitialData } from '@/lib/dashboard/loader';
import { DashboardClient } from '@/components/dashboard/DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const initialData = await getDashboardInitialData();

  if (!initialData.authenticated) {
    redirect('/login');
  }

  if (!initialData.hasRestaurants) {
    redirect('/onboarding');
  }

  return <DashboardClient initialData={initialData} />;
}
