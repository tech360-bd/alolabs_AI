import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * /api/tasks — list tasks for the caller's tenant (and own user).
 *
 * Replaces an inline-verify handler that called `db.task.findMany({})` with
 * no tenant or user scope, exposing every company's task history to any
 * authenticated user. Mirrors the tenant+user scoping already used by
 * /api/v1/tasks. Super admins see all rows (no tenant filter).
 */
export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Super admins are not tenant-scoped (they administer the platform).
    const where = user.role === 'super_admin' ? {} : { companyId: user.companyId ?? null, userId: user.userId };

    const [tasks, total] = await Promise.all([
      db.task.findMany({
        where,
        skip: 0,
        take: 100,
        orderBy: { createdAt: 'desc' },
      }),
      db.task.count({ where }),
    ]);

    return NextResponse.json({
      logs: tasks.map((t) => ({
        ...t,
        startedAt: t.startedAt?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      pagination: { page: 1, limit: 100, total, totalPages: Math.max(1, Math.ceil(total / 100)) },
    });
  } catch (error) {
    console.error('[Tasks GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
