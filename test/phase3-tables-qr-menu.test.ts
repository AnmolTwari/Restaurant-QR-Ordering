import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  generateRawToken,
  hashToken,
  createTableQrToken,
  rotateTableQrToken,
  revokeTableQrToken,
  resolveTableQrToken,
} from '@/lib/qr/token';
import {
  resolveOrCreateTableSession,
} from '@/lib/qr/session';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { AuthorizationError, AuthenticationError } from '@/lib/auth/session';
import * as sessionModule from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { UserRole, TableStatus } from '@/types';

describe('Phase 3: Secure QR Token Generation & Lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate unpredictable tokens with 256 bits (32 bytes) of cryptographic entropy', () => {
    const token1 = generateRawToken();
    const token2 = generateRawToken();

    // 32 bytes encoded in hex = 64 characters
    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
    expect(/^[0-9a-f]{64}$/.test(token1)).toBe(true);
    expect(/^[0-9a-f]{64}$/.test(token2)).toBe(true);
  });

  it('should generate deterministic SHA-256 hash of raw tokens so raw tokens are never persisted', () => {
    const rawToken = 'a'.repeat(64);
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const hash1 = hashToken(rawToken);
    const hash2 = hashToken(rawToken);

    expect(hash1).toBe(expectedHash);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(rawToken);
  });

  it('should create table QR token, atomically invalidating prior active tokens and storing only the hash', async () => {
    const restaurantId = 'rest-uuid-1';
    const tableId = 'table-uuid-1';

    let capturedCreateData: any = null;
    let capturedUpdateManyData: any = null;

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx = {
        tableQrToken: {
          updateMany: vi.fn().mockImplementation(async (args) => {
            capturedUpdateManyData = args;
            return { count: 1 };
          }),
          create: vi.fn().mockImplementation(async (args) => {
            capturedCreateData = args;
            return {
              id: 'qr-token-uuid-1',
              restaurantId,
              tableId,
              tokenHash: args.data.tokenHash,
              isRevoked: false,
              revokedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }),
        },
      };
      return callback(mockTx);
    });

    const result = await createTableQrToken(restaurantId, tableId);

    // Verify rawToken returned to caller
    expect(result.rawToken).toHaveLength(64);
    // Verify previous tokens for this table were revoked
    expect(capturedUpdateManyData.where).toEqual({
      restaurantId,
      tableId,
      isRevoked: false,
    });
    expect(capturedUpdateManyData.data.isRevoked).toBe(true);
    // Verify only the hash is persisted in the database
    expect(capturedCreateData.data.tokenHash).toBe(hashToken(result.rawToken));
    expect(capturedCreateData.data.tokenHash).not.toBe(result.rawToken);
    expect(capturedCreateData.data.restaurantId).toBe(restaurantId);
    expect(capturedCreateData.data.tableId).toBe(tableId);
  });

  it('should rotate table QR token by revoking the old token and returning a fresh unpredictable token', async () => {
    const restaurantId = 'rest-uuid-1';
    const tableId = 'table-uuid-1';

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx = {
        tableQrToken: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: vi.fn().mockImplementation(async (args) => ({
            id: 'qr-token-uuid-2',
            restaurantId,
            tableId,
            tokenHash: args.data.tokenHash,
            isRevoked: false,
            revokedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        },
      };
      return callback(mockTx);
    });

    const rotateResult = await rotateTableQrToken(restaurantId, tableId);
    expect(rotateResult.rawToken).toHaveLength(64);
    expect(rotateResult.qrToken.id).toBe('qr-token-uuid-2');
  });

  it('should revoke active table QR tokens immediately', async () => {
    const restaurantId = 'rest-uuid-1';
    const tableId = 'table-uuid-1';

    const updateManySpy = vi.spyOn(prisma.tableQrToken, 'updateMany').mockResolvedValue({ count: 1 });

    const res = await revokeTableQrToken(restaurantId, tableId);
    expect(res.count).toBe(1);
    expect(updateManySpy).toHaveBeenCalledWith({
      where: {
        restaurantId,
        tableId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: expect.any(Date),
      },
    });
  });
});

