import { z } from 'zod';
import { v1Handler, v1Body, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';
import { getExecutionEngine } from '@/lib/agent-runtime';

/**
 * POST /api/v1/agents/:id/run — execute a task with a specific agent.
 * Runs synchronously through the Agent Execution Engine (model router,
 * fallback chain, output validation, memory write-back, events).
 */

const RunSchema = z.object({
  task: z.string().trim().min(1).max(20000),
  context: z.record(z.string(), z.unknown()).optional(),
  tools: z.array(z.string()).optional(),
  maxTokens: z.number().int().positive().max(128000).optional(),
  timeoutMs: z.number().int().positive().max(600000).optional(),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  const agentIdParam = decodeURIComponent(request.nextUrl.pathname.split('/')[4]);
  const body = await v1Body<unknown>(request);
  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  const agent = await db.agent.findFirst({
    where: {
      OR: [{ agentId: agentIdParam }, { id: agentIdParam }],
      status: 'active',
      agentCompanyAccess: { some: { companyId: identity.companyId } },
    },
    select: { id: true, agentId: true, name: true },
  });
  if (!agent) throw new V1Error('Agent not found or not available to this company', 404, 'NOT_FOUND');

  const engine = getExecutionEngine();
  const result = await engine.execute({
    agentId: agent.agentId,
    companyId: identity.companyId,
    userId: identity.kind === 'session' ? identity.userId : 'anonymous',
    task: parsed.data.task,
    mode: 'sync',
    priority: parsed.data.priority,
    context: parsed.data.context,
    tools: parsed.data.tools,
    maxTokens: parsed.data.maxTokens,
    timeoutMs: parsed.data.timeoutMs,
  });

  if (result.status === 'failed' || !result.result) {
    throw new V1Error(result.error?.message ?? 'Agent execution failed', 502, 'EXECUTION_FAILED');
  }

  const metadata = (result.result.metadata ?? {}) as Record<string, unknown>;
  return {
    taskId: result.id,
    agentId: agent.agentId,
    agentName: agent.name,
    status: result.status,
    output: result.result.content,
    model: typeof metadata.model === 'string' ? metadata.model : undefined,
    tokens: result.tokenUsage?.totalTokens ?? 0,
    latencyMs: typeof metadata.latencyMs === 'number' ? metadata.latencyMs : undefined,
    validation: {
      heuristicScore: typeof metadata.heuristicValidationScore === 'number' ? metadata.heuristicValidationScore : undefined,
      heuristicPassed: typeof metadata.heuristicValidationPassed === 'boolean' ? metadata.heuristicValidationPassed : undefined,
      securityPassed: typeof metadata.securityValidationPassed === 'boolean' ? metadata.securityValidationPassed : undefined,
    },
  };
});
