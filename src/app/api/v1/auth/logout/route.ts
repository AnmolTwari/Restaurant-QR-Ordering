import { clearAuthCookie } from '@/lib/auth/jwt';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { apiSuccess } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (user) {
      // Invalidate current JWT server-side so it cannot be reused even if copied/stolen
      await prisma.user.update({
        where: { id: user.id },
        data: { tokenVersion: { increment: 1 } },
      });
    }
  } catch {
    // Handled safely: continue to clear client cookie
  }

  await clearAuthCookie();
  return apiSuccess({ message: 'Successfully logged out' });
}
