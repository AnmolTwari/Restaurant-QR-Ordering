import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess, NotFoundError } from '@/lib/auth/guards';
import { UserRole, TableStatus } from '@/types';
import { revokeTableQrToken } from '@/lib/qr/token';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const UpdateTableSchema = z.object({
  tableNumber: z.string().min(1).max(20).trim().optional(),
  capacity: z.number().int().min(1).max(50).optional(),
  status: z.nativeEnum(TableStatus).optional(),
});

interface RouteParams {
  params: {
    restaurantId: string;
    tableId: string;
  };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId);

    const table = await prisma.restaurantTable.findFirst({
      where: {
        id: params.tableId,
        restaurantId: restaurant.id,
      },
      include: {
        qrTokens: {
          where: { isRevoked: false },
          select: { id: true, createdAt: true },
        },
      },
    });

    if (!table) {
      throw new NotFoundError('Table not found');
    }

    return apiSuccess({
      table: {
        ...table,
        hasActiveQr: table.qrTokens.length > 0,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
    ]);

    const existing = await prisma.restaurantTable.findFirst({
      where: {
        id: params.tableId,
        restaurantId: restaurant.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Table not found');
    }

    const body = await req.json();
    const data = UpdateTableSchema.parse(body);

    // If tableNumber changed, check uniqueness
    if (data.tableNumber && data.tableNumber !== existing.tableNumber) {
      const duplicate = await prisma.restaurantTable.findUnique({
        where: {
          restaurantId_tableNumber: {
            restaurantId: restaurant.id,
            tableNumber: data.tableNumber,
          },
        },
      });

      if (duplicate && duplicate.id !== existing.id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'DUPLICATE_TABLE_NUMBER',
              message: `A table with number "${data.tableNumber}" already exists in this restaurant.`,
            },
          },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.restaurantTable.update({
      where: { id: existing.id },
      data: {
        ...(data.tableNumber && { tableNumber: data.tableNumber }),
        ...(data.capacity !== undefined && { capacity: data.capacity }),
        ...(data.status && { status: data.status }),
      },
    });

    return apiSuccess({ table: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
      UserRole.MANAGER,
    ]);

    const existing = await prisma.restaurantTable.findFirst({
      where: {
        id: params.tableId,
        restaurantId: restaurant.id,
      },
    });

    if (!existing) {
      throw new NotFoundError('Table not found');
    }

    // Safely deactivate the table and revoke its active QR tokens
    await revokeTableQrToken(restaurant.id, existing.id);

    const updated = await prisma.restaurantTable.update({
      where: { id: existing.id },
      data: { status: TableStatus.INACTIVE },
    });

    return apiSuccess({
      message: 'Table safely deactivated and QR tokens revoked',
      table: updated,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
