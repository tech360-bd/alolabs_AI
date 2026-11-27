import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  // Session → live Company membership. Authentication alone never authorises.
  const tenant = await legacyTenant(request);
  try {
    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get('company') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    let companyName: string | undefined;
    if (companySlug) {
      const company = await db.company.findFirst({
        where: { slug: companySlug, id: tenant.companyId },
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
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}