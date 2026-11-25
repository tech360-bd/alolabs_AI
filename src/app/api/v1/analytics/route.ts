/**
 * /api/v1/analytics — tenant-scoped usage analytics for connected ALO
 * projects (directive: usage metering + analytics API group).
 *
 *   GET — token/cost usage aggregated by model and by day for the caller's
 *         company over a trailing window (scope: analytics:read).
 *
 * Aggregation is computed in memory from the tenant-scoped query so the
 * result is identical on real Prisma and the test fake DB. Rows carry the
 * companyId of the authenticated identity only — cross-tenant aggregation is
 * impossible by construction.
 */
import { v1Handler, v1RateLimit } from '@/lib/v1';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = v1Handler(async ({ identity }, request) => {
  await v1RateLimit(request, identity, '/api/v1/analytics');
  const q = request.nextUrl.searchParams;
  const days = Math.min(90, Math.max(1, parseInt(q.get('days') ?? '30', 10) || 30));
  const modelFilter = q.get('model')?.trim();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db.tokenUsage.findMany({
    where: { companyId: identity.companyId },
    orderBy: { createdAt: 'desc' },
  });

  const totals = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costEstimate: 0 };
  const byModel = new Map<string, { model: string; requests: number; promptTokens: number; completionTokens: number; totalTokens: number; costEstimate: number }>();
  const byDay = new Map<string, { date: string; requests: number; totalTokens: number; costEstimate: number }>();

  for (const row of rows as Array<Record<string, unknown>>) {
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt));
    if (createdAt < since) continue;
    const model = String(row.model ?? 'unknown');
    if (modelFilter && model !== modelFilter) continue;

    const promptTokens = Number(row.promptTokens ?? 0);
    const completionTokens = Number(row.completionTokens ?? 0);
    const totalTokens = Number(row.totalTokens ?? 0);
    const cost = Number(row.costEstimate ?? 0);

    totals.requests += 1;
    totals.promptTokens += promptTokens;
    totals.completionTokens += completionTokens;
    totals.totalTokens += totalTokens;
    totals.costEstimate += cost;

    const m = byModel.get(model) ?? { model, requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costEstimate: 0 };
    m.requests += 1;
    m.promptTokens += promptTokens;
    m.completionTokens += completionTokens;
    m.totalTokens += totalTokens;
    m.costEstimate += cost;
    byModel.set(model, m);

    const date = createdAt.toISOString().slice(0, 10);
    const d = byDay.get(date) ?? { date, requests: 0, totalTokens: 0, costEstimate: 0 };
    d.requests += 1;
    d.totalTokens += totalTokens;
    d.costEstimate += cost;
    byDay.set(date, d);
  }

  return {
    windowDays: days,
    totals,
    byModel: [...byModel.values()].sort((a, b) => b.totalTokens - a.totalTokens),
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
});
