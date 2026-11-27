import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';

// GET /api/tenant-gateway/distribution — request distribution per company (super_admin only)
export async function GET(_request: NextRequest) {
  try {
    await requireRole('super_admin');

    const companies = await db.company.findMany({
      select: { id: true, name: true, slug: true, _count: { select: { usageLogs: true } } },
    });

    const totalRequests = companies.reduce((acc, c) => acc + c._count.usageLogs, 0) || 1;

    const data = companies
      .map((c) => ({
        companyName: c.name,
        requestCount: c._count.usageLogs,
        percentage: Math.round((c._count.usageLogs / totalRequests) * 100),
      }))
      .sort((a, b) => b.requestCount - a.requestCount);

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
