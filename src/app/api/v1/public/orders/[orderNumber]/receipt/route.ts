import { NextRequest, NextResponse } from 'next/server';
import { getReceiptData } from '@/lib/orders/receipt';
import { apiSuccess, handleApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    orderNumber: string;
  }>;
}

export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const sessionToken = req.headers.get('x-session-token') || undefined;
    const receiptToken =
      req.nextUrl.searchParams.get('receiptToken') ||
      req.headers.get('x-receipt-token') ||
      undefined;
    const result = await getReceiptData(params.orderNumber, {
      sessionToken,
      receiptToken,
    });

    if (!result.success) {
      const status =
        result.code === 'NOT_FOUND' ? 404 : result.code === 'UNAUTHORIZED' ? 403 : 500;
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

    const response = apiSuccess({ receipt: result.receipt });
    response.headers.set('Cache-Control', 'no-store, private');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
