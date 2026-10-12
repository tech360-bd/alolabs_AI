import { z } from 'zod';
import { db } from '@/lib/db';
import { badRequest, jsonResponse, secureRoute } from '@/lib/api/secure-route';

/**
 * Log ingestion and pruning — authenticated, validated and role-gated.
 *
 * Previously: an inline token check only, no validation of `level`, and the
 * `companyId` written with each entry came from the request body, so any
 * authenticated caller could attribute log entries to another tenant. Pruning
 * (a destructive, cross-tenant operation) had no role check at all.
 */

const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'warning', 'error', 'fatal'] as const;

const logEntrySchema = z.object({
  level: z.enum(VALID_LOG_LEVELS),
  message: z.string().min(1).max(4000),
  source: z.string().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  agentId: z.string().max(128).optional(),
});

export const POST = secureRoute(
  {
    resource: 'logs.ingest',
    action: 'create',
    body: logEntrySchema,
    bodyStatus: 400, // unchanged from the previous contract
    rateLimit: { limit: 600, windowMs: 60_000 },
  },
  async (context) => {
    const { level, message, source, metadata, agentId } = context.body;
    const data = await db.serverLog.create({
      data: {
        level,
        message,
        metadata: JSON.stringify({
          ...(metadata ?? {}),
          source: source ?? null,
          agentId: agentId ?? null,
          companyId: context.companyId,
          userId: context.principal.userId,
        }),
      },
    });
    return jsonResponse({ data, success: true }, context.requestId);
  },
);

export const DELETE = secureRoute(
  {
    resource: 'logs.prune',
    action: 'delete',
    roles: ['super_admin', 'admin'],
    query: z.object({ olderThan: z.string().min(1, 'olderThan query parameter is required (ISO date string)') }),
    bodyStatus: 400,
  },
  async (context) => {
    const olderThan = (context.query as { olderThan: string }).olderThan;
    const cutoff = new Date(olderThan);
    if (Number.isNaN(cutoff.getTime())) throw badRequest('Invalid date format for olderThan');

    const [serverLogResult, errorLogResult] = await Promise.all([
      db.serverLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      db.errorLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    ]);

    return jsonResponse(
      {
        data: {
          serverLogsDeleted: serverLogResult.count,
          errorLogsDeleted: errorLogResult.count,
          totalDeleted: serverLogResult.count + errorLogResult.count,
          olderThan,
        },
      },
      context.requestId,
    );
  },
);
