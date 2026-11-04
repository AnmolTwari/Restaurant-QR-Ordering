import React from 'react';
import { loadPublicMenuData } from '@/lib/qr/menu-loader';
import { MenuErrorState } from '@/components/menu/MenuErrorState';
import { PublicMenuClient } from '@/components/menu/PublicMenuClient';

export const dynamic = 'force-dynamic';

interface PublicMenuPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    tableToken?: string;
    orderNumber?: string;
  }>;
}

export default async function PublicMenuPage(props: PublicMenuPageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const tableToken = searchParams?.tableToken;
  const initialOrderNumber = searchParams?.orderNumber || null;

  const result = await loadPublicMenuData(params.slug, tableToken);

  if (!result.success) {
    return <MenuErrorState error={result.error} code={result.code} />;
  }

  return (
    <PublicMenuClient
      slug={params.slug}
      data={result.data}
      tableToken={tableToken}
      initialOrderNumber={initialOrderNumber}
    />
  );
}