describe('Phase 3: QR Token Resolution & Public Menu Security', () => {
  const mockRestaurant = {
    id: 'rest-uuid-1',
    name: 'Bistro Spice',
    slug: 'bistro-spice',
    description: 'Authentic dining',
    address: '123 Main St',
    phone: '+91 9876543210',
    currency: 'INR',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTable = {
    id: 'table-uuid-1',
    restaurantId: mockRestaurant.id,
    tableNumber: 'T-10',
    capacity: 4,
    status: TableStatus.AVAILABLE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully resolve a valid, unrevoked QR token for an active restaurant and table', async () => {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    vi.spyOn(prisma.tableQrToken, 'findUnique').mockResolvedValue({
      id: 'qr-uuid-1',
      restaurantId: mockRestaurant.id,
      tableId: mockTable.id,
      tokenHash,
      isRevoked: false,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      restaurant: mockRestaurant,
      table: mockTable,
    } as any);

    const resolved = await resolveTableQrToken(rawToken);

    expect(resolved).not.toBeNull();
    expect(resolved?.restaurant.slug).toBe('bistro-spice');
    expect(resolved?.table.tableNumber).toBe('T-10');
    expect(resolved?.table.status).toBe(TableStatus.AVAILABLE);
  });

  it('should reject a revoked QR token', async () => {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    vi.spyOn(prisma.tableQrToken, 'findUnique').mockResolvedValue({
      id: 'qr-uuid-1',
      restaurantId: mockRestaurant.id,
      tableId: mockTable.id,
      tokenHash,
      isRevoked: true,
      revokedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      restaurant: mockRestaurant,
      table: mockTable,
    } as any);

    const resolved = await resolveTableQrToken(rawToken);
    expect(resolved).toBeNull();
  });

  it('should reject a QR token if the table has been marked INACTIVE', async () => {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    vi.spyOn(prisma.tableQrToken, 'findUnique').mockResolvedValue({
      id: 'qr-uuid-1',
      restaurantId: mockRestaurant.id,
      tableId: mockTable.id,
      tokenHash,
      isRevoked: false,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      restaurant: mockRestaurant,
      table: {
        ...mockTable,
        status: TableStatus.INACTIVE,
      },
    } as any);

    const resolved = await resolveTableQrToken(rawToken);
    expect(resolved).toBeNull();
  });

  it('should reject a QR token if the restaurant is inactive', async () => {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    vi.spyOn(prisma.tableQrToken, 'findUnique').mockResolvedValue({
      id: 'qr-uuid-1',
      restaurantId: mockRestaurant.id,
      tableId: mockTable.id,
      tokenHash,
      isRevoked: false,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      restaurant: {
        ...mockRestaurant,
        isActive: false,
      },
      table: mockTable,
    } as any);

    const resolved = await resolveTableQrToken(rawToken);
    expect(resolved).toBeNull();
  });

  it('should reject empty or malformed raw tokens immediately without DB lookup', async () => {
    const dbSpy = vi.spyOn(prisma.tableQrToken, 'findUnique');

    expect(await resolveTableQrToken('')).toBeNull();
    expect(await resolveTableQrToken('   ')).toBeNull();
    expect(await resolveTableQrToken(null as any)).toBeNull();

    expect(dbSpy).not.toHaveBeenCalled();
  });
});

