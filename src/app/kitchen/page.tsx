import React from 'react';
import { redirect } from 'next/navigation';
import { getKitchenInitialData } from '@/lib/kitchen/loader';
import { KitchenClient } from '@/components/kitchen/KitchenClient';

export const dynamic = 'force-dynamic';

export default async function KitchenPage() {
  const initialData = await getKitchenInitialData();

  if (!initialData.authenticated) {
    redirect('/login');
  }

  if (!initialData.hasRestaurants) {
    redirect('/onboarding');
  }

  return (
    <KitchenClient
      initialRestaurants={initialData.restaurants}
      initialActiveRestaurant={initialData.activeRestaurant}
      initialOrders={initialData.initialOrders}
    />
  );
}
