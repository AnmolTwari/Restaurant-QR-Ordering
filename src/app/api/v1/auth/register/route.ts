import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { signAuthToken, setAuthCookie } from '@/lib/auth/jwt';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const RegisterSchema = z.object({
  email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters long').trim(),
  phone: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 account registrations per minute per IP
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(`register:${ip}`, { limit: 5, windowMs: 60000 });
    if (!rateCheck.success) {
      return rateLimitResponse(rateCheck);
    }

    const body = await req.json();
    const data = RegisterSchema.parse(body);

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'An account with this email address already exists.',
          },
        },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        phone: data.phone || null,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        createdAt: true,
      },
    });

    const token = await signAuthToken({ userId: user.id, email: user.email });
    setAuthCookie(token);

    return apiSuccess({ user }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
