import { z } from 'zod';
import { db } from '@/lib/db';
import { jsonResponse, redact, secureRoute } from '@/lib/api/secure-route';

/**
 * AI security events — authenticated, validated, tenant-scoped.
 *
 * Previously: authenticated but unvalidated, the `companyId` written on create
 * came from the request body, and the listing filtered only on type/severity —
 * so any logged-in user could read every tenant's security events.
 */

const listQuery = z.object({
  type: z.string().max(80).optional(),
  severity: z.string().max(40).optional(),
  agentId: z.string().max(128).optional(),
});

const createSchema = z.object({
  type: z.string().min(1).max(80),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  agentId: z.string().max(128).optional(),
  executionId: z.string().max(128).optional(),
  userId: z.string().max(128).optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  riskScore: z.number().min(0).max(100).optional(),
  action: z.string().max(80).optional(),
  details: z.unknown().optional(),
});

export const GET = secureRoute(
  {
    resource: 'ai-security.events',
    action: 'read',
    query: listQuery,
    rateLimit: { limit: 300, windowMs: 60_000 },
  },
  async (context) => {
    const { type, severity, agentId } = context.query as z.infer<typeof listQuery>;
    const where = context.tenantWhere({
      ...(type ? { type } : {}),
      ...(severity ? { severity } : {}),
      ...(agentId ? { agentId } : {}),
    });
    const data = await db.securityEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    return jsonResponse({ data, success: true }, context.requestId);
  },
);

export const POST = secureRoute(
  {
    resource: 'ai-security.events',
    action: 'create',
    body: createSchema,
    rateLimit: { limit: 240, windowMs: 60_000 },
  },
  async (context) => {
    const { type, severity, agentId, userId, input, output, riskScore, action, details, executionId } = context.body;
    const data = await db.securityEvent.create({
      data: {
        type,
        severity,
        agentId,
        companyId: context.companyId, // never the value supplied by the client
        source: 'ai-security',
        riskScore: riskScore ?? 0,
        details: JSON.stringify({
          executionId,
          userId: userId ?? context.principal.userId,
          action: action ?? 'flagged',
          details: details ?? {},
          // Recorded redacted: payloads may carry prompts, secrets or PII.
          input: input === undefined ? undefined : redact(input),
          output: output === undefined ? undefined : redact(output),
        }),
      },
    });
    return jsonResponse({ data, success: true }, context.requestId);
  },
);
