import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { writeAuditEvent } from '@/lib/audit-events';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  companyId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});

function authError(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireRole('super_admin');
    const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const query = parsed.data;
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      return NextResponse.json({ error: 'from must be earlier than to' }, { status: 400 });
    }
    const company = query.companyId
      ? await db.company.findUnique({ where: { id: query.companyId }, select: { id: true, name: true } })
      : null;
    if (query.companyId && !company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const records = await db.modelUsageRecord.findMany({
      where: {
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.agentId ? { agentId: query.agentId } : {}),
        ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      select: {
        id: true, requestId: true, correlationId: true, companyId: true, departmentId: true, userId: true,
        agentId: true, workflowId: true, providerConfigId: true, provider: true, model: true, profile: true,
        status: true, inputTokens: true, outputTokens: true, totalTokens: true, usageSource: true,
        estimatedCostUsd: true, confirmedCostUsd: true, providerReportedCostUsd: true, latencyMs: true,
        rateLimitResponse: true, errorCode: true, createdAt: true, completedAt: true,
      },
    });

    const totals = records.reduce((sum, row) => {
      sum.attempts += 1;
      if (row.status === 'success') sum.successes += 1;
      if (row.status === 'failure') sum.failures += 1;
      if (row.status === 'blocked') sum.blocked += 1;
      if (row.status === 'deferred') sum.deferred += 1;
      sum.inputTokens += row.inputTokens;
      sum.outputTokens += row.outputTokens;
      sum.totalTokens += row.totalTokens;
      sum.estimatedCostUsd += row.estimatedCostUsd ?? 0;
      sum.confirmedCostUsd += row.confirmedCostUsd ?? 0;
      sum.providerReportedCostUsd += row.providerReportedCostUsd ?? 0;
      return sum;
    }, { attempts: 0, successes: 0, failures: 0, blocked: 0, deferred: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, confirmedCostUsd: 0, providerReportedCostUsd: 0 });

    const byKey = new Map<string, { calls: number; tokens: number; estimatedCostUsd: number; statuses: Record<string, number> }>();
    for (const row of records) {
      const key = `${row.companyId ?? 'unassigned'}:${row.agentId ?? 'unattributed'}`;
      const aggregate = byKey.get(key) ?? { calls: 0, tokens: 0, estimatedCostUsd: 0, statuses: {} };
      aggregate.calls += 1;
      aggregate.tokens += row.totalTokens;
      aggregate.estimatedCostUsd += row.estimatedCostUsd ?? 0;
      aggregate.statuses[row.status] = (aggregate.statuses[row.status] ?? 0) + 1;
      byKey.set(key, aggregate);
    }

    await writeAuditEvent({
      actorUserId: actor.userId,
      companyId: query.companyId ?? null,
      action: 'ai_usage.read',
      resource: 'model-usage-record',
      details: { companyId: query.companyId ?? null, agentId: query.agentId ?? null, rowCount: records.length, limit: query.limit },
    });

    return NextResponse.json({
      company,
      filters: { companyId: query.companyId ?? null, agentId: query.agentId ?? null, from: query.from ?? null, to: query.to ?? null, limit: query.limit },
      totals: { ...totals, estimatedCostUsd: Number(totals.estimatedCostUsd.toFixed(6)), confirmedCostUsd: Number(totals.confirmedCostUsd.toFixed(6)), providerReportedCostUsd: Number(totals.providerReportedCostUsd.toFixed(6)) },
      byCompanyAndAgent: Array.from(byKey.entries()).map(([key, value]) => {
        const [companyId, agentId] = key.split(':');
        return { companyId: companyId === 'unassigned' ? null : companyId, agentId: agentId === 'unattributed' ? null : agentId, ...value, estimatedCostUsd: Number(value.estimatedCostUsd.toFixed(6)) };
      }),
      records,
      truncated: records.length === query.limit,
    });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    console.error('[AI Usage] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