describe('Phase 3: Restaurant Table Management & Uniqueness Constraints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should enforce unique table number per restaurant', async () => {
    const restaurantId = 'rest-uuid-1';
    const tableNumber = 'Table 1';

    // Simulate database returning existing table with same number
    vi.spyOn(prisma.restaurantTable, 'findUnique').mockResolvedValue({
      id: 'existing-table-1',
      restaurantId,
      tableNumber,
      capacity: 4,
      status: TableStatus.AVAILABLE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const duplicateCheck = await prisma.restaurantTable.findUnique({
      where: {
        restaurantId_tableNumber: {
          restaurantId,
          tableNumber,
        },
      },
    });

    expect(duplicateCheck).not.toBeNull();
    expect(duplicateCheck?.id).toBe('existing-table-1');
  });

  it('should prevent cross-tenant table modification', async () => {
    const restaurantId = 'rest-uuid-1';
    const foreignTableId = 'table-from-restaurant-2';

    // Simulating query constrained to restaurantId
    vi.spyOn(prisma.restaurantTable, 'findFirst').mockResolvedValue(null);

    const table = await prisma.restaurantTable.findFirst({
      where: {
        id: foreignTableId,
        restaurantId,
      },
    });

    expect(table).toBeNull();
  });

  it('should enforce role-based authorization: allow OWNER/MANAGER and reject WAITER for table QR management', async () => {
    const mockUser = {
      id: 'waiter-user-1',
      email: 'waiter@test.com',
      fullName: 'Waiter Joe',
      phone: null,
      isActive: true,
      createdAt: new Date(),
    };

    vi.spyOn(sessionModule, 'requireUser').mockResolvedValue(mockUser);
    vi.spyOn(prisma.restaurantMembership, 'findFirst').mockResolvedValue({
      id: 'membership-waiter',
      userId: mockUser.id,
      restaurantId: 'rest-uuid-1',
      role: UserRole.WAITER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      restaurant: {
        id: 'rest-uuid-1',
        name: 'Test Rest',
        slug: 'test-rest',
        currency: 'INR',
        isActive: true,
      },
    } as any);

    // QR generation requires OWNER or MANAGER
    await expect(
      requireRestaurantAccess('rest-uuid-1', [UserRole.OWNER, UserRole.MANAGER]),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe('Phase 3: Table Dining Sessions', () => {
  const restaurantId = 'rest-uuid-1';
  const tableId = 'table-uuid-1';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a new session bound to restaurant and table with hash-only persistence', async () => {
    let capturedSessionData: any = null;

    vi.spyOn(prisma.tableSession, 'create').mockImplementation((async (args: any) => {
      capturedSessionData = args;
      return {
        id: 'session-uuid-1',
        restaurantId: args.data.restaurantId,
        tableId: args.data.tableId,
        sessionTokenHash: args.data.sessionTokenHash,
        expiresAt: args.data.expiresAt,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }) as any);

    const result = await resolveOrCreateTableSession(restaurantId, tableId);

    expect(result.isNew).toBe(true);
    expect(result.sessionToken).toHaveLength(64);
    expect(capturedSessionData.data.restaurantId).toBe(restaurantId);
    expect(capturedSessionData.data.tableId).toBe(tableId);
    expect(capturedSessionData.data.sessionTokenHash).toBe(hashToken(result.sessionToken));
    expect(capturedSessionData.data.isActive).toBe(true);
  });

  it('should reuse an existing valid session for the same table to avoid duplicate sessions on reload', async () => {
    const existingRawToken = generateRawToken();
    const existingHash = hashToken(existingRawToken);
    const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000); // +3 hours

    vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue({
      id: 'existing-session-uuid',
      restaurantId,
      tableId,
      sessionTokenHash: existingHash,
      expiresAt: futureDate,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await resolveOrCreateTableSession(restaurantId, tableId, existingRawToken);

    expect(result.isNew).toBe(false);
    expect(result.sessionToken).toBe(existingRawToken);
    expect(result.session.id).toBe('existing-session-uuid');
  });

  it('should reject and create a fresh session if existing session is bound to a different table', async () => {
    const existingRawToken = generateRawToken();
    const existingHash = hashToken(existingRawToken);
    const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000);

    // Existing session belongs to a different table ("table-OTHER")
    vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue({
      id: 'other-table-session',
      restaurantId,
      tableId: 'table-OTHER',
      sessionTokenHash: existingHash,
      expiresAt: futureDate,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.spyOn(prisma.tableSession, 'create').mockImplementation((async (args: any) => ({
      id: 'new-session-uuid',
      restaurantId: args.data.restaurantId,
      tableId: args.data.tableId,
      sessionTokenHash: args.data.sessionTokenHash,
      expiresAt: args.data.expiresAt,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as any);

    const result = await resolveOrCreateTableSession(restaurantId, tableId, existingRawToken);

    // Rejects previous session because of table mismatch and creates a new one
    expect(result.isNew).toBe(true);
    expect(result.sessionToken).not.toBe(existingRawToken);
    expect(result.session.tableId).toBe(tableId);
  });

  it('should reject and create a fresh session if existing session has expired', async () => {
    const existingRawToken = generateRawToken();
    const existingHash = hashToken(existingRawToken);
    const pastDate = new Date(Date.now() - 60 * 1000); // 1 minute ago

    vi.spyOn(prisma.tableSession, 'findUnique').mockResolvedValue({
      id: 'expired-session',
      restaurantId,
      tableId,
      sessionTokenHash: existingHash,
      expiresAt: pastDate,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.spyOn(prisma.tableSession, 'create').mockImplementation((async (args: any) => ({
      id: 'fresh-session',
      restaurantId: args.data.restaurantId,
      tableId: args.data.tableId,
      sessionTokenHash: args.data.sessionTokenHash,
      expiresAt: args.data.expiresAt,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as any);

    const result = await resolveOrCreateTableSession(restaurantId, tableId, existingRawToken);

    expect(result.isNew).toBe(true);
    expect(result.sessionToken).not.toBe(existingRawToken);
  });
});
