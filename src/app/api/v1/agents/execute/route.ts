import { z } from 'zod';
import { getExecutionEngine } from '@/lib/agent-runtime';
import { db } from '@/lib/db';
import { jsonResponse, notFound, secureRoute } from '@/lib/api/secure-route';

/**
 * V1 agent execution — authenticated, tenant-aware, validated and rate limited.
 *
 * Previously: a bare inline token check, `companyId: user.userId` (a user id
 * used as a tenant id), no tenant check on the agent lookup and a `deleteMany`
 * keyed only on the agent id. This version keeps the public v1 response shape
 * but executes under the caller's real tenant.
 */

const executeSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  task: z.string().min(1, 'task is required'),
  maxTokens: z.number().int().positive().max(128000).optional(),
  timeoutMs: z.number().int().positive().max(600000).optional(),
});

export const POST = secureRoute(
  {
    resource: 'agent-runtime.execute.v1',
    action: 'execute',
    roles: ['super_admin', 'admin', 'manager', 'operator'],
    rateLimit: { limit: 60, windowMs: 60_000 },
    body: executeSchema,
    bodyStatus: 400, // unchanged from the previous contract
  },
  async (context) => {
    const { agentId, task, maxTokens, timeoutMs } = context.body;

    const agent = await db.agent.findFirst({
      where: { agentId, agentCompanyAccess: { some: { companyId: context.companyId } } },
      select: { id: true },
    });
    if (!agent) throw notFound('Agent not found');

    const engine = getExecutionEngine();
    const result = await engine.execute({
      agentId,
      companyId: context.companyId,
      userId: context.principal.userId,
      task,
      maxTokens,
      timeoutMs,
    });

    return jsonResponse({ success: true, data: result }, context.requestId);
  },
);

export const DELETE = secureRoute(
  {
    resource: 'agent-runtime.execute.v1',
    action: 'delete',
    roles: ['super_admin', 'admin', 'manager', 'operator'],
    body: z.object({ agentId: z.string().min(1, 'agentId is required') }),
    bodyStatus: 400,
  },
  async (context) => {
    const { agentId } = context.body;
    const result = await db.agentRun.deleteMany({ where: { agentId, companyId: context.companyId } });
    return jsonResponse({ success: true, data: { deleted: result.count } }, context.requestId);
  },
);
