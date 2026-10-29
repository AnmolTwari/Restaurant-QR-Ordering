import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@/generated/prisma';
import { AuthenticationError, AuthorizationError } from '@/lib/auth/session';
import { NotFoundError } from '@/lib/auth/guards';
import { SettlementError } from '@/lib/payments/settlement';

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: error.message,
        },
      },
      { status: 401 },
    );
  }

  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      },
      { status: 403 },
    );
  }

  if (error instanceof NotFoundError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      },
      { status: 404 },
    );
  }

  if (error instanceof SettlementError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.statusCode },
    );
  }

  // Handle Prisma unique constraint race conditions
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'DUPLICATE_RESOURCE_CONFLICT',
          message: 'A resource with these unique parameters already exists.',
        },
      },
      { status: 409 },
    );
  }

function sanitizeErrorForLogging(error: unknown): string {
  if (error instanceof Error) {
    let sanitized = `${error.name}: ${error.message}`;
    sanitized = sanitized.replace(/postgres(?:ql)?:\/\/[^:]+:[^@]+@/gi, 'postgresql://***:***@');
    sanitized = sanitized.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');
    sanitized = sanitized.replace(/(password|secret|key|token)["']?\s*[:=]\s*["']?[^"',\s]+/gi, '$1=[REDACTED]');
    return sanitized;
  }
  return String(error);
}

  // Log error safely without exposing raw DB credentials or stack traces to clients
  console.error('[API Error]:', sanitizeErrorForLogging(error));

  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction
    ? 'Internal server error'
    : error instanceof Error
    ? error.message
    : 'Internal server error';

  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message,
      },
    },
    { status: 500 },
  );
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status },
  );
}
