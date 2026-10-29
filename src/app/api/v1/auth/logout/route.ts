import { clearAuthCookie } from '@/lib/auth/jwt';
import { apiSuccess } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function POST() {
  clearAuthCookie();
  return apiSuccess({ message: 'Successfully logged out' });
}
