import { NextRequest, NextResponse } from 'next/server';
import { loadPublicMenuData } from '@/lib/qr/menu-loader';
import { TABLE_SESSION_COOKIE_NAME } from '@/lib/qr/session';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug') || searchParams.get('restaurantSlug');
    const tableToken = searchParams.get('tableToken');

    const result = await loadPublicMenuData(slug, tableToken);

    if (!result.success) {
      const status =
        result.code === 'MISSING_PARAMS'
          ? 400
          : result.code === 'INVALID_QR_TOKEN'
          ? 404
          : 500;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: result.code,
            message: result.error,
          },
        },
        { status },
      );
    }

    const response = apiSuccess(result.data);
    response.headers.set('Cache-Control', 'no-store, private');
    response.headers.set('Referrer-Policy', 'no-referrer');

    if (result.data.session?.sessionToken) {
      response.cookies.set(TABLE_SESSION_COOKIE_NAME, result.data.session.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 6 * 60 * 60,
      });
    }

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
