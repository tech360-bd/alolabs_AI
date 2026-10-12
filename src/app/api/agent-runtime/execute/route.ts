import { z } from 'zod';
import { getExecutionEngine } from '@/lib/agent-runtime';
import { db } from '@/lib/db';
import { jsonResponse, notFound, secureRoute } from '@/lib/api/secure-route';

/**
 * Agent execution — authenticated, tenant-scoped, role-checked and rate
 * limited.
 *
 * Previously: authenticated inline, but every execution ran as the hard-coded
 * pseudo-tenant `default-company`, and an expensive model call had no rate
 * limit. Executions now run under the caller's own tenant.
 */

const ExecuteSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  task: z.string().min(1, 'task is required'),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional(),
  systemPrompt: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  tools: z.array(z.string()).optional(),
  maxTokens: z.number().int().positive().max(128000).optional(),
  timeoutMs: z.number().int().positive().max(600000).optional(),
  mode: z.enum(['sync', 'async']).optional(),
});

const EXECUTE_ROLES = ['super_admin', 'admin', 'manager', 'operator'];

export const POST = secureRoute(
  {
    resource: 'agent-runtime.execute',
    action: 'execute',
    roles: EXECUTE_ROLES,
    // Model execution is expensive: bound it per principal, not per IP.
    rateLimit: { limit: 60, windowMs: 60_000 },
    body: ExecuteSchema,
    bodyStatus: 400, // unchanged from the previous contract
  },
  async (context) => {
    const { agentId, task, priority, systemPrompt, context: taskContext, tools, maxTokens, timeoutMs, mode } = context.body;

    // Tenant-scoped lookup: an agent that is not shared with this company is
    // indistinguishable from one that does not exist.
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
      priority,
      systemPrompt,
      context: taskContext,
      tools,
      maxTokens,
      timeoutMs,
      mode,
    });

    return jsonResponse({ success: true, data: result }, context.requestId);
  },
);

export const DELETE = secureRoute(
  {
    resource: 'agent-runtime.execute',
    action: 'delete',
    roles: EXECUTE_ROLES,
    query: z.object({ taskId: z.string().min(1, 'taskId is required') }),
  },
  async (context) => {
    const cancelled = getExecutionEngine().cancel((context.query as { taskId: string }).taskId);
    return jsonResponse({ success: true, cancelled }, context.requestId);
  },
);
