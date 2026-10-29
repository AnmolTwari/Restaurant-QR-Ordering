import { NextResponse } from 'next/server';
import { getSystemHealth } from '@/lib/db-health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await getSystemHealth();
  const statusCode = health.status === 'ok' ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}
