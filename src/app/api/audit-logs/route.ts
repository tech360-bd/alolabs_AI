import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyAuth } from '@/lib/api-auth';

/**
 * GET /api/audit-logs — the caller's own company's audit trail.
 *
 * This route previously verified a session token inline and then queried
 * `db.auditLog.findMany()` with no `where` clause at all, so any authenticated
 * user — including a client-portal user — could page through the audit history
 * of every company on the platform. Audit logs record who did what and when;
 * leaking them across tenants discloses both the customer list and the internal
 * activity patterns of each one. (T-3 class: authentication was mistaken for
 * authorisation.)
 *
 * AuditLog has no companyId column, so the tenant is derived from the user:
 * rows are scoped to users who belong to the caller's company. An audit trail
 * is "the acts of the people in my company", which is exactly that relation.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    // Every user in the caller's company, then only their audit rows.
    const colleagues = await db.companyUser.findMany({
      where: { companyId: user.companyId },
      select: { userId: true },
    });
    const userIds = colleagues.map((c) => c.userId);

    if (userIds.length === 0) {
      return NextResponse.json({
        logs: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      });
    }

    const where = { userId: { in: userIds } };

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      logs: logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    }
    console.error('[GET /api/audit-logs]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
