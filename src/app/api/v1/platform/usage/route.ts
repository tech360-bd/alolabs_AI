/**
 * GET /api/v1/platform/usage
 *
 * Usage for the caller's workspace, aggregated from AiUsageRecord — the same
 * rows the billing view reads, so the numbers cannot drift.
 *
 * Query: ?days=30&groupBy=model|provider|project|day
 *
 * Returns zero-filled rows for the requested window so a chart does not have to
 * invent missing days.
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { platformRoute, json } from '@/lib/platform/http';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  projectId: z.string().max(64).optional(),
  groupBy: z.enum(['model', 'provider', 'project', 'day']).default('model'),
});

interface UsageRow {
  workspaceId: string;
  projectId: string | null;
  model: string;
  provider: string;
  hostingType: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  status: string;
  createdAt: Date;
}

export const GET = platformRoute({ scope: 'usage:read', query: querySchema }, async ({ principal, query, requestId }) => {
  const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);

  const rows = await db.aiUsageRecord.findMany({
    where: {
      workspaceId: principal.workspaceId,
      createdAt: { gte: since },
      ...(query.projectId ? { projectId: query.projectId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 20_000,
    select: {
      workspaceId: true, projectId: true, model: true, provider: true, hostingType: true,
      promptTokens: true, completionTokens: true, totalTokens: true, costUsd: true,
      latencyMs: true, status: true, createdAt: true,
    },
  }) as UsageRow[];

  const buckets = new Map<string, { key: string; requests: number; tokens: number; costUsd: number; failures: number; latencySum: number }>();
  for (const row of rows) {
    const key = query.groupBy === 'day'
      ? row.createdAt.toISOString().slice(0, 10)
      : query.groupBy === 'model' ? row.model
      : query.groupBy === 'provider' ? row.provider
      : (row.projectId ?? 'unassigned');
    const bucket = buckets.get(key) ?? { key, requests: 0, tokens: 0, costUsd: 0, failures: 0, latencySum: 0 };
    bucket.requests += 1;
    bucket.tokens += row.totalTokens ?? 0;
    bucket.costUsd += row.costUsd ?? 0;
    bucket.latencySum += row.latencyMs ?? 0;
    if (row.status !== 'success' && row.status !== 'fallback') bucket.failures += 1;
    buckets.set(key, bucket);
  }

  // Zero-fill days so charts are continuous.
  if (query.groupBy === 'day') {
    for (let i = 0; i < query.days; i++) {
      const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (!buckets.has(day)) buckets.set(day, { key: day, requests: 0, tokens: 0, costUsd: 0, failures: 0, latencySum: 0 });
    }
  }

  const byKey = [...buckets.values()].sort((a, b) => (query.groupBy === 'day' ? a.key.localeCompare(b.key) : b.requests - a.requests));
  const totalTokens = rows.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);
  const fallbackRows = rows.filter((r) => r.status === 'fallback').length;

  return json({
    window: { days: query.days, since: since.toISOString() },
    groupBy: query.groupBy,
    totals: {
      requests: rows.length,
      tokens: totalTokens,
      costUsd: Number(rows.reduce((s, r) => s + (r.costUsd ?? 0), 0).toFixed(6)),
      failures: rows.filter((r) => r.status !== 'success' && r.status !== 'fallback').length,
      fallbacks: fallbackRows,
      fallbackRate: rows.length ? Number((fallbackRows / rows.length).toFixed(4)) : 0,
      avgLatencyMs: rows.length ? Math.round(rows.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / rows.length) : 0,
    },
    rows: byKey.map((b) => ({
      key: b.key,
      requests: b.requests,
      tokens: b.tokens,
      costUsd: Number(b.costUsd.toFixed(6)),
      failures: b.failures,
      avgLatencyMs: b.requests ? Math.round(b.latencySum / b.requests) : 0,
    })),
  }, requestId);
});
