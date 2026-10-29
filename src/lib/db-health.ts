import { prisma } from './prisma';
import type { HealthCheckResponse } from '../types';

const serverStartTime = Date.now();

export async function checkDatabaseHealth(): Promise<HealthCheckResponse['database']> {
  const startTime = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startTime;
    return { connected: true, latencyMs };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown database error';
    return { connected: false, error };
  }
}

export async function getSystemHealth(): Promise<HealthCheckResponse> {
  const dbStatus = await checkDatabaseHealth();
  const isHealthy = dbStatus.connected;

  return {
    status: isHealthy ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    environment: process.env.NODE_ENV || 'development',
    version: '0.1.0',
    database: dbStatus,
  };
}
