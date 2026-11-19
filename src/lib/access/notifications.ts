import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '@/lib/api-auth';

export function notificationScope(user: Pick<AuthenticatedUser, 'role' | 'userId' | 'companyId'>): Prisma.NotificationWhereInput {
  if (['super_admin','platform_super_admin'].includes(user.role)) return {};
  return { OR: [{ userId: user.userId }, ...(user.companyId ? [{ userId: null, companyId: user.companyId }] : [])] };
}
