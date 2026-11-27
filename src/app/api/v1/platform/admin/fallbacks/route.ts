/**
 * GET /api/v1/platform/admin/fallbacks
 *
 * The fallback audit log: what was asked for, what was tried, what answered and
 * why the earlier candidates did not. This is the evidence that the fallback
 * engine is behaving, and it is what an operator reads after a complaint about
 * slow or inconsistent answers.
 *
 * Query: ?hours=24&limit=50&outcome=success|exhausted
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { platformRoute, json } from '@/lib/platform/http';
import { requirePlatformAdmin } from '@/lib/platform/admin';

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(720).default(24),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  outcome: z.enum(['success', 'exhausted']).optional(),
});

interface AttemptShape {
  provider?: string;
  model?: string;
  deploymentId?: string;
  ok?: boolean;
  errorClass?: string;
  httpStatus?: number;
  coolDownMs?: number;
  retryAfterMs?: number;
  message?: string;
}

export const GET = platformRoute({ query: querySchema, allowCompanyScope: true }, async ({ request, query, requestId }) => {
  await requirePlatformAdmin(request);
  const since = new Date(Date.now() - query.hours * 60 * 60 * 1000);

  const [events, totals] = await Promise.all([
    db.aiFallbackEvent.findMany({
      where: {
        createdAt: { gte: since },
        ...(query.outcome ? { outcome: query.outcome } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      select: {
        id: true,
        workspaceId: true,
        projectId: true,
        requestedModel: true,
        taskType: true,
        attempts: true,
        finalProvider: true,
        finalModel: true,
        outcome: true,
        errorClass: true,
        createdAt: true,
      },
    }),
    db.aiFallbackEvent.groupBy({
      by: ['outcome', 'errorClass'],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    }),
  ]);

  return json({
    window: { hours: query.hours, since: since.toISOString() },
    totals: totals.map((row) => ({ outcome: row.outcome, errorClass: row.errorClass, count: row._count.id })),
    events: events.map((event) => {
      let attempts: AttemptShape[] = [];
      try {
        const parsed: unknown = JSON.parse(event.attempts);
        if (Array.isArray(parsed)) attempts = parsed as AttemptShape[];
      } catch {
        attempts = [];
      }
      return {
        id: event.id,
        at: event.createdAt.toISOString(),
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        requested: event.requestedModel,
        task: event.taskType,
        outcome: event.outcome,
        errorClass: event.errorClass,
        finalProvider: event.finalProvider,
        finalModel: event.finalModel,
        // Flattened for display; the raw JSON is not useful in a table cell.
        attempts: attempts.map((attempt) => ({
          deployment: attempt.deploymentId ?? `${attempt.provider}:${attempt.model}`,
          ok: Boolean(attempt.ok),
          ...(attempt.errorClass ? { errorClass: attempt.errorClass } : {}),
          ...(attempt.httpStatus ? { httpStatus: attempt.httpStatus } : {}),
          ...(attempt.coolDownMs ? { coolDownMs: attempt.coolDownMs } : {}),
        })),
      };
    }),
  }, requestId);
});
