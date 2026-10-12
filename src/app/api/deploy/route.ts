import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin');
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status') || '';
    const domain = searchParams.get('domain') || '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (domain) where.domain = { contains: domain };

    const [data, total] = await Promise.all([
      db.domainDeployment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.domainDeployment.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('Deploy GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin');
    return NextResponse.json(
      { error: 'Deployment automation is not yet available. Use manual deployment or CI/CD pipeline.' },
      { status: 501 },
    );
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('Deploy POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}