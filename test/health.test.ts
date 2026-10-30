import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole, OrderStatus, OrderItemStatus, PaymentStatus, PaymentMethod, TableStatus } from '@/types';
import { getSystemHealth, checkDatabaseHealth } from '@/lib/db-health';
import { prisma } from '@/lib/prisma';

describe('Domain Contracts & Enums', () => {
  it('should have required UserRole enum values', () => {
    expect(UserRole.OWNER).toBe('OWNER');
    expect(UserRole.MANAGER).toBe('MANAGER');
    expect(UserRole.KITCHEN).toBe('KITCHEN');
    expect(UserRole.WAITER).toBe('WAITER');
    expect(UserRole.CASHIER).toBe('CASHIER');
  });

  it('should have required OrderStatus enum values', () => {
    expect(OrderStatus.PENDING).toBe('PENDING');
    expect(OrderStatus.ACCEPTED).toBe('ACCEPTED');
    expect(OrderStatus.PREPARING).toBe('PREPARING');
    expect(OrderStatus.READY).toBe('READY');
    expect(OrderStatus.SERVED).toBe('SERVED');
    expect(OrderStatus.CANCELLED).toBe('CANCELLED');
  });

  it('should have required OrderItemStatus enum values', () => {
    expect(OrderItemStatus.ACTIVE).toBe('ACTIVE');
    expect(OrderItemStatus.CANCELLED).toBe('CANCELLED');
  });

  it('should have required PaymentStatus and PaymentMethod enum values', () => {
    expect(PaymentStatus.UNPAID).toBe('UNPAID');
    expect(PaymentStatus.PAID).toBe('PAID');
    expect(PaymentMethod.ONLINE).toBe('ONLINE');
    expect(PaymentMethod.COUNTER).toBe('COUNTER');
  });

  it('should have required TableStatus enum values', () => {
    expect(TableStatus.AVAILABLE).toBe('AVAILABLE');
    expect(TableStatus.OCCUPIED).toBe('OCCUPIED');
    expect(TableStatus.RESERVED).toBe('RESERVED');
    expect(TableStatus.INACTIVE).toBe('INACTIVE');
  });
});

describe('Health Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return valid health payload structure when DB is connected', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ '?column?': 1 }]);

    const health = await getSystemHealth();

    expect(health.status).toBe('ok');
    expect(health.version).toBe('0.1.0');
    expect(health.database.connected).toBe(true);
    expect(typeof health.database.latencyMs).toBe('number');
    expect(health.timestamp).toBeDefined();
    expect(typeof health.uptime).toBe('number');
  });

  it('should return error status when DB is unreachable', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('Connection refused'));

    const health = await getSystemHealth();

    expect(health.status).toBe('error');
    expect(health.database.connected).toBe(false);
    expect(health.database.error).toBe('Connection refused');
  });
});
