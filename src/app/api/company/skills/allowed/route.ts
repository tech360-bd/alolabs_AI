import { NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireCompanyAuth();
    const skills = await db.skill.findMany({
      where: {
        status: { in: ['approved', 'private'] },
        OR: [
          { status: 'approved', skillCompanyAccess: { none: {} } },
          { skillCompanyAccess: { some: { companyId: user.companyId, accessLevel: { in: ['read', 'full'] } } } },
        ],
      },
      select: { id: true, name: true, slug: true, title: true, category: true, version: true, status: true, riskLevel: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ data: skills });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Internal server error' : message }, { status });
  }
}
