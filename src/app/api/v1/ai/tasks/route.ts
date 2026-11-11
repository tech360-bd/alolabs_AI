import { v1Handler, v1Body, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireEntitlement, incrementUsage } from '@/lib/api/entitlements';
import { publicTaskResponse } from '@/lib/api/public-response';

/**
 * POST /api/v1/ai/tasks — submit an AI task for async execution.
 *
 * The caller receives an opaque task_id. Internal orchestration (which agent,
 * which model, which tools) is decided server-side and never disclosed.
 *
 * Auth: API key with scope `ai:tasks` OR session user.
 * Entitlement: active `ai-tasks` service entitlement required.
 */

const CreateTaskSchema = z.object({
  service: z.enum(['ai-chat', 'ai-knowledge-search', 'ai-tasks', 'ai-content', 'ai-analysis']).default('ai-tasks'),
  input: z.record(z.string(), z.unknown()).default({}),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  idempotency_key: z.string().max(128).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  const body = await v1Body<unknown>(request);
  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  const entitlement = await requireEntitlement(identity, parsed.data.service, 'ai:tasks');

  // Idempotency: if the caller supplied a key, check for an existing task by title.
  if (parsed.data.idempotency_key) {
    const existing = await db.task.findFirst({
      where: {
        companyId: identity.companyId,
        title: { contains: parsed.data.idempotency_key },
      },
      select: { id: true, status: true, createdAt: true, completedAt: true },
    });
    if (existing) {
      return publicTaskResponse({
        requestId: randomUUID(),
        taskId: existing.id,
        service: parsed.data.service,
        status: mapTaskStatus(existing.status),
        createdAt: existing.createdAt.toISOString(),
        completedAt: existing.completedAt?.toISOString(),
        usageUnits: 1,
      });
    }
  }

  const taskId = randomUUID();
  const task = await db.task.create({
    data: {
      id: taskId,
      companyId: identity.companyId,
      userId: identity.userId,
      status: 'pending',
      priority: parsed.data.priority === 'high' ? 'high' : parsed.data.priority === 'low' ? 'low' : 'medium',
      title: `[${parsed.data.service}] ${parsed.data.idempotency_key ?? randomUUID().slice(0, 8)}`,
      description: `AI task submitted via /v1/ai/tasks. Service: ${parsed.data.service}. Input: ${JSON.stringify(parsed.data.input).slice(0, 500)}`,
    },
  });

  await incrementUsage(entitlement.serviceId, identity.companyId, 1);

  await db.auditLog.create({
    data: {
      action: 'ai.task.created',
      resource: 'Task',
      details: JSON.stringify({
        taskId: task.id,
        service: parsed.data.service,
        companyId: identity.companyId,
        callerKind: identity.kind,
      }),
      userId: identity.userId,
    },
  }).catch(() => {});

  return publicTaskResponse({
    requestId: randomUUID(),
    taskId: task.id,
    service: parsed.data.service,
    status: 'pending',
    createdAt: task.createdAt.toISOString(),
    usageUnits: 1,
  });
});

/**
 * GET /api/v1/ai/tasks — list the caller's tasks (tenant-scoped).
 * Returns sanitized public DTOs only — no agent/model/internal fields.
 */
export const GET = v1Handler(async ({ identity }, request) => {
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10) || 20));
  const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10) || 0);

  const tasks = await db.task.findMany({
    where: { companyId: identity.companyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true,
      status: true,
      title: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return {
    tasks: tasks.map((t) => ({
      task_id: t.id,
      service: t.title.startsWith('[') ? t.title.slice(1, t.title.indexOf(']')) : t.title,
      status: mapTaskStatus(t.status),
      created_at: t.createdAt.toISOString(),
      completed_at: t.completedAt?.toISOString() ?? null,
    })),
    limit,
    offset,
    has_more: tasks.length === limit,
  };
});

function mapTaskStatus(internal: string): 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' {
  switch (internal) {
    case 'pending': return 'pending';
    case 'running': case 'in_progress': return 'running';
    case 'completed': case 'succeeded': return 'completed';
    case 'failed': case 'error': return 'failed';
    case 'cancelled': case 'canceled': return 'cancelled';
    default: return 'pending';
  }
}
