import { clearAuthCookie } from '@/lib/auth/jwt';
import { apiSuccess } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function POST() {
  await clearAuthCookie();
  return apiSuccess({ message: 'Successfully logged out' });
}
