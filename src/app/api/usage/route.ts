import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get('company') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    let companyName: string | undefined;
    if (companySlug) {
      const company = await db.company.findUnique({
        where: { slug: companySlug },
        select: { name: true },
      });
      if (company) {
        companyName = company.name;
      }
    }

    const baseWhere: Prisma.UsageLogWhereInput = companyName
      ? { companyName }
      : {};

    const [logs, total, completedCount, failedCount, blockedCount, totalTokensResult] =
      await Promise.all([
        db.usageLog.findMany({
          where: baseWhere,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        db.usageLog.count({ where: baseWhere }),
        db.usageLog.count({ where: { ...baseWhere, status: 'completed' } }),
        db.usageLog.count({ where: { ...baseWhere, status: 'failed' } }),
        db.usageLog.count({ where: { ...baseWhere, status: 'blocked' } }),
        db.usageLog.aggregate({
          where: baseWhere,
          _sum: { tokensOrLocalUsed: true },
        }),
      ]);

    return NextResponse.json({
      logs: logs.map((l) => ({
        ...l,
        startedAt: l.startedAt.toISOString(),
        completedAt: l.completedAt?.toISOString() ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
      stats: {
        total,
        completed: completedCount,
        failed: failedCount,
        blocked: blockedCount,
        totalTokens: totalTokensResult._sum.tokensOrLocalUsed || 0,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}