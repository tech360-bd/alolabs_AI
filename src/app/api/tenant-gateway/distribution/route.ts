import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/tenant-gateway/distribution — request distribution per company
export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}